import {resolve} from 'node:path';
import process from 'node:process';
import {merge} from 'object-deep-merge';
import {loadConfig, type Config} from './config.ts';
import {Sandbox} from './sandbox.ts';

export {loadConfig, type Config} from './config.ts';
export {parseConfig} from './schema.ts';

/**
 * Shares the configured sandbox without taking ownership of when it runs.
 */
export async function getSandbox(options: {cwd?: string} & (
  | {config: Config; overrides?: never}
  | {config?: never; overrides?: Config}
) = {}): Promise<Sandbox> {
  const {config, overrides} = options;
  if ('config' in options && 'overrides' in options) {
    throw new Error('Specify either config or overrides, not both.');
  }

  if (Sandbox.active && ('config' in options || 'overrides' in options)) {
    throw new Error('There is already an active sandbox and configuration cannot be changed via options, remove both config and overrides options');
  }

  const cwd = resolve(options.cwd ?? process.cwd());

  return new Sandbox(cwd, config ?? merge(await loadConfig(cwd), overrides ?? {}));
}
