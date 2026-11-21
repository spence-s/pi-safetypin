import type {ExtensionAPI} from '@earendil-works/pi-coding-agent';
import {getSandbox} from './api.ts';
import type {Sandbox} from './sandbox.ts';
import {SandboxTools} from './tools/index.ts';

/**
 * Shares the process-wide sandbox with addons while keeping shutdown owned by Pi.
 */
export default function SafetyPinExtension(pi: ExtensionAPI): void {
  let sandbox: Sandbox | undefined;

  pi.on('session_start', async (_event, ctx) => {
    const {cwd} = ctx;
    sandbox = await getSandbox({cwd});
    await sandbox.start();
    new SandboxTools(pi, cwd, sandbox).register();
  });

  pi.on('session_shutdown', async () => {
    await sandbox?.stop();
    sandbox = undefined;
  });
}
