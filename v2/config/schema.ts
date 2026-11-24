import {SandboxRuntimeConfigSchema, type SandboxRuntimeConfig} from '@anthropic-ai/sandbox-runtime';
import {z} from 'zod';
import type {PartialWithUndefined} from './utilities.ts';

const sandboxSchema = z.looseObject({
  exposeEnvVars: z.array(z.string().regex(/^[A-Z_a-z]\w*$/v)).optional(),
  shareHostHomeDirectory: z.boolean().optional(),
  promptOnNetworkDeny: z.boolean().optional(),
});

// File overrides defer complete-config and cross-field checks to the runtime boundary.
// eslint-disable-next-line @typescript-eslint/no-deprecated -- Reuse SRT's Zod v3 partial-schema API instead of duplicating its fields.
const runtimeSchema = SandboxRuntimeConfigSchema.innerType().deepPartial();
const configObjectSchema = z.looseObject({sandbox: sandboxSchema.optional()});

/**
 * The fully typed user Config object accepted by the sandbox
 */
export type Config = {
  sandbox?: (PartialWithUndefined<SandboxRuntimeConfig> & z.infer<typeof sandboxSchema>) | undefined;
};

/**
 * Keeps runtime validation inside the sandbox namespace without duplicating SRT fields.
 */
export function parseConfig(value: unknown): Config {
  const {sandbox} = configObjectSchema.parse(value);
  if (sandbox === undefined) {
    return {};
  }

  const {exposeEnvVars, shareHostHomeDirectory, promptOnNetworkDeny, ...runtime} = sandbox;
  const runtimeConfig = runtimeSchema.parse(runtime);
  return {
    sandbox: {
      ...runtimeConfig, exposeEnvVars, shareHostHomeDirectory, promptOnNetworkDeny,
    },
  };
}
