import {homedir} from 'node:os';
import {
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import {getSelectListTheme, type ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {Container, SelectList, Text} from '@earendil-works/pi-tui';
import type {ConfigStore} from '../../../config/index.ts';
import {accessOptions, type Entry, type Permission} from '../../utilities.ts';

const globChars = /[*?\[\]\{\}]/v;

/**
 * Starts from the configured access and scope before collecting an edit without writing configuration.
 */
export async function editLocation(
  {cwd, ui}: ExtensionCommandContext,
  id: string,
  locations: Map<string, {entry: Entry; rules: Map<string, Permission[]>}>,
  scopes: Array<{source: string; label: string; store: ConfigStore}>,
) {
  const location = locations.get(id);

  let entry = location?.entry;

  if (entry === undefined) {
    const value = await ui.input('Location (absolute or relative to this project)');
    if (value === undefined) {
      return;
    }

    const input = value.trim();
    if (input === '' || /\p{Control}/v.test(input)) {
      ui.notify('Enter a valid file or folder path.', 'warning');
      return;
    }

    const path = resolve(
      cwd,
      input === '~' || input.startsWith('~/') || (sep === '\\' && input.startsWith('~\\'))
        ? `${homedir()}${input.slice(1)}`
        : input,
    );

    entry = globChars.test(path) ? {path, literal: true} : path;
  }

  if (typeof entry !== 'string' && (entry.path === undefined || entry.literal !== true)) {
    throw new Error('Invalid filesystem path entry.');
  }

  const entryId = JSON.stringify(entry);
  const existingRules = locations.get(entryId)?.rules;
  const storedPath = typeof entry === 'string' ? entry : entry.path ?? '';
  let displayPath = storedPath;
  if (storedPath === homedir()) {
    displayPath = '~';
  } else if (existingRules?.has('Local') && !existingRules.has('Global') && isAbsolute(storedPath)) {
    displayPath = relative(cwd, storedPath);
    if (displayPath === '') {
      displayPath = '.';
    }
  } else if (storedPath.startsWith(`${homedir()}${sep}`)) {
    displayPath = `~${storedPath.slice(homedir().length)}`;
  }

  const pathLabel = (typeof entry === 'string' ? displayPath : `${displayPath} (literal)`).replaceAll(/\p{Control}/gv, '�');
  const options = (existingRules?.size ?? 0) > 0 ? accessOptions : accessOptions.slice(0, -1);
  const currentSource = existingRules?.has('Local') ? 'Local' : 'Global';
  const currentRules = existingRules?.get(currentSource);
  const selectedIndex = options.findIndex(option => option.rules.length === currentRules?.length
    && option.rules.every(rule => currentRules.includes(rule)));
  const access = await ui.custom<string | undefined>((tui, theme, _keybindings, done) => {
    const container = new Container();
    const title = theme.fg('accent', theme.bold(`Access for ${pathLabel}`));
    container.addChild(new Text(title, 0, 1));
    const list = new SelectList(options.map(option => ({value: option.label, label: option.label})), options.length, getSelectListTheme());
    list.setSelectedIndex(Math.max(0, selectedIndex));
    list.onSelect = item => {
      done(item.value);
    };

    list.onCancel = () => {
      done(undefined);
    };

    container.addChild(list);
    return Object.assign(container, {
      /**
       * Keeps keyboard navigation on the access list beneath the title.
       */
      handleInput(data: string) {
        list.handleInput(data);
        tui.requestRender();
      },
    });
  });
  const option = options.find(option => option.label === access);

  if (option === undefined) {
    return;
  }

  let destinations = scopes.filter(({source}) => existingRules?.has(source));
  if (option.rules.length > 0) {
    const scope = await ui.custom<string | undefined>((tui, theme, _keybindings, done) => {
      const container = new Container();
      const title = theme.fg('accent', theme.bold(`Save “${option.label}” for ${pathLabel} to`));
      container.addChild(new Text(title, 0, 1));
      const list = new SelectList(scopes.map(({label}) => ({value: label, label})), scopes.length, getSelectListTheme());
      list.setSelectedIndex(Math.max(0, scopes.findIndex(({source}) => source === currentSource)));
      list.onSelect = item => {
        done(item.value);
      };

      list.onCancel = () => {
        done(undefined);
      };

      container.addChild(list);
      return Object.assign(container, {
        /**
         * Keeps keyboard navigation on the scope list beneath the title.
         */
        handleInput(data: string) {
          list.handleInput(data);
          tui.requestRender();
        },
      });
    });
    const destination = scopes.find(({label}) => label === scope);
    if (destination === undefined) {
      return;
    }

    destinations = [destination];
  }

  return {
    entry, entryId, option, destinations,
  };
}
