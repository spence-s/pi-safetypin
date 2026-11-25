import type {ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {getConfigStores} from '../../../config/index.ts';
import {showDestinations} from './destinations.ts';
import {editRule} from './edit-rule.ts';
import type {NetworkScope} from './utilities.ts';

/**
 * Reloads both scopes between edits and writes only the scope explicitly selected by the user.
 */
export async function showNetworkAccess(ctx: ExtensionCommandContext): Promise<void> {
  if (ctx.mode !== 'tui') {
    return;
  }

  const {globalStore, projectStore} = getConfigStores(ctx.cwd);
  const scopes: NetworkScope[] = [
    {source: 'Local', label: 'Local · This project', store: projectStore},
    {source: 'Global', label: 'Global · All projects', store: globalStore},
  ];
  let selectedId: string | undefined;
  try {
    while (true) {
      await Promise.all(scopes.map(async ({store}) => store.load()));
      const entries = scopes.flatMap(({source, store}) => (store.config.sandbox?.network ?? []).map(rule => ({scope: source, rule})));
      const selection = await showDestinations(ctx, entries, selectedId);
      if (selection === undefined) {
        return;
      }

      selectedId = selection;
      const edit = await editRule(ctx, selection, entries, scopes);
      if (edit === undefined) {
        continue;
      }

      const {destination, target, rule} = edit;
      selectedId = destination;
      const config = await target.store.load();
      const network = (config.sandbox?.network ?? []).filter(entry => entry.destination !== destination);
      if (rule !== undefined) {
        network.push(rule);
      }

      target.store.config = {...config, sandbox: {...config.sandbox, network}};
      await target.store.save();
      ctx.ui.notify(`${rule === undefined ? 'Removed from' : 'Saved to'} ${target.source}. Changes apply after /reload or restarting Pi.`, 'info');
    }
  } catch (error) {
    ctx.ui.notify(`Network settings: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}
