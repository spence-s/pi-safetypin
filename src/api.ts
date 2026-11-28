import {resolve} from 'node:path';
import process from 'node:process';
import {loadConfig, mergeConfigs, type Config} from './config/index.ts';
import {SafetyPin} from './safety-pin.ts';

export type {DenialObservation} from './safety-pin.ts';

/**
 * Shares runtime ownership while keeping file and caller-supplied network restrictions additive.
 */
export async function getSafetyPin(options: {cwd?: string} & (
  | {config: Config; overrides?: never}
  | {config?: never; overrides?: Config}
) = {}): Promise<SafetyPin> {
  const {config, overrides} = options;
  if ('config' in options && 'overrides' in options) {
    throw new Error('Specify either config or overrides, not both.');
  }

  if (SafetyPin.active && ('config' in options || 'overrides' in options)) {
    throw new Error('Safety Pin is already active. Omit config and overrides to reuse the active instance.');
  }

  if (SafetyPin.active !== undefined) {
    return SafetyPin.active;
  }

  const cwd = resolve(options.cwd ?? process.cwd());

  return new SafetyPin(cwd, config ?? mergeConfigs(await loadConfig(cwd), overrides ?? {}));
}
