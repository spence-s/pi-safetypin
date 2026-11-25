import {SandboxRuntimeConfigSchema, type SandboxRuntimeConfig} from '@anthropic-ai/sandbox-runtime';
import {z} from 'zod';
import type {PartialWithUndefined} from './utilities.ts';

const destinationSchema = z.string().refine(
  /**
   * Keeps paths and credentials out of connection grants instead of silently discarding them.
   */
  destination => {
    if (!/^https?:\/\/[^#\/?]+\/?$/iv.test(destination)) {
      return false;
    }

    try {
      const url = new URL(destination);
      return url.username === '' && url.password === '' && !url.hostname.includes('*');
    } catch {
      return false;
    }
  },
  'Use an exact HTTP or HTTPS origin without credentials, a path, query, or fragment.',
);
const pathSchema = z.string().startsWith('/');
const tokenSchema = z.string().regex(/^[\w!#$%\u{26}'*+\-.^`\|~]+$/v);
const headerValueSchema = z.string().regex(/^[^\n\r]*$/v);
const headerValuesSchema = z.array(headerValueSchema).min(1);
const requestSchema = z.strictObject({
  methods: z.array(tokenSchema).min(1).optional(),
  paths: z.array(pathSchema).min(1).optional(),
  pathPrefixes: z.array(pathSchema).min(1).optional(),
  headers: z.record(tokenSchema, headerValuesSchema).optional(),
}).refine(
  /**
   * An empty pattern would accidentally allow every request to a protected destination.
   */
  rule => rule.methods !== undefined || rule.paths !== undefined || rule.pathPrefixes !== undefined
    || Object.keys(rule.headers ?? {}).length > 0,
  'At least one request condition is required.',
);

export const networkRuleSchema = z.discriminatedUnion('access', [
  z.strictObject({
    destination: destinationSchema,
    access: z.literal('allow'),
    requests: z.array(requestSchema).min(1).optional(),
  }),
  z.strictObject({
    destination: destinationSchema,
    access: z.literal('block'),
  }),
]);
export const networkSchema = z.array(networkRuleSchema);
export type NetworkRule = z.infer<typeof networkRuleSchema>;

const sandboxSchema = z.looseObject({
  exposeEnvVars: z.array(z.string().regex(/^[A-Z_a-z]\w*$/v)).optional(),
  isolatedHome: z.boolean().optional(),
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

  const {exposeEnvVars, isolatedHome, promptOnNetworkDeny, ...runtime} = sandbox;
  const runtimeConfig = runtimeSchema.parse(runtime);
  return {
    sandbox: {
      ...runtimeConfig, exposeEnvVars, isolatedHome, promptOnNetworkDeny,
    },
  };
}
