import {constants} from 'node:os';
import process from 'node:process';
import {getSafetyPin} from './api.ts';

/**
 * Keeps MCP framing untouched while owning the sandbox for the server's lifetime.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === '--') {
    args.shift();
  }

  if (args.length === 0) {
    throw new Error('Usage: node src/cli.ts -- <command> [args...]');
  }

  const safetyPin = await getSafetyPin();
  const controller = new AbortController();

  /**
   * Lets subprocess cleanup finish before releasing the sandbox on client shutdown.
   */
  const handleSignal = (signal: NodeJS.Signals) => {
    process.exitCode = 128 + constants.signals[signal];
    controller.abort();
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);
  try {
    await safetyPin.start();
    if (controller.signal.aborted) {
      return;
    }

    // spawn() uses a shell; quote every argument so MCP arguments remain literal.
    const command = args.map(
      /**
       * Prevents server arguments from becoming host-provided shell syntax.
       */
      argument => `'${argument.replaceAll('\'', '\'"\'"\'')}'`,
    ).join(' ');
    const {process: subprocess} = await safetyPin.spawn(`exec ${command}`, {
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
      buffer: false,
      reject: false,
      cancelSignal: controller.signal,
    });
    const result = await subprocess;
    if (!controller.signal.aborted) {
      process.exitCode = result.exitCode ?? (result.signal === undefined ? 1 : 128 + constants.signals[result.signal]);
    }
  } finally {
    try {
      await safetyPin.stop();
    } finally {
      process.removeListener('SIGINT', handleSignal);
      process.removeListener('SIGTERM', handleSignal);
    }
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
