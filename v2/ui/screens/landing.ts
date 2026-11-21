import type {ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {showFileSystemAccess} from './filesystem-access.ts';

/**
 * Keep the initial screen presentation separate from configuration and actions.
 */
export async function showLandingScreen(ctx: ExtensionCommandContext, scope: 'global' | 'local' = 'global'): Promise<void> {
  const scopeLabel = scope === 'global' ? 'GLOBAL · All projects' : 'LOCAL · This project';

  const selection = await ctx.ui.select(`Safety Pin — ${scopeLabel}`, [
    'Filesystem Access',
    'Network Access',
    'Command Permissions',
    '',
    `← Manage ${scope === 'local' ? 'global' : 'local'} settings`,
  ]);

  // use a switch case for screen routing
  switch (selection) {
    case 'Filesystem Access': {
      await showFileSystemAccess(scope);
      break;
    }

    case 'Network Access': {
      break;
    }

    case undefined:
    default:
  }
}
