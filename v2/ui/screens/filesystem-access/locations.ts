import {homedir} from 'node:os';
import {
  isAbsolute,
  matchesGlob,
  parse,
  relative,
  resolve,
  sep,
} from 'node:path';
import {getSettingsListTheme, type ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {
  Container,
  SettingsList,
  Text,
  truncateToWidth,
  visibleWidth,
} from '@earendil-works/pi-tui';
import type {Config, ConfigStore} from '../../../config/index.ts';
import {
  accessOptions,
  permissions,
  type Entry,
  type Permission,
} from '../../utilities.ts';

const globChars = /[*?\[\]\{\}]/v;

/**
 * Keeps the configured-access summary and list navigation separate from edits and writes.
 */
export async function showLocations(
  {cwd, ui}: ExtensionCommandContext,
  effectiveConfig: Config,
  scopes: Array<{source: string; store: ConfigStore}>,
  selectedId: string | undefined,
) {
  const builtIns = new Map([
    [parse(cwd).root, 'Root'],
    [homedir(), 'Home'],
    [cwd, 'cwd'],
  ]);
  const locations = new Map<string, {entry: Entry; rules: Map<string, Permission[]>}>();

  for (const path of builtIns.keys()) {
    const entry = globChars.test(path) ? {path, literal: true} as const : path;
    locations.set(JSON.stringify(entry), {entry, rules: new Map()});
  }

  for (const {source, store} of scopes) {
    for (const permission of permissions) {
      for (const entry of store.config.filesystem?.[permission] ?? []) {
        if (typeof entry !== 'string' && (entry.path === undefined || entry.literal !== true)) {
          throw new Error('Invalid filesystem path entry.');
        }

        const id = JSON.stringify(entry);
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
    const storedPath = typeof entry === 'string' ? entry : entry.path ?? '';
    let displayPath = storedPath;
    if (storedPath === homedir()) {
      displayPath = '~';
    } else if (rules.has('Local') && !rules.has('Global') && isAbsolute(storedPath)) {
      displayPath = relative(cwd, storedPath);
      if (displayPath === '') {
        displayPath = '.';
      }
    } else if (storedPath.startsWith(`${homedir()}${sep}`)) {
      displayPath = `~${storedPath.slice(homedir().length)}`;
    }

    const path = (typeof entry === 'string' ? displayPath : `${displayPath} (literal)`).replaceAll(/\p{Control}/gv, '�');
    const builtIn = builtIns.get(storedPath);
    // shortcut: Node glob matching summarizes configured paths; use runtime probes for platform-specific glob, symlink, and protected-file behavior.
    const locationPath = resolve(cwd, storedPath === '~' || storedPath.startsWith(`~${sep}`)
      ? `${homedir()}${storedPath.slice(1)}`
      : storedPath);
    let readAllowDepth = -1;
    let readDenyDepth = -1;
    let isWriteAllowed = false;
    let isWriteDenied = false;
    for (const permission of permissions) {
      for (const rule of effectiveConfig.filesystem?.[permission] ?? []) {
        if (typeof rule !== 'string' && (rule.path === undefined || rule.literal !== true)) {
          throw new Error('Invalid filesystem path entry.');
        }

        const rulePath = typeof rule === 'string' ? rule : rule.path ?? '';
        const resolvedRule = resolve(cwd, rulePath === '~' || rulePath.startsWith(`~${sep}`)
          ? `${homedir()}${rulePath.slice(1)}`
          : rulePath);
        const isPattern = typeof rule === 'string' && globChars.test(rule);
        let matchDepth = -1;
        let ancestor: string | undefined = locationPath;
        while (ancestor !== undefined && matchDepth === -1) {
          if (isPattern ? matchesGlob(ancestor, resolvedRule) : ancestor === resolvedRule) {
            matchDepth = ancestor.split(sep).length;
          }

          const parent = resolve(ancestor, '..');
          ancestor = parent === ancestor ? undefined : parent;
        }

        readAllowDepth = Math.max(readAllowDepth, permission === 'allowRead' ? matchDepth : -1);
        readDenyDepth = Math.max(readDenyDepth, permission === 'denyRead' ? matchDepth : -1);
        isWriteAllowed ||= permission === 'allowWrite' && matchDepth !== -1;
        isWriteDenied ||= permission === 'denyWrite' && matchDepth !== -1;
      }
    }

    const isReadable = readDenyDepth === -1 || readAllowDepth >= readDenyDepth;
    const isWritable = isWriteAllowed && !isWriteDenied;
    const access = isReadable
      ? (isWritable ? 'Read/Write' : 'Read only')
      : (isWritable ? 'Write only' : 'No access');

    const scopeDetails: string[] = [];
    for (const [source, entries] of rules) {
      let label = 'Default';
      if (entries.length > 0) {
        const read = entries.includes('allowRead')
          ? (entries.includes('denyRead') ? 'allowed and denied' : 'allowed')
          : (entries.includes('denyRead') ? 'denied' : '');
        const write = entries.includes('allowWrite')
          ? (entries.includes('denyWrite') ? 'allowed and denied' : 'allowed')
          : (entries.includes('denyWrite') ? 'denied' : '');
        label = entries.length === 1 && entries.includes('allowRead')
          ? 'Read only'
          : [read === '' ? '' : `Read ${read}`, write === '' ? '' : `Write ${write}`].filter(part => part !== '').join('; ');
        for (const option of accessOptions) {
          if (option.rules.length === entries.length && option.rules.every(rule => entries.includes(rule))) {
            label = option.label;
          }
        }
      }

      scopeDetails.push(`${source}: ${label} (${entries.join(', ')})`);
    }

    const details = scopeDetails.join(' · ');
    const sources = rules.keys().toArray().join(' + ');
    return {
      id,
      label: truncateToWidth(builtIn === undefined ? path : `${builtIn} (${path})`, 36),
      currentValue: `${access.padEnd(12)}  ${sources === '' ? 'Built in' : sources}`,
      description: details === '' ? `${path} · ${access} from defaults or inherited rules. Select to add a rule.` : `${path} · ${details}`,
      values: [''],
    };
  }).toArray();

  items.push({
    id: '', label: 'Add filesystem rule…', currentValue: '', description: 'Enter a file or folder path, then choose its access and scope.', values: [''],
  });

  const id = await ui.custom<string | undefined>((tui, theme, _keybindings, done) => {
    const labelWidth = Math.max(...items.map(item => visibleWidth(item.label)));
    const container = new Container();
    const title = theme.fg('accent', theme.bold('Filesystem Access'));
    const subtitle = theme.fg('muted', 'Configured access · Defaults + Global + Local · Changes apply after /reload or restarting Pi.');
    const header = theme.fg('dim', `  ${'Location'.padEnd(labelWidth)}  ${'Access'.padEnd(12)}  Source`);
    container.addChild(new Text(title, 0, 0));
    container.addChild(new Text(subtitle, 0, 1));
    container.addChild(new Text(header, 0, 0));
    const settings = new SettingsList(items, 15, getSettingsListTheme(), done, () => {
      done(undefined);
    });
    if (selectedId !== undefined) {
      settings.selectItem(selectedId);
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

  return id === undefined ? undefined : {id, locations};
}
