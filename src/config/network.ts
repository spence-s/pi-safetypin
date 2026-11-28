import type {NetworkConfig} from '@anthropic-ai/sandbox-runtime';
import {normalizeNetworkDestination, type NetworkRule} from './schema.ts';

/**
 * Keeps origin and request restrictions enforced even when SRT's connection grant is broader.
 */
export function buildNetworkConfig(rules: NetworkRule[] = []): NetworkConfig {
  const destinations = Map.groupBy(rules, rule => rule.destination);

  const allowedDomains = new Set<string>();
  let isTlsRequired = false;
  for (const [destination, entries] of destinations) {
    if (entries.some(rule => rule.access === 'block')) {
      continue;
    }

    const url = new URL(destination);
    allowedDomains.add(`${url.hostname}:${url.port === '' ? (url.protocol === 'https:' ? '443' : '80') : url.port}`);
    isTlsRequired ||= url.protocol === 'https:';
  }

  return {
    allowedDomains: [...allowedDomains],
    deniedDomains: [],
    strictAllowlist: true,
    refuseOpaqueTunnels: true,
    requireHostMatch: true,
    ambiguousRequestTarget: 'refuse',
    ...(isTlsRequired && {tlsTerminate: {}}),
    /**
     * All matching scope entries must pass; one scope cannot erase another's restrictions.
     */
    async filterRequest(request, info) {
      const url = new URL(request.url);
      const origin = normalizeNetworkDestination(url.origin);
      const entries = destinations.get(origin);
      if (entries === undefined || entries.some(rule => rule.access === 'block')) {
        return {action: 'deny', reason: `Network access blocked for ${origin}.`};
      }

      // Check how the proxy received and routed the request, not just a client-supplied URL.
      if (info?.scheme === undefined || `${info.scheme}:` !== url.protocol || info.target === undefined
        || normalizeNetworkDestination(`${info.scheme}://${info.target.host.includes(':') && !info.target.host.startsWith('[') ? `[${info.target.host}]` : info.target.host}:${info.target.port}`) !== origin) {
        return {action: 'deny', reason: 'Request scheme or connection target does not match the allowed origin.'};
      }

      for (const entry of entries) {
        if (entry.requests === undefined) {
          continue;
        }

        const isMatches = entry.requests.some(pattern => {
          if (pattern.methods !== undefined && !pattern.methods.includes(request.method.toUpperCase())) {
            return false;
          }

          if (pattern.paths !== undefined || pattern.pathPrefixes !== undefined) {
            const isPathMatches = pattern.paths?.includes(url.pathname) ?? false;
            const isPrefixMatches = pattern.pathPrefixes?.some(prefix => url.pathname === prefix
              || url.pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`)) ?? false;
            if (!isPathMatches && !isPrefixMatches) {
              return false;
            }
          }

          return Object.entries(pattern.headers ?? {}).every(([name, values]) => {
            const value = request.headers.get(name);
            return value !== null && values.includes(value);
          });
        });
        if (!isMatches) {
          return {action: 'deny', reason: `Request does not match the filters for ${origin}.`};
        }
      }

      return {action: 'allow'};
    },
  };
}
