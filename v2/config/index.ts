import {homedir} from 'node:os';
import {join} from 'node:path';
import process from 'node:process';
import {merge} from 'object-deep-merge';
import {getDefaultConfig} from './defaults.ts';
import {ConfigStore} from './store.ts';
import type {Config} from './schema.ts';

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
 * Applies defaults at load time so settings files only contain user-supplied rules.
 */
export async function loadConfig(cwd: string): Promise<Config> {
  const {globalStore, projectStore} = getConfigStores(cwd);
  const [defaults, global, project] = await Promise.all([
    getDefaultConfig(cwd),
    globalStore.load(),
    projectStore.load(),
  ]);
  return merge(defaults, global, project);
}
