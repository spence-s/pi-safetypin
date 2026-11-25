import type {ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {showFileSystemAccess} from './filesystem-access/index.ts';
import {showNetworkAccess} from './network-access.ts';

/**
 * Keeps permission editors discoverable without choosing a scope up front.
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
      await showFileSystemAccess(ctx);
      break;
    }

    case 'Network Access': {
      await showNetworkAccess(ctx);
      break;
    }

    case undefined:
    default:
  }
}
