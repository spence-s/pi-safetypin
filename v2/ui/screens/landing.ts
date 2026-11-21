import type {ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {showFileSystemAccess} from './filesystem-access.ts';

/**
 * Keep the initial screen presentation separate from configuration and actions.
 */
export async function showLandingScreen(ctx: ExtensionCommandContext): Promise<void> {
  const selection = await ctx.ui.select('Safety Pin Config Wizard', [
    'Filesystem Access',
    'Network Access',
    'Command Permissions',
  ]);

  // use a switch case for screen routing
  switch (selection) {
    case 'Filesystem Access': {
      await showFileSystemAccess();
      break;
    }

    case 'Network Access': {
      break;
    }

    case undefined:
    default:
  }
}
