import {realpath} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join, resolve} from 'node:path';
import process from 'node:process';
import type {Config} from './schema.ts';

/**
 * Keeps V1's workspace and skill access without exposing the rest of the home directory.
 */
export async function getDefaultConfig(cwd: string): Promise<Config> {
  cwd = resolve(cwd);
  const home = homedir();
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(home, '.pi', 'agent');
  const skillPaths = [
    resolve(agentDir, 'skills'),
    resolve(agentDir, 'git'),
    resolve(agentDir, 'npm'),
    join(home, '.agents', 'skills'),
  ];
  const resolvedSkillPaths = await Promise.all(skillPaths.map(
    /**
     * Missing skill directories are normal; other resolution failures must remain visible.
     */
    async path => {
      try {
        return await realpath(path);
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
          throw error;
        }

        return path;
      }
    },
  ));

  return {
    sandbox: {
      isolatedHome: false,
      network: [],
      filesystem: {
        allowRead: [...new Set([cwd, ...skillPaths, ...resolvedSkillPaths])],
        allowWrite: [cwd],
        denyRead: cwd === home ? [] : [home],
        denyWrite: [],
      },
    },
  };
}
