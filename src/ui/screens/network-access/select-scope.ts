import type {ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {showNetworkPage, type NetworkScope} from './utilities.ts';

/**
 * Chooses where future saves belong without creating an unrestricted rule merely by choosing a scope.
 */
export async function selectScope(ctx: ExtensionCommandContext, destination: string, scopes: NetworkScope[], selectedId = 'Local'): Promise<NetworkScope | undefined> {
  const source = await showNetworkPage(ctx, {
    title: `Scope for ${destination}`,
    subtitle: 'Choose where edits will be saved. Choosing a scope alone does not create a rule.',
  }, scopes.map(scope => ({
    id: scope.source,
    label: scope.label,
    currentValue: '',
    description: 'Only this scope is edited. Block wins across scopes; Local cannot override Global filters.',
    values: [''],
  })), selectedId);
  return scopes.find(scope => scope.source === source);
}
