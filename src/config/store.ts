import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {parseConfig, type Config} from './schema.ts';

export type {Config} from './schema.ts';

export class ConfigStore {
  path: string;
  config: Config = {};

  /**
   * Gives each store one file so saving cannot mix global and project settings.
   */
  constructor(path: string) {
    this.path = path;
  }

  /**
   * Keeps ambiguous same-scope destinations out of settings without rejecting cross-scope overlap.
   */
  async load(): Promise<Config> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.path, 'utf8'));
      const config = parseConfig(parsed);
      const destinations = config.sandbox?.network?.map(rule => rule.destination) ?? [];
      if (new Set(destinations).size !== destinations.length) {
        throw new Error(`Duplicate network destinations in ${this.path}. Combine request alternatives in one rule.`);
      }

      this.config = config;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
        throw error;
      }

      this.config = {};
    }

    return this.config;
  }

  /**
   * Validates the selected source before writing so effective cross-scope rules are never persisted.
   */
  async save(): Promise<void> {
    const config = parseConfig(this.config);
    const destinations = config.sandbox?.network?.map(rule => rule.destination) ?? [];
    if (new Set(destinations).size !== destinations.length) {
      throw new Error(`Duplicate network destinations in ${this.path}. Combine request alternatives in one rule.`);
    }

    await mkdir(dirname(this.path), {recursive: true});
    await writeFile(this.path, `${JSON.stringify(config, undefined, 2)}\n`);
  }
}
