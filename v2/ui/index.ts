import type {ExtensionAPI, ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {showLandingScreen} from './screens/landing.ts';

const args = ['on', 'off', 'local', 'global', 'status'];
/**
 * Keep Safety Pin configuration discoverable through the command menu.
 */
export function registerSafetyPinUiCommand(pi: ExtensionAPI) {
  pi.registerCommand('safetypin', {
    description: 'Configure Pi Safety Pin Extension Sandbox and Permissions System',
    /**
     * Suggest only supported scopes that match the user's input.
     */
    getArgumentCompletions(argumentPrefix: string) {
      const scopes = args.filter(scope => scope.startsWith(argumentPrefix));
      return scopes.length > 0 ? scopes.map(scope => ({value: scope, label: scope})) : null;
    },
    /**
     * Default to global settings without introducing configuration actions yet.
     */
    async handler(rawArgs: string, ctx: ExtensionCommandContext) {
      const parsedArgs = rawArgs.trim();

      if (parsedArgs !== '' && !args.includes(parsedArgs)) {
        ctx.ui.notify(`/safetypin only allows one of ${args.join(', ')}`);
        return;
      }

      if (!['', 'global', 'local'].includes(parsedArgs)) {
        return;
      }

      if (ctx.mode !== 'tui') {
        ctx.ui.notify('/safetypin settings configuration requires TUI mode');
      }

      await showLandingScreen(ctx);
    },
  });
}
