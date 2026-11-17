import {SandboxRuntimeConfigSchema, type SandboxRuntimeConfig} from '@anthropic-ai/sandbox-runtime';
import {z} from 'zod';
import type {PartialWithUndefined} from './utilities.ts';

const sandboxSchema = z.strictObject({
  exposeEnvVars: z.array(z.string().regex(/^[A-Z_a-z]\w*$/v)).optional(),
  shareHostHomeDirectory: z.boolean().optional(),
  promptOnNetworkDeny: z.boolean().optional(),
});

// File overrides defer complete-config and cross-field checks to the runtime boundary.
// eslint-disable-next-line @typescript-eslint/no-deprecated -- Reuse SRT's Zod v3 partial-schema API instead of duplicating its fields.
const runtimeSchema = SandboxRuntimeConfigSchema.innerType().deepPartial().strict();

const configObjectSchema = z.looseObject({sandbox: sandboxSchema.optional()});

/**
 * The fully typed user Config object accepted by the sandbox
 */
export type Config = PartialWithUndefined<SandboxRuntimeConfig> & {
  sandbox?: z.infer<typeof sandboxSchema> | undefined;
};

/**
 * Parses the user Config object
 */
export function parseConfig(value: unknown): Config {
  const {sandbox, ...runtime} = configObjectSchema.parse(value);
  const runtimeConfig = runtimeSchema.parse(runtime);
  return sandbox === undefined ? runtimeConfig : {...runtimeConfig, sandbox};
}
