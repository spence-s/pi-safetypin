// shortcut: uses Pi's transitive MCP dependency; declare it directly when packaging this integration.
// eslint-disable-next-line import-x/no-extraneous-dependencies, n/no-extraneous-import
import {PipeTransport, type StdioTransportOptions} from '@earendil-works/pi-mcp';
import type {SafetyPin} from './safety-pin.ts';

/**
 * Reuses Pi's MCP framing without giving the transport ownership of the shared sandbox.
 * Callers must supply a started instance and already-resolved command, args, cwd, and env.
 * Close all transports before stopping Safety Pin; environment inheritance stays disabled.
 */
export function createSandboxMcpTransport(
  safetyPin: SafetyPin,
  options: Pick<StdioTransportOptions, 'command' | 'args' | 'cwd' | 'env'>,
): PipeTransport {
  return new PipeTransport({
    /**
     * Starts the server inside the existing policy rather than creating another SRT owner.
     */
    async open({onStdout, onStderr}) {
      if (options.command.length === 0) {
        throw new Error('An MCP server command is required.');
      }

      const environment = Object.entries(options.env ?? {});
      for (const [name, value] of environment) {
        if (!/^[a-z_]\w*$/iv.test(name) || value.includes('\0')) {
          throw new Error(`Invalid MCP environment variable: ${name}`);
        }
      }

      const args = [
        'env',
        '--',
        ...environment.map(
          /**
           * Forwards only explicitly configured credentials, not Pi's host environment.
           */
          ([name, value]) => `${name}=${value}`,
        ),
        options.command,
        ...(options.args ?? []),
      ];

      const command = args.map(
        /**
         * Preserves argument boundaries across Safety Pin's shell-based spawn API.
         */
        argument => `'${argument.replaceAll('\'', '\'"\'"\'')}'`,
      ).join(' ');
      const controller = new AbortController();
      const {process: subprocess} = await safetyPin.spawn(`exec ${command}`, {
        ...(options.cwd !== undefined && {cwd: options.cwd}),
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        buffer: false,
        cancelSignal: controller.signal,
        forceKillAfterDelay: 2000,
      });
      subprocess.stdout.on('data', onStdout);
      subprocess.stderr.on('data', onStderr);

      return {
        /**
         * Leaves newline framing to PipeTransport rather than serializing messages twice.
         */
        write(data) {
          subprocess.stdin.write(data);
        },
        /**
         * Gives cooperative MCP servers a chance to exit before cancellation escalates.
         */
        closeStdin() {
          subprocess.stdin.end();
        },
        /**
         * Uses Execa's cancellation and descendant cleanup instead of killing only the server PID.
         */
        close() {
          controller.abort();
        },
        exited: subprocess,
      };
    },
  });
}
