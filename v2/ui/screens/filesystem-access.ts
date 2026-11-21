import {homedir} from 'node:os';
import {parse} from 'node:path';
import {getSettingsListTheme, type ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {
  Container,
  SettingsList,
  Text,
  truncateToWidth,
  visibleWidth,
} from '@earendil-works/pi-tui';
import {getConfigStores} from '../../config.ts';
import {
  accessLabel,
  accessOptions,
  displayLocation,
  entryKey,
  permissions,
  resolveLocation,
  type Entry,
  type Permission,
} from '../utilities.ts';

const globChars = /[*?\[\]\{\}]/v;

/**
 * Keeps both scopes visible while requiring an explicit destination for each saved edit.
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
  const builtIns = new Map([
    [parse(cwd).root, 'Filesystem root'],
    [homedir(), 'Home folder'],
    [cwd, 'Project folder'],
  ]);
  let selectedId: string | undefined;

  try {
    while (true) {
      await Promise.all(scopes.map(async ({store}) => store.load()));
      const locations = new Map<string, {entry: Entry; rules: Map<string, Permission[]>}>();
      for (const path of builtIns.keys()) {
        const entry = globChars.test(path) ? {path, literal: true} as const : path;
        locations.set(entryKey(entry), {entry, rules: new Map()});
      }

      for (const {source, store} of scopes) {
        for (const permission of permissions) {
          for (const entry of store.config.filesystem?.[permission] ?? []) {
            const id = entryKey(entry);
            const location = locations.get(id) ?? {entry, rules: new Map<string, Permission[]>()};
            const rules = location.rules.get(source) ?? [];
            if (!rules.includes(permission)) {
              rules.push(permission);
            }

            location.rules.set(source, rules);
            locations.set(id, location);
          }
        }
      }

      const items = locations.entries().map(([id, {entry, rules}]) => {
        const path = displayLocation(entry);
        const builtIn = builtIns.get(typeof entry === 'string' ? entry : entry.path ?? '');
        const scopedRules = rules.values().toArray();
        const access = scopedRules.length === 2 && scopedRules[0]?.join(',') !== scopedRules[1]?.join(',')
          ? 'Mixed'
          : accessLabel(scopedRules[0] ?? []);
        const details = rules.entries().map(([source, entries]) => `${source}: ${accessLabel(entries)} (${entries.join(', ')})`).toArray().join(' · ');
        const sources = rules.keys().toArray().join(' + ');
        return {
          id,
          label: truncateToWidth(builtIn === undefined ? path : `${builtIn} (${path})`, 36),
          currentValue: `${access.padEnd(12)}${sources === '' ? 'Built in' : sources}`,
          description: details === '' ? `${path} · No explicit rules. Select to add one.` : `${path} · ${details}`,
          values: [''],
        };
      }).toArray();
      items.push({
        id: '', label: 'Add a location…', currentValue: '', description: 'Enter a file or folder path, then choose its access and scope.', values: [''],
      });

      const initialId = selectedId;
      const id = await ui.custom<string | undefined>((tui, theme, _keybindings, done) => {
        const labelWidth = Math.max(...items.map(item => visibleWidth(item.label)));
        const container = new Container();
        const title = theme.fg('accent', theme.bold('Filesystem Access'));
        const subtitle = theme.fg('muted', 'Saved rules, not live access. Global and Local rules combine.');
        const header = theme.fg('dim', `  ${'Location'.padEnd(labelWidth)}  ${'Access'.padEnd(12)}Source`);
        container.addChild(new Text(title, 0, 0));
        container.addChild(new Text(subtitle, 0, 1));
        container.addChild(new Text(header, 0, 0));
        const settings = new SettingsList(items, 15, getSettingsListTheme(), done, () => {
          done(undefined);
        });
        if (initialId !== undefined) {
          settings.selectItem(initialId);
        }

        container.addChild(settings);
        return Object.assign(container, {
          /**
           * Keeps keyboard navigation on the list while the container lays out the header.
           */
          handleInput(data: string) {
            settings.handleInput(data);
            tui.requestRender();
          },
        });
      });
      if (id === undefined) {
        return;
      }

      selectedId = id;
      const location = locations.get(id);
      let entry = location?.entry;
      if (entry === undefined) {
        const value = await ui.input('Location (absolute or relative to this project)');
        if (value === undefined) {
          continue;
        }

        const input = value.trim();
        if (input === '' || /\p{Control}/v.test(input)) {
          ui.notify('Enter a valid file or folder path.', 'warning');
          continue;
        }

        const path = resolveLocation(cwd, input);
        entry = globChars.test(path) ? {path, literal: true} : path;
      }

      const entryId = entryKey(entry);
      const existingRules = locations.get(entryId)?.rules;
      const pathLabel = displayLocation(entry);
      const options = (existingRules?.size ?? 0) > 0 ? accessOptions : accessOptions.slice(0, -1);
      const access = await ui.select(`Access for ${pathLabel}`, options.map(option => option.label));
      const option = options.find(option => option.label === access);
      if (option === undefined) {
        continue;
      }

      const destinations = option.rules.length === 0 ? scopes.filter(({source}) => existingRules?.has(source)) : scopes;
      const scope = await ui.select(`Save “${option.label}” for ${pathLabel} to`, destinations.map(({label}) => label));
      const destination = destinations.find(({label}) => label === scope);
      if (destination === undefined) {
        continue;
      }

      const {store, source} = destination;
      const config = await store.load();
      const filesystem = {...config.filesystem};
      /**
       * Reuses the row identity so only this location's entries are replaced.
       */
      const isMatch = (rule: Entry) => entryKey(rule) === entryId;
      const nextRules: readonly Permission[] = option.rules;
      for (const permission of permissions) {
        const entries = filesystem[permission];
        if (nextRules.includes(permission)) {
          filesystem[permission] = [...(entries ?? []).filter(rule => !isMatch(rule)), entry];
        } else if (entries?.some(rule => isMatch(rule))) {
          filesystem[permission] = entries.filter(rule => !isMatch(rule));
        }
      }

      store.config = {...config, filesystem};
      await store.save();
      selectedId = entryId;
      ui.notify(`Saved to ${source}. Changes apply after restarting Pi.`, 'info');
    }
  } catch (error) {
    ui.notify(`Filesystem settings: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}
