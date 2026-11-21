import {homedir} from 'node:os';
import {resolve, sep} from 'node:path';
import type {Config} from '../config.ts';

export const permissions = ['allowRead', 'allowWrite', 'denyRead', 'denyWrite'] as const;
export const accessOptions = [
  {label: 'Read/Write', rules: ['allowRead', 'allowWrite']},
  {label: 'Read only', rules: ['allowRead', 'denyWrite']},
  {label: 'No access', rules: ['denyRead', 'denyWrite']},
  {label: 'Remove rule', rules: []},
] as const;
export type Permission = typeof permissions[number];
export type Entry = NonNullable<NonNullable<Config['filesystem']>['denyRead']>[number];

/**
 * Keeps rule spellings distinct: a relative Global rule can cover more than its absolute counterpart.
 */
export function entryKey(entry: Entry): string {
  if (typeof entry !== 'string' && (entry.path === undefined || entry.literal !== true)) {
    throw new Error('Invalid filesystem path entry.');
  }

  return JSON.stringify(entry);
}

/**
 * Resolves project-relative input without treating home-relative paths as project paths.
 */
export function resolveLocation(cwd: string, path: string): string {
  return resolve(cwd, path === '~' || path.startsWith('~/') || (sep === '\\' && path.startsWith('~\\'))
    ? `${homedir()}${path.slice(1)}`
    : path);
}

/**
 * Distinguishes literal rules from patterns and prevents paths from injecting terminal controls.
 */
export function displayLocation(entry: Entry): string {
  return (typeof entry === 'string' ? entry : `${entry.path} (literal)`).replaceAll(/\p{Control}/gv, '�');
}

/**
 * Describes exactly the stored rule instead of guessing access through inherited or overlapping rules.
 */
export function accessLabel(rules: readonly Permission[]): string {
  return rules.length === 0 ? 'Default' : accessOptions.find(option => option.rules.length === rules.length && option.rules.every(rule => rules.includes(rule)))?.label ?? 'Custom';
}
