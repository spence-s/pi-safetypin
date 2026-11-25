import type {ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {networkRuleSchema} from '../../../config/index.ts';
import {editRequestFilters} from './request-filters.ts';
import {selectScope} from './select-scope.ts';
import {
  showNetworkPage,
  type NetworkScope,
  type ScopedRule,
  type Scope,
} from './utilities.ts';

/**
 * Keeps draft edits and scope selection separate from persistence, so cancel never writes a rule.
 */
export async function editRule(ctx: ExtensionCommandContext, selection: string, entries: ScopedRule[], scopes: NetworkScope[]) {
  let destination = selection;
  if (selection === 'add') {
    const input = await ctx.ui.input('Destination · No path; defaults to HTTPS, or HTTP for localhost');
    if (input === undefined) {
      return;
    }

    const result = networkRuleSchema.safeParse({destination: input.trim(), access: 'allow'});
    if (!result.success) {
      ctx.ui.notify('Enter an HTTP or HTTPS origin without credentials, paths, queries, fragments, or wildcards.', 'warning');
      return;
    }

    destination = new URL(result.data.destination).origin;
  }

  const matches = entries.filter(({rule}) => rule.destination === destination);
  let source: Scope = matches.find(({scope}) => scope === 'Local')?.scope ?? matches[0]?.scope ?? 'Local';
  let stored = matches.find(({scope}) => scope === source)?.rule;
  let access = stored?.access === 'block' ? 'Block' : (stored?.requests === undefined ? 'Allow' : 'Filtered');
  let requests = structuredClone(stored?.access === 'allow' ? stored.requests ?? [] : []);
  let selectedField: string | undefined;
  while (true) {
    const action = await showNetworkPage(ctx, {
      title: `Network rule · ${destination}`,
      subtitle: `Editing ${source} values · HTTPS access requires inspection; pinned/mTLS clients and raw TCP are unsupported.`,
    }, [
      ...matches.length > 1
        ? [{
          id: 'source', label: 'Load values from', currentValue: source, values: [''],
        }]
        : [],
      {
        id: 'access', label: 'Access', currentValue: access,
        description: 'Enter/Space cycles Allow → Filtered → Block. Allow permits all requests; Filtered requires a matching pattern.',
        values: [''],
      },
      {
        id: 'filters', label: 'Request filters…',
        currentValue: access === 'Block'
          ? 'Inactive — blocked'
          : (requests.length === 0 ? 'None — Add filter…' : `${requests.length} patterns${access === 'Allow' ? ' (inactive)' : ''}`),
        description: access === 'Block'
          ? 'Choose Allow or Filtered before editing filters.'
          : 'Adding or changing a valid filter enables Filtered access. Removing the last filter requires explicitly choosing Allow to allow everything.',
        values: [''],
      },
      {
        id: 'continue', label: 'Continue…', currentValue: '', values: [''],
      },
      ...matches.length > 0
        ? [{
          id: 'remove', label: 'Remove rule…', currentValue: '', values: [''],
        }]
        : [],
    ], selectedField);
    if (action === undefined) {
      return;
    }

    selectedField = action;
    if (action === 'source') {
      const scope = await ctx.ui.select('Load values from', ['Local', 'Global']);
      if (scope === 'Local' || scope === 'Global') {
        source = scope;
        stored = matches.find(entry => entry.scope === scope)?.rule;
        access = stored?.access === 'block' ? 'Block' : (stored?.requests === undefined ? 'Allow' : 'Filtered');
        requests = structuredClone(stored?.access === 'allow' ? stored.requests ?? [] : []);
      }

      continue;
    }

    if (action === 'access') {
      access = access === 'Allow' ? 'Filtered' : (access === 'Filtered' ? 'Block' : 'Allow');
      continue;
    }

    if (action === 'filters') {
      if (access === 'Block') {
        ctx.ui.notify('Choose Allow or Filtered before editing filters.', 'info');
        continue;
      }

      const previousFilters = JSON.stringify(requests);
      await editRequestFilters(ctx, requests);
      if (requests.length > 0 && JSON.stringify(requests) !== previousFilters) {
        access = 'Filtered';
      }

      continue;
    }

    if (action !== 'continue' && action !== 'remove') {
      continue;
    }

    const result = networkRuleSchema.safeParse({destination, access: access === 'Block' ? 'block' : 'allow', ...(access === 'Filtered') && {requests}});
    if (action === 'continue' && !result.success) {
      ctx.ui.notify('Filtered access requires at least one valid request pattern.', 'warning');
      continue;
    }

    const rule = action === 'continue' && result.success ? result.data : undefined;
    const targetScope = await selectScope(ctx, {
      destination, access, source, rule,
    }, matches, scopes);
    const target = scopes.find(scope => scope.source === targetScope);
    if (target !== undefined) {
      return {destination, target, rule};
    }
  }
}
