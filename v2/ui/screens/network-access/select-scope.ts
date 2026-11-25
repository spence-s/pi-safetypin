import type {ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import type {NetworkRule} from '../../../config/index.ts';
import {
  showNetworkPage,
  type NetworkScope,
  type ScopedRule,
  type Scope,
} from './utilities.ts';

/**
 * Previews the combined policy without allowing one scope to erase the other's restrictions.
 */
export async function selectScope(
  ctx: ExtensionCommandContext,
  {destination, access, source, rule}: {destination: string; access: string; source: Scope; rule: NetworkRule | undefined},
  matches: ScopedRule[],
  scopes: NetworkScope[],
): Promise<string | undefined> {
  return showNetworkPage(ctx, {
    title: `${rule === undefined ? 'Remove rule from' : `Save “${access}” for`} ${destination}`,
    subtitle: 'Enter commits to this scope only. Existing values in that scope are replaced; the other scope stays unchanged.',
  }, scopes.filter(scope => rule !== undefined || matches.some(entry => entry.scope === scope.source)).map(scope => {
    const remaining = matches.filter(entry => entry.scope !== scope.source).map(entry => entry.rule);
    if (rule !== undefined) {
      remaining.push(rule);
    }

    const effective = remaining.length === 0 || remaining.some(entry => entry.access === 'block')
      ? 'Block'
      : (remaining.some(entry => entry.requests !== undefined) ? 'Filtered' : 'Allow');
    return {
      id: scope.source, label: scope.label, currentValue: `Effective: ${effective}`,
      description: rule === undefined
        ? 'Removes only this rule. Rules from the other scope still apply.'
        : 'Block wins in either scope. All matching filters must pass; Allow cannot cancel another scope’s filters.',
      values: [''],
    };
  }), source);
}
