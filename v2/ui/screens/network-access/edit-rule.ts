import type {ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {networkRuleSchema, type NetworkRule, type RequestPattern} from '../../../config/index.ts';
import {editRequestFilters} from './request-filters.ts';
import {selectScope} from './select-scope.ts';
import {
  saveNetworkRule,
  showNetworkPage,
  type NetworkScope,
  type ScopedRule,
} from './utilities.ts';

/**
 * Saves completed actions rather than navigation, so new origins stay uncreated until access or a filter is chosen.
 */
export async function editRule(ctx: ExtensionCommandContext, selection: string, entries: ScopedRule[], scopes: NetworkScope[]): Promise<string | undefined> {
  let destination = selection;
  if (selection === 'add') {
    while (true) {
      const input = await ctx.ui.input('Destination · No path; defaults to HTTPS, or HTTP for localhost');
      if (input === undefined) {
        return;
      }

      const result = networkRuleSchema.safeParse({destination: input.trim(), access: 'allow'});
      if (result.success) {
        destination = result.data.destination;
        break;
      }

      ctx.ui.notify('Enter an HTTP or HTTPS origin without credentials, paths, queries, fragments, or wildcards.', 'warning');
    }
  }

  const matches = entries.filter(({rule}) => rule.destination === destination);
  const source = matches.find(({scope}) => scope === 'Local')?.scope ?? matches[0]?.scope;
  const initialTarget = source === undefined
    ? await selectScope(ctx, destination, scopes)
    : scopes.find(scope => scope.source === source);
  if (initialTarget === undefined) {
    return;
  }

  let target = initialTarget;
  let stored: NetworkRule | undefined = target.store.config.sandbox?.network?.find(rule => rule.destination === destination);

  /**
   * Retains Block while editing inactive filters, and treats the first valid filter on a new origin as an Allow.
   */
  // eslint-disable-next-line unicorn/consistent-boolean-name -- This persistence boundary returns whether the edit was committed.
  async function saveFilters(next: RequestPattern[]): Promise<boolean> {
    const result = networkRuleSchema.safeParse({destination, access: stored?.access ?? 'allow', ...next.length > 0 && {requests: next}});
    if (!result.success) {
      ctx.ui.notify('Request filters must contain valid conditions.', 'warning');
      return false;
    }

    if (!await saveNetworkRule(ctx, target, destination, result.data)) {
      return false;
    }

    stored = result.data;
    return true;
  }

  let selectedField: string | undefined;
  while (true) {
    const count = stored?.requests?.length ?? 0;
    const action = await showNetworkPage(ctx, {
      title: `Network rule · ${destination}`,
      subtitle: `Editing ${target.source} · ${stored === undefined ? 'Not saved yet · ' : ''}Completed edits save automatically · Esc: back.`,
    }, [
      {
        id: 'source', label: 'Scope', currentValue: target.source,
        description: 'Changing scope loads its saved rule; it never copies or moves rules. Block wins across scopes; Local cannot override Global filters.',
        values: [''],
      },
      {
        id: 'access', label: 'Access', currentValue: stored === undefined ? 'Not set — choose Allow or Block' : (stored.access === 'allow' ? 'Allow' : 'Block'),
        description: 'Allow ↔ Block saves immediately; filters are retained while blocked. HTTPS requires inspection; pinned/mTLS clients and raw TCP are unsupported.',
        values: [''],
      },
      {
        id: 'filters', label: 'Request filters…',
        currentValue: `${count === 0 ? 'None — Add filter…' : `${count} patterns`}${stored?.access === 'block' ? ' (inactive)' : ''}`,
        description: 'Completed edits save immediately. Filters are inactive while blocked. Removing the last filter saves without confirmation.',
        values: [''],
      },
      ...stored === undefined
        ? []
        : [{
          id: 'remove', label: 'Remove rule…', currentValue: '', values: [''],
        }],
    ], selectedField);
    if (action === undefined) {
      return destination;
    }

    selectedField = action;
    if (action === 'source') {
      const scope = await selectScope(ctx, destination, scopes, target.source);
      if (scope !== undefined && scope !== target) {
        await scope.store.load();
        target = scope;
        stored = target.store.config.sandbox?.network?.find(rule => rule.destination === destination);
      }

      continue;
    }

    if (action === 'access') {
      const access = stored === undefined
        ? await ctx.ui.select(`Access for ${destination}`, ['Allow', 'Block'])
        : (stored.access === 'allow' ? 'Block' : 'Allow');
      if (access === undefined) {
        continue;
      }

      const rule: NetworkRule = {destination, access: access === 'Block' ? 'block' : 'allow', ...stored?.requests !== undefined && {requests: stored.requests}};
      if (await saveNetworkRule(ctx, target, destination, rule)) {
        stored = rule;
      }

      continue;
    }

    if (action === 'filters') {
      await editRequestFilters(ctx, structuredClone(stored?.requests ?? []), saveFilters);
      continue;
    }

    if (action !== 'remove') {
      continue;
    }

    const isConfirmed = await ctx.ui.confirm(`Remove ${destination} from ${target.source}?`, 'Only this scope is removed. Rules in the other scope still apply.');
    if (isConfirmed && await saveNetworkRule(ctx, target, destination, undefined)) {
      return destination;
    }
  }
}
