import type {ExtensionAPI} from '@earendil-works/pi-coding-agent';
import {Sandbox} from './sandbox.ts';
import {loadConfig} from './config.ts';
import {SandboxTools} from './tools/index.ts';

export default function SafetyPinExtension(pi: ExtensionAPI): void {
  let sandbox: Sandbox | undefined;

  pi.on('session_start', async (_event, ctx) => {
    const {cwd} = ctx;
    const config = await loadConfig(cwd);

    sandbox = new Sandbox(cwd, config);
    new SandboxTools(pi, cwd, sandbox).register();

    await sandbox.start();
  });

  pi.on('session_shutdown', async () => {
    await sandbox?.stop();
    sandbox = undefined;
  });
}
