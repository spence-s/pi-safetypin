import {NetworkConfigSchema, SandboxRuntimeConfigSchema, type SandboxRuntimeConfig} from '@anthropic-ai/sandbox-runtime';
import {z} from 'zod';
import type {PartialWithUndefined} from './utilities.ts';

/**
 * Mirrors SRT host canonicalization so aliases cannot split the editor and runtime policies.
 */
export function normalizeNetworkDestination(destination: string): string {
  const url = new URL(destination);
  url.hostname = url.hostname.replace(/\.$/v, '');
  if (url.hostname.startsWith('[::ffff:')) {
    const words = url.hostname.slice(8, -1).split(':').map(word => Number.parseInt(word, 16));
    url.hostname = words.flatMap(word => [Math.floor(word / 256), word % 256]).join('.');
  }

  return url.origin;
}

const destinationSchema = z.string().transform(
  /**
   * Defaults public destinations to TLS while keeping local development URLs convenient.
   */
  destination => {
    if (destination.includes('://')) {
      return destination;
    }

    const scheme = /^localhost\.?(?::|\/|$)/iv.test(destination) ? 'http' : 'https';
    return `${scheme}://${destination}`;
  },
).refine(
  /**
   * Rejects lossy URL parsing so a path or credential cannot become a broader grant.
   */
  destination => {
    if (!/^https?:\/\/[^\s\p{Control}#\/?\\]+\/?$/iv.test(destination)) {
      return false;
    }

    try {
      const url = new URL(destination);
      const origin = new URL(normalizeNetworkDestination(destination));
      const port = origin.port === '' ? (origin.protocol === 'https:' ? '443' : '80') : origin.port;
      return url.username === '' && url.password === '' && !destination.includes('@') && !url.hostname.includes('*')
        && Number(port) > 0
        && NetworkConfigSchema.shape.allowedDomains.safeParse([`${origin.hostname}:${port}`]).success;
    } catch {
      return false;
    }
  },
  'Use an exact HTTP or HTTPS origin without credentials, a path, query, fragment, or wildcard.',
).transform(normalizeNetworkDestination);
const pathSchema = z.string().startsWith('/').regex(/^[^\s\p{Control}#?\\]*$/v, 'Use an encoded URL pathname without a query or fragment.');
const tokenSchema = z.string().regex(/^[\w!#$%\u{26}'*+\-.^`\|~]+$/v);
const headerValueSchema = z.string().regex(/^[\t\u{20}-\u{7E}\u{80}-\u{FF}]*$/v);
const headerValuesSchema = z.array(headerValueSchema).min(1);
export const requestSchema = z.strictObject({
  methods: z.array(tokenSchema.transform(
    /**
     * Avoids case-dependent surprises when users enter methods in configuration files.
     */
    method => method.toUpperCase(),
  )).min(1).optional(),
  paths: z.array(pathSchema).min(1).optional(),
  pathPrefixes: z.array(pathSchema).min(1).optional(),
  headers: z.unknown().refine(
    /**
     * Check before record parsing: Zod silently discards this reserved key without validating it.
     */
    headers => headers === null || typeof headers !== 'object' || !Object.hasOwn(headers, '__proto__'),
    'The reserved header name __proto__ is not supported.',
  ).pipe(z.record(tokenSchema, headerValuesSchema)).optional(),
}).refine(
  /**
   * An empty pattern would accidentally allow every request to a protected destination.
   */
  rule => rule.methods !== undefined || rule.paths !== undefined || rule.pathPrefixes !== undefined
    || Object.keys(rule.headers ?? {}).length > 0,
  'At least one request condition is required.',
);
export type RequestPattern = z.infer<typeof requestSchema>;

const networkObjectRuleSchema = z.discriminatedUnion('access', [
  z.strictObject({
    destination: destinationSchema,
    access: z.literal('allow'),
    requests: z.array(requestSchema).min(1).optional(),
  }),
  z.strictObject({
    destination: destinationSchema,
    access: z.literal('block'),
    requests: z.array(requestSchema).min(1).optional(),
  }),
]);
export const networkRuleSchema = z.union([
  destinationSchema.transform(
    /**
     * Keeps downstream policy handling identical for shorthand and explicit allow entries.
     */
    destination => ({destination, access: 'allow' as const}),
  ),
  networkObjectRuleSchema,
]);
export const networkSchema = z.array(networkRuleSchema, {
  error: 'sandbox.network must be an array of destination rules.',
});
export type NetworkRule = z.infer<typeof networkRuleSchema> & {requests?: RequestPattern[] | undefined};

const sandboxSchema = z.looseObject({
  network: networkSchema.optional(),
  exposeEnvVars: z.array(z.string().regex(/^[A-Z_a-z]\w*$/v)).optional(),
  isolatedHome: z.boolean().optional(),
  promptOnNetworkDeny: z.boolean().optional(),
});

// File overrides defer complete-config and cross-field checks to the runtime boundary.
// eslint-disable-next-line @typescript-eslint/no-deprecated -- Reuse SRT's Zod v3 partial-schema API instead of duplicating its fields.
const runtimeSchema = SandboxRuntimeConfigSchema.innerType().omit({network: true}).deepPartial();
const configObjectSchema = z.looseObject({sandbox: sandboxSchema.optional()});

/**
 * Keeps network rules declarative while retaining the remaining SRT sandbox fields.
 */
export type Config = {
  sandbox?: (PartialWithUndefined<Omit<SandboxRuntimeConfig, 'network'>> & z.infer<typeof sandboxSchema>) | undefined;
};

/**
 * Validates Safety Pin fields separately from the underlying SRT sandbox settings.
 */
export function parseConfig(value: unknown): Config {
  const {sandbox} = configObjectSchema.parse(value);
  if (sandbox === undefined) {
    return {};
  }

  const {network, exposeEnvVars, isolatedHome, promptOnNetworkDeny, ...runtime} = sandbox;
  const runtimeConfig = runtimeSchema.parse(runtime);
  return {
    sandbox: {
      ...runtimeConfig, network, exposeEnvVars, isolatedHome, promptOnNetworkDeny,
    },
  };
}
