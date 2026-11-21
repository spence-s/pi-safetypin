import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import process from 'node:process';
import {merge} from 'object-deep-merge';
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
   * Missing files inherit defaults, but malformed or unreadable files must not be ignored.
   */
  async load(): Promise<Config> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.path, 'utf8'));
      this.config = parseConfig(parsed);
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
        throw error;
      }

      this.config = {};
    }

    return this.config;
  }

  /**
   * Allows a scope's first save without requiring its settings directory to exist.
   */
  async save(): Promise<void> {
    const config = parseConfig(this.config);
    await mkdir(dirname(this.path), {recursive: true});
    await writeFile(this.path, `${JSON.stringify(config, undefined, 2)}\n`);
  }
}

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
 * Keeps each scope independent on disk while deriving project overrides at load time.
 */
export async function loadConfig(cwd: string): Promise<Config> {
  const {globalStore, projectStore} = getConfigStores(cwd);
  const [global, project] = await Promise.all([globalStore.load(), projectStore.load()]);
  return merge(global, project);
}
