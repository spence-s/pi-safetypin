import {mkdtemp, realpath, rm} from 'node:fs/promises';
import {homedir, tmpdir} from 'node:os';
import {join} from 'node:path';
import process from 'node:process';
import {SandboxManager, SandboxRuntimeConfigSchema, type SandboxRuntimeConfig} from '@anthropic-ai/sandbox-runtime';
import {execa, type Options} from 'execa';
import {parseConfig, type Config} from './config/schema.ts';

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
   * Reserves SRT's shared runtime and verifies that it actually installed our policy.
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
        network: {
          ...network,
          allowedDomains: network?.allowedDomains ?? [],
          deniedDomains: network?.deniedDomains ?? [],
        },
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
        await SandboxManager.initialize(config);
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
   * Exposes Execa without awaiting its thenable subprocess or recreating its APIs.
   * Host HOME preserves tool config discovery; filesystem rules still control access.
   * Options are trusted host code: file-backed stdio and transforms run outside SRT.
   * Pipe only into another safetyPin.run() subprocess to keep both commands isolated.
   */
  async run<const OptionsType extends RunOptions = Record<string, never>>(command: string, options?: OptionsType): Promise<{process: ReturnType<typeof execa<OptionsType>>}>;
  async run(command: string, options: RunOptions = {}): Promise<unknown> {
    const {scratchPath} = this;
    if (scratchPath === undefined) {
      throw new Error('Safety Pin has not started.');
    }

    this.commandCount++;
    let isWrapped = false;
    try {
      const temporaryPath = `'${scratchPath.replaceAll('\'', '\'"\'"\'')}'`;
      const executable = await SandboxManager.wrapWithSandbox(
        `export TMPDIR=${temporaryPath} CLAUDE_CODE_TMPDIR=${temporaryPath}\n${command}`,
        undefined,
        undefined,
        options?.cancelSignal,
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

      return {process: subprocess};
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
