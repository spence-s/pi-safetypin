import {homedir} from 'node:os';
import {join} from 'node:path';
import process from 'node:process';
import {merge} from 'object-deep-merge';
import {getDefaultConfig} from './defaults.ts';
import {ConfigStore} from './store.ts';
import type {Config} from './schema.ts';
/**
 * Allows deeply nested configuration overrides without requiring complete objects.
 *
 * @remarks
 * For types extending `Record<string, unknown>`, every property becomes optional
 * and its value is recursively transformed. Each property also explicitly accepts
 * `undefined`, so callers can assign it even with `exactOptionalPropertyTypes`
 * enabled; an optional property alone would only permit omitting the property.
 *
 * Arrays and readonly arrays become mutable arrays of recursively transformed
 * elements. Tuple lengths and readonly array modifiers are not preserved. Array
 * elements do not gain `undefined` unless their original type already includes it.
 *
 * Other types, including primitives and types that do not extend the record
 * constraint, are left unchanged. Conditional types distribute over unions, so
 * each union member is transformed independently. This is a compile-time type
 * only: it neither validates nor changes configuration values at runtime.
 *
 * @typeParam T - The complete type from which partial configuration is derived.
 */
export type PartialWithUndefined<T> = T extends ReadonlyArray<infer Item>
  ? Array<PartialWithUndefined<Item>>
  : T extends Record<string, unknown>
    ? {[Key in keyof T]?: PartialWithUndefined<T[Key]> | undefined}
    : T;

/**
     * Lets the settings UI and sandbox find the same files without merging their rules.
     */
export function getConfigStores(cwd: string) {
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent');
  return {
    globalStore: new ConfigStore(join(agentDir, 'safetypin.json')),
    projectStore: new ConfigStore(join(cwd, '.pi', 'safetypin.json')),
  };
}

/**
 * Adds network entries instead of replacing them so every scope's restrictions survive.
 */
export function mergeConfigs(base: Config, ...overrides: Config[]): Config {
  const config = merge(base, {}, ...overrides);
  return {
    ...config,
    sandbox: {
      ...config.sandbox,
      network: [base, ...overrides].flatMap(scope => scope.sandbox?.network ?? []),
    },
  };
}

/**
 * Applies defaults at load time so settings files only contain user-supplied rules.
 */
export async function loadConfig(cwd: string): Promise<Config> {
  const {globalStore, projectStore} = getConfigStores(cwd);
  const [defaults, global, project] = await Promise.all([
    getDefaultConfig(cwd),
    globalStore.load(),
    projectStore.load(),
  ]);
  return mergeConfigs(defaults, global, project);
}
