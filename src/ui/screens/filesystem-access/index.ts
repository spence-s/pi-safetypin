import type {ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {merge} from 'object-deep-merge';
import {getConfigStores, getDefaultConfig} from '../../../config/index.ts';
import {
  permissions,
  type Entry,
  type Permission,
} from '../../utilities.ts';
import {editLocation} from './edit-location.ts';
import {showLocations} from './locations.ts';

/**
 * Loads the same scope stores used by the list so source rules and effective access stay in sync.
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
      const [defaults, global, project] = await Promise.all([
        getDefaultConfig(cwd),
        globalStore.load(),
        projectStore.load(),
      ]);
      const effectiveConfig = merge(defaults, global, project);

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
        const filesystem = {...config.sandbox?.filesystem};
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

        store.config = {...config, sandbox: {...config.sandbox, filesystem}};
        await store.save();
      }

      selectedId = entryId;
      ui.notify(option.rules.length === 0
        ? 'Rule removed. Changes apply after /reload or restarting Pi.'
        : `Saved to ${destinations[0]?.source}. Changes apply after /reload or restarting Pi.`, 'info');
    }
  } catch (error) {
    ui.notify(`Filesystem settings: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}
