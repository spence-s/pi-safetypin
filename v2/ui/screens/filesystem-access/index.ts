import type {ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {getConfigStores, loadConfig} from '../../../config/index.ts';
import {
  permissions,
  type Entry,
  type Permission,
} from '../../utilities.ts';
import {editLocation} from './edit-location.ts';
import {showLocations} from './locations.ts';

/**
 * Reloads policy between edits while keeping writes confined to the selected scopes.
 */
export async function showFileSystemAccess(ctx: ExtensionCommandContext): Promise<void> {
  if (ctx.mode !== 'tui') {
    return;
  }

  const {cwd, ui} = ctx;
  const {globalStore, projectStore} = getConfigStores(cwd);
  const scopes = [
    {source: 'Global', label: 'Global · All projects', store: globalStore},
    {source: 'Local', label: 'Local · This project', store: projectStore},
  ];
  let selectedId: string | undefined;

  try {
    while (true) {
      const effectiveConfig = await loadConfig(cwd);

      /**
       * The selection screen awaits the user selection
       */
      const selection = await showLocations(ctx, effectiveConfig, scopes, selectedId);

      if (selection === undefined) {
        return;
      }

      const {id, locations} = selection;
      selectedId = id;

      /**
       * Once we have a selection we show the edit screen and await an edit rule response
       */
      const edit = await editLocation(ctx, id, locations, scopes);

      if (edit === undefined) {
        continue;
      }

      const {entry, entryId, option, destinations} = edit;

      for (const {store} of destinations) {
        const config = await store.load();
        const filesystem = {...config.filesystem};
        const nextRules: readonly Permission[] = option.rules;

        for (const permission of permissions) {
          const entries = filesystem[permission];
          const remaining: Entry[] = [];
          let isRemoved = false;
          for (const rule of entries ?? []) {
            if (typeof rule !== 'string' && (rule.path === undefined || rule.literal !== true)) {
              throw new Error('Invalid filesystem path entry.');
            }

            if (JSON.stringify(rule) === entryId) {
              isRemoved = true;
            } else {
              remaining.push(rule);
            }
          }

          if (nextRules.includes(permission)) {
            filesystem[permission] = [...remaining, entry];
          } else if (isRemoved) {
            filesystem[permission] = remaining;
          }
        }

        store.config = {...config, filesystem};
        await store.save();
      }

      selectedId = entryId;
      ui.notify(option.rules.length === 0
        ? 'Rule removed. Changes apply after restarting Pi.'
        : `Saved to ${destinations[0]?.source}. Changes apply after restarting Pi.`, 'info');
    }
  } catch (error) {
    ui.notify(`Filesystem settings: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}
