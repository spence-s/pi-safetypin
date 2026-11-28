import {Buffer} from 'node:buffer';
import {randomUUID} from 'node:crypto';
import {mkdtemp, realpath, rm} from 'node:fs/promises';
import {homedir, tmpdir} from 'node:os';
import {join} from 'node:path';
import process from 'node:process';
import {setTimeout} from 'node:timers/promises';
import {
  SandboxManager,
  SandboxRuntimeConfigSchema,
  type SandboxRuntimeConfig,
  type SandboxViolationEvent,
} from '@anthropic-ai/sandbox-runtime';
import {execa, type Options} from 'execa';
import {parseConfig, type Config} from './config/schema.ts';
import {buildNetworkConfig} from './config/network.ts';

/**
 * Exposes a subset of execa options
 */
export type RunOptions<T extends Options = Options> = T extends Options ? Pick<T,
  | 'cwd'
  | 'input'
  | 'stdin'
  | 'stdout'
  | 'stderr'
  | 'all'
  | 'buffer'
  | 'encoding'
  | 'lines'
  | 'reject'
  | 'timeout'
  | 'cancelSignal'
  | 'maxBuffer'
  | 'killSignal'
  | 'forceKillAfterDelay'
> : never;

/**
 * Keeps diagnostic observations separate from resource parsing and approval decisions.
 * Attribution comes from SRT's carriers, not a security boundary between commands.
 */
export type DenialObservation = {
  commandId: string | undefined;
  line: string;
  timestamp: Date;
};

export class SafetyPin {
  private static activeInstance: SafetyPin | undefined;

  /**
   * Only exposes the runtime owner once it is ready to run commands.
   */
  static get active(): SafetyPin | undefined {
    const instance = this.activeInstance;
    return instance?.scratchPath === undefined ? undefined : instance;
  }

  private scratchPath: string | undefined;
  private commandCount = 0;
  private readonly cwd: string;
  private readonly config: Config;

  /**
   * Keeps policy explicit and independent of Pi or configuration-file discovery.
   */
  constructor(cwd: string, config: Config) {
    this.cwd = cwd;
    this.config = parseConfig(config);
  }

  /**
   * Streams new diagnostics without replaying the shared store's retained history.
   * Callers own unsubscription; listener failures must not interfere with enforcement.
   */
  onDenial(listener: (denial: DenialObservation) => void): () => void {
    const store = SandboxManager.getSandboxViolationStore();
    const seen = new WeakSet<SandboxViolationEvent>(store.getViolations());
    return store.subscribe(
      /**
       * SRT publishes its whole tail each time, so forward each observation only once.
       */
      violations => {
        for (const violation of violations) {
          if (seen.has(violation)) {
            continue;
          }

          seen.add(violation);
          if (SafetyPin.active !== this) {
            continue;
          }

          try {
            listener({
              commandId: violation.encodedCommand === undefined ? undefined : Buffer.from(violation.encodedCommand, 'base64').toString('utf8'),
              line: violation.line,
              timestamp: new Date(violation.timestamp),
            });
          } catch (error) {
            process.emitWarning(error instanceof Error ? error : String(error));
          }
        }
      },
    );
  }

  /**
   * Installs request enforcement and filesystem observation before accepting commands.
   */
  async start(): Promise<void> {
    if (SafetyPin.activeInstance !== undefined) {
      throw new Error('A sandbox is already active.');
    }

    SafetyPin.activeInstance = this;
    let scratchPath: string | undefined;
    let config: SandboxRuntimeConfig | undefined;
    try {
      scratchPath = await mkdtemp(join(tmpdir(), 'sloppi-v2-'));
      scratchPath = await realpath(scratchPath);
      const {network, filesystem} = this.config.sandbox ?? {};
      // Fill in required runtime lists only after user overrides have been merged.
      config = SandboxRuntimeConfigSchema.parse({
        ...this.config.sandbox,
        network: buildNetworkConfig(network),
        filesystem: {
          ...filesystem,
          denyRead: filesystem?.denyRead ?? [],
          allowWrite: filesystem?.allowWrite ?? [],
          denyWrite: filesystem?.denyWrite ?? [],
        },
      });
      config.filesystem.allowWrite.push(scratchPath);
      config.network.allowUnixSockets = [...(config.network.allowUnixSockets ?? []), scratchPath];

      // SRT creates proxy sockets using os.tmpdir(); do not leak this override to host tools.
      const previousTmpdir = process.env.TMPDIR;
      process.env.TMPDIR = scratchPath;
      try {
        await SandboxManager.initialize(config, undefined, true);
      } finally {
        if (previousTmpdir === undefined) {
          delete process.env.TMPDIR;
        } else {
          process.env.TMPDIR = previousTmpdir;
        }
      }

      // SRT can return without applying our config if another owner initialized it.
      if (SandboxManager.getConfig() !== config) {
        throw new Error('A sandbox is already active.');
      }

      this.scratchPath = scratchPath;
    } catch (error) {
      try {
        if (config !== undefined && SandboxManager.getConfig() === config) {
          await SandboxManager.reset();
        }
      } finally {
        SafetyPin.activeInstance = undefined;
        if (scratchPath !== undefined) {
          await rm(scratchPath, {recursive: true, force: true});
        }
      }

      throw error;
    }
  }

