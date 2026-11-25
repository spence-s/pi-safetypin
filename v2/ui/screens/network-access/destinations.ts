import type {ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {truncateToWidth} from '@earendil-works/pi-tui';
import {showNetworkPage, type ScopedRule} from './utilities.ts';

/**
 * Shows both scopes together without mixing navigation with writes.
 */
export async function showDestinations(ctx: ExtensionCommandContext, entries: ScopedRule[], selectedId: string | undefined): Promise<string | undefined> {
  const destinations = [...new Set(entries.map(({rule}) => rule.destination))];
  return showNetworkPage(ctx, {title: 'Network Access', subtitle: 'Unlisted origins are blocked · Global + Local · Changes apply after /reload or restarting Pi.'}, [
    ...destinations.map(destination => {
      const matches = entries.filter(({rule}) => rule.destination === destination);
      const access = matches.some(({rule}) => rule.access === 'block') ? 'Block' : (matches.some(({rule}) => rule.access === 'allow' && rule.requests !== undefined) ? 'Filtered' : 'Allow');
      return {
        id: destination,
        label: truncateToWidth(destination, 36),
        currentValue: `${access.padEnd(12)}  ${matches.map(({scope}) => scope).join(' + ')}`,
        description: [destination, ...matches.map(({scope, rule}) => {
          const summary = rule.access === 'block' ? 'Block' : (rule.requests === undefined ? 'Allow' : JSON.stringify(rule.requests));
          return `${scope}: ${summary}`;
        })].join(' · '),
        values: [''],
      };
    }),
    {
      id: 'add', label: 'Add network rule…', currentValue: '', values: [''],
    },
  ], selectedId);
}
