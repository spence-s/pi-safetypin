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
 * Establishes the save scope before editing so completed filters survive backing out of parent screens.
 */
export async function editRule(ctx: ExtensionCommandContext, selection: string, entries: ScopedRule[], scopes: NetworkScope[]): Promise<string | undefined> {
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
  const source = matches.find(({scope}) => scope === 'Local')?.scope ?? matches[0]?.scope;
  const initialTarget = source === undefined
    ? await selectScope(ctx, destination, scopes)
    : scopes.find(scope => scope.source === source);
  if (initialTarget === undefined) {
    return;
  }

  let target = initialTarget;
  let stored: NetworkRule | undefined = target.store.config.sandbox?.network?.find(rule => rule.destination === destination);
  let access = stored?.access === 'block' ? 'Block' : (stored?.requests === undefined ? 'Allow' : 'Filtered');
  let requests = structuredClone(stored?.access === 'allow' ? stored.requests ?? [] : []);

  /**
   * Saves only complete filtered rules; an empty list must never silently grant unrestricted access.
   */
  // eslint-disable-next-line unicorn/consistent-boolean-name -- This persistence boundary returns whether the edit was committed.
  async function saveFilters(next: RequestPattern[]): Promise<boolean> {
    const result = networkRuleSchema.safeParse({destination, access: 'allow', requests: next});
    if (!result.success) {
      ctx.ui.notify('Keep at least one valid filter. To allow everything, go back and explicitly choose Allow and Save.', 'warning');
      return false;
    }

    if (!await saveNetworkRule(ctx, target, destination, result.data)) {
      return false;
    }

    stored = result.data;
    access = 'Filtered';
    return true;
  }

  let selectedField: string | undefined;
  while (true) {
    const action = await showNetworkPage(ctx, {
      title: `Network rule · ${destination}`,
      subtitle: `Editing ${target.source} · Filter Done saves immediately · Esc: back; unfinished edits discarded, saved changes kept.`,
    }, [
      {
        id: 'source', label: 'Scope', currentValue: target.source,
        description: 'Changing scope loads its saved rule and discards unfinished edits. Block wins across scopes; Local cannot override Global filters.',
        values: [''],
      },
      {
        id: 'access', label: 'Access', currentValue: access,
        description: 'Enter/Space cycles Allow → Filtered → Block; Save commits. HTTPS requires inspection; pinned/mTLS clients and raw TCP are unsupported.',
        values: [''],
      },
      {
        id: 'filters', label: 'Request filters…',
        currentValue: access === 'Block'
          ? 'Inactive — blocked'
          : (requests.length === 0 ? 'None — Add filter…' : `${requests.length} patterns${access === 'Allow' ? ' (inactive)' : ''}`),
        description: access === 'Block'
          ? 'Choose Allow or Filtered before editing filters.'
          : 'Done on any filter screen saves Filtered access immediately. To allow everything, explicitly choose Allow and Save.',
        values: [''],
      },
      {
        id: 'save', label: 'Save', currentValue: '', values: [''],
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
        target = scope;
        stored = target.store.config.sandbox?.network?.find(rule => rule.destination === destination);
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

      await editRequestFilters(ctx, requests, saveFilters);
      continue;
    }

    if (action === 'remove') {
      const isConfirmed = await ctx.ui.confirm(`Remove ${destination} from ${target.source}?`, 'Only this scope is removed. Rules in the other scope still apply.');
      if (isConfirmed && await saveNetworkRule(ctx, target, destination, undefined)) {
        return destination;
      }

      continue;
    }

    if (action !== 'save') {
      continue;
    }

    const result = networkRuleSchema.safeParse({destination, access: access === 'Block' ? 'block' : 'allow', ...(access === 'Filtered') && {requests}});
    if (!result.success) {
      ctx.ui.notify('Filtered access requires at least one valid request pattern.', 'warning');
      continue;
    }

    if (await saveNetworkRule(ctx, target, destination, result.data)) {
      return destination;
    }
  }
}