  /**
   * Gives silent exit-code-1 failures and likely filesystem errors time to acquire diagnostics.
   * Failed commands retain Execa's rejection behavior; error text alone never becomes a denial.
   */
  async run<const OptionsType extends RunOptions = Record<string, never>>(
    command: string,
    options?: OptionsType,
  ): Promise<Awaited<ReturnType<typeof execa<OptionsType>>> & {commandId: string; denials: DenialObservation[]}>;
  async run(command: string, options: RunOptions = {}): Promise<unknown> {
    const observations: DenialObservation[] = [];
    const unsubscribe = this.onDenial(
      /**
       * Subscribe before spawning so fast proxy denials cannot outrun collection.
       */
      denial => {
        observations.push(denial);
      },
    );
    this.commandCount++;
    try {
      const {process: subprocess, commandId} = await this.spawn(command, {...options, reject: false});
      const result = await subprocess;
      if (result.exitCode === 1 || (result.failed && typeof result.stderr === 'string' && /operation not permitted/iv.test(result.stderr))) {
        // shortcut: exit code 1 or English permission errors trigger a 250 ms window; replace when SRT exposes command completion.
        await setTimeout(250);
      }

      const completed = Object.assign(result, {
        commandId,
        denials: observations.filter(denial => denial.commandId === commandId),
      });
      if (completed instanceof Error && options.reject !== false) {
        throw completed;
      }

      return completed;
    } finally {
      unsubscribe();
      this.commandCount--;
    }
  }

  /**
   * Exposes Execa and a unique observation key without awaiting its thenable subprocess.
   * Host HOME preserves tool config discovery; filesystem rules still control access.
   * Options are trusted host code: file-backed stdio and transforms run outside SRT.
   * Pipe only into another safetyPin.spawn() subprocess to keep both commands isolated.
   */
  async spawn<const OptionsType extends RunOptions = Record<string, never>>(command: string, options?: OptionsType): Promise<{process: ReturnType<typeof execa<OptionsType>>; commandId: string}>;
  async spawn(command: string, options: RunOptions = {}): Promise<unknown> {
    const {scratchPath} = this;
    if (scratchPath === undefined) {
      throw new Error('Safety Pin has not started.');
    }

    const commandId = randomUUID();
    this.commandCount++;
    let isWrapped = false;
    try {
      const temporaryPath = `'${scratchPath.replaceAll('\'', '\'"\'"\'')}'`;
      const executable = await SandboxManager.wrapWithSandbox(
        `export TMPDIR=${temporaryPath} CLAUDE_CODE_TMPDIR=${temporaryPath}\n${command}`,
        undefined,
        undefined,
        options?.cancelSignal,
        {commandId, commandText: command},
      );
      isWrapped = true;
      const subprocess = execa(executable, {
        ...options,
        cwd: options?.cwd ?? this.cwd,
        shell: true,
        extendEnv: false,
        env: {
          HOME: this.config.sandbox?.isolatedHome ? scratchPath : homedir(),
          TMPDIR: scratchPath,
          CLAUDE_CODE_TMPDIR: scratchPath,
          PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
          LANG: process.env.LANG ?? 'C.UTF-8',
          NODE_USE_ENV_PROXY: '1',
          USER: 'sandbox',
        },
        cleanup: true,
        detached: false,
        killDescendants: true,
      });

      /**
       * Releases wrapper resources on success and failure without replacing the subprocess.
       */
      const cleanup = () => {
        this.commandCount--;
        SandboxManager.cleanupAfterCommand();
      };

      void subprocess.then(cleanup, cleanup);

      return {process: subprocess, commandId};
    } catch (error) {
      this.commandCount--;
      if (isWrapped) {
        SandboxManager.cleanupAfterCommand();
      }

      throw error;
    }
  }

  /**
   * Only the runtime owner can release resources, and only after its commands finish.
   */
  async stop(): Promise<void> {
    if (SafetyPin.activeInstance !== this) {
      return;
    }

    if (this.scratchPath === undefined || this.commandCount > 0) {
      throw new Error('Wait for Safety Pin startup and commands to finish before stopping.');
    }

    const {scratchPath} = this;
    this.scratchPath = undefined;
    try {
      await SandboxManager.reset();
    } finally {
      try {
        await rm(scratchPath, {recursive: true, force: true});
      } finally {
        SafetyPin.activeInstance = undefined;
      }
    }
  }
}
