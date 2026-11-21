import type {ExtensionAPI} from '@earendil-works/pi-coding-agent';
import {getSafetyPin} from './api.ts';
import type {SafetyPin} from './safety-pin.ts';
import {SafetyPinTools} from './tools/index.ts';
import {registerSafetyPinUiCommand} from './ui/index.ts';

/**
 * Shares the process-wide Safety Pin instance with add-ons while keeping shutdown owned by Pi.
 */
export default function SafetyPinExtension(pi: ExtensionAPI): void {
  let safetyPin: SafetyPin | undefined;

  registerSafetyPinUiCommand(pi);

  pi.on('session_start', async (_event, ctx) => {
    const {cwd} = ctx;
    safetyPin = await getSafetyPin({cwd});
    await safetyPin.start();
    new SafetyPinTools(pi, cwd, safetyPin).register();
  });

  pi.on('session_shutdown', async () => {
    await safetyPin?.stop();
    safetyPin = undefined;
  });
}
