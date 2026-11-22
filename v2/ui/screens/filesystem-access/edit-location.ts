import {homedir} from 'node:os';
import {
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import type {ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import type {ConfigStore} from '../../../config/index.ts';
import {accessOptions, type Entry, type Permission} from '../../utilities.ts';

const globChars = /[*?\[\]\{\}]/v;

/**
 * Collects a complete edit before the parent writes any configuration.
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
  const access = await ui.select(`Access for ${pathLabel}`, options.map(option => option.label));
  const option = options.find(option => option.label === access);

  if (option === undefined) {
    return;
  }

  let destinations = scopes.filter(({source}) => existingRules?.has(source));
  if (option.rules.length > 0) {
    const scope = await ui.select(`Save “${option.label}” for ${pathLabel} to`, scopes.map(({label}) => label));
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
