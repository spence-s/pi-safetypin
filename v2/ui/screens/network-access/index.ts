import type {ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {getConfigStores} from '../../../config/index.ts';
import {showDestinations} from './destinations.ts';
import {editRule} from './edit-rule.ts';
import type {NetworkScope} from './utilities.ts';

/**
 * Reloads both scopes after editing so immediately saved rules appear in the destination list.
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

      selectedId = await editRule(ctx, selection, entries, scopes) ?? selection;
    }
  } catch (error) {
    ctx.ui.notify(`Network settings: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}
