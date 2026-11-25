/* eslint-disable unicorn/no-break-in-nested-loop -- Screen loops keep draft edits separate from list navigation. */
import {getSettingsListTheme, type ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {
  Container,
  SettingsList,
  Text,
  truncateToWidth,
  type SettingItem,
} from '@earendil-works/pi-tui';
import {
  getConfigStores,
  networkRuleSchema,
  requestSchema,
  type NetworkRule,
  type RequestPattern,
} from '../../config/index.ts';

type Scope = 'Local' | 'Global';
type ScopedRule = {scope: Scope; rule: NetworkRule};

/**
 * Keeps network editing consistent with the filesystem screen's presentation.
 */
async function showNetworkPage(
  {ui}: ExtensionCommandContext,
  {title, subtitle}: {title: string; subtitle: string},
  items: SettingItem[],
  selectedId?: string,
): Promise<string | undefined> {
  return ui.custom<string | undefined>((tui, theme, _keybindings, done) => {
    const container = new Container();
    const heading = theme.fg('accent', theme.bold(title));
    container.addChild(new Text(heading, 0, 0));
    container.addChild(new Text(theme.fg('muted', subtitle), 0, 1));
    const list = new SettingsList(items, 15, getSettingsListTheme(), done, () => {
      done(undefined);
    });
    if (selectedId !== undefined) {
      list.selectItem(selectedId);
    }

    container.addChild(list);
    return Object.assign(container, {
      /**
       * Keeps the shared list responsible for keyboard navigation and search.
       */
      handleInput(data: string) {
        list.handleInput(data);
        tui.requestRender();
      },
    });
  });
}

/**
 * Keeps header conditions editable without requiring users to write configuration JSON.
 */
async function editHeaders(ctx: ExtensionCommandContext, headers: Record<string, string[]>): Promise<Record<string, string[]>> {
  let draft = structuredClone(headers);
  while (true) {
    const selection = await showNetworkPage(ctx, {title: 'Request headers', subtitle: 'Every named header must match one accepted exact value. Names are case-insensitive.'}, [
      ...Object.entries(draft).map(([name, values]) => ({
        id: `header:${name}`, label: name, currentValue: JSON.stringify(values), values: [''],
      })),
      {
        id: 'add', label: 'Add header…', currentValue: '', values: [''],
      },
      {
        id: 'done', label: 'Done', currentValue: '', values: [''],
      },
    ]);
    if (selection === undefined || selection === 'done') {
      return draft;
    }

    let name = selection.slice(7);
    if (selection === 'add') {
      const input = await ctx.ui.input('Header name');
      if (input === undefined) {
        continue;
      }

      name = input.trim().toLowerCase();
      const validation = requestSchema.safeParse({headers: {[name]: ['']}});
      if (!validation.success) {
        ctx.ui.notify('Enter a valid HTTP header name.', 'warning');
        continue;
      }

      name = Object.keys(draft).find(key => key.toLowerCase() === name) ?? name;
    } else {
      const action = await ctx.ui.select(`Header ${name}`, ['Edit accepted values', 'Remove header']);
      if (action === undefined) {
        continue;
      }

      if (action === 'Remove header') {
        draft = Object.fromEntries(Object.entries(draft).filter(([key]) => key !== name));
        continue;
      }
    }

    const input = await ctx.ui.editor(`Accepted values for ${name} · One per line; empty accepts an empty value`, draft[name]?.join('\n') ?? '');
    if (input === undefined) {
      continue;
    }

    const values = input.split('\n');
    const validation = requestSchema.safeParse({headers: {[name]: values}});
    if (!validation.success) {
      ctx.ui.notify('Header values must be valid HTTP header text without control characters.', 'warning');
      continue;
    }

    draft = {...draft, [name]: values};
  }
}

/**
 * Keeps alternative request patterns separate from the ordinary allow/block form.
 */
async function editRequestFilters(ctx: ExtensionCommandContext, requests: RequestPattern[]): Promise<void> {
  while (true) {
    const selection = await showNetworkPage(ctx, {title: 'Request filters', subtitle: 'Any pattern may match. Changes here remain in the draft.'}, [
      ...requests.map((request, index) => ({
        id: String(index),
        label: `Pattern ${index + 1}`,
        currentValue: `${request.methods?.join(', ') ?? 'Any method'} · ${[...request.paths ?? [], ...request.pathPrefixes?.map(path => `${path} (prefix)`) ?? []].join(', ')}`,
        values: [''],
      })),
      {
        id: 'add', label: 'Add pattern…', currentValue: '', values: [''],
      },
      {
        id: 'done', label: 'Done', currentValue: '', values: [''],
      },
    ]);
    if (selection === undefined || selection === 'done') {
      return;
    }

    const index = selection === 'add' ? requests.length : Number(selection);
    const pattern: RequestPattern = structuredClone(requests[index] ?? {});
    while (true) {
      const field = await showNetworkPage(ctx, {title: `Request pattern ${index + 1}`, subtitle: 'Conditions combine with AND; exact paths and prefixes are alternatives.'}, [
        {
          id: 'methods', label: 'Methods', currentValue: pattern.methods?.join(', ') ?? 'Not restricted', values: [''],
        },
        {
          id: 'paths', label: 'Exact paths', currentValue: pattern.paths?.join(', ') ?? 'Not restricted', values: [''],
        },
        {
          id: 'pathPrefixes', label: 'Path prefixes',
          currentValue: pattern.pathPrefixes?.join(', ') ?? 'Not restricted',
          description: 'Prefixes match at segment boundaries: /repos/org does not match /repos/organization.', values: [''],
        },
        {
          id: 'headers', label: 'Headers…', currentValue: `${Object.keys(pattern.headers ?? {}).length} conditions`, values: [''],
        },
        {
          id: 'done', label: 'Done', currentValue: '', values: [''],
        },
        {
          id: 'remove', label: 'Remove pattern', currentValue: '', values: [''],
        },
      ]);
      if (field === undefined) {
        break;
      }

      if (field === 'remove') {
        requests.splice(index, 1);
        break;
      }

      if (field === 'done') {
        const result = requestSchema.safeParse(pattern);
        if (!result.success) {
          ctx.ui.notify('Add at least one valid condition. Paths must start with /; methods and headers must be valid HTTP tokens.', 'warning');
          continue;
        }

        requests[index] = result.data;
        break;
      }

      if (field === 'headers') {
        pattern.headers = await editHeaders(ctx, pattern.headers ?? {});
        continue;
      }

      if (field !== 'methods' && field !== 'paths' && field !== 'pathPrefixes') {
        continue;
      }

      const input = await ctx.ui.editor(`${field} · One per line; empty means unrestricted`, pattern[field]?.join('\n') ?? '');
      if (input === undefined) {
        continue;
      }

      const values = input.split('\n').map(value => value.trim()).filter(Boolean);
      pattern[field] = values.length === 0 ? undefined : (field === 'methods' ? values.map(value => value.toUpperCase()) : values);
    }
  }
}

/**
 * Uses shared destination defaults and scoped writes so the editor matches file-based rules.
 */
export async function showNetworkAccess(ctx: ExtensionCommandContext): Promise<void> {
  if (ctx.mode !== 'tui') {
    return;
  }

  const {globalStore, projectStore} = getConfigStores(ctx.cwd);
  const scopes = [
    {source: 'Local' as const, label: 'Local · This project', store: projectStore},
    {source: 'Global' as const, label: 'Global · All projects', store: globalStore},
  ];
  let selectedId: string | undefined;
  try {
    while (true) {
      await Promise.all(scopes.map(async ({store}) => store.load()));
      const entries: ScopedRule[] = scopes.flatMap(({source, store}) => (store.config.sandbox?.network ?? []).map(rule => ({scope: source, rule})));
      const destinations = [...new Set(entries.map(({rule}) => rule.destination))];
      const selection = await showNetworkPage(ctx, {title: 'Network Access', subtitle: 'Unlisted origins are blocked · Global + Local · Changes apply after /reload or restarting Pi.'}, [
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
      if (selection === undefined) {
        return;
      }

      let destination = selection;
      if (selection === 'add') {
        const input = await ctx.ui.input('Destination · No path; defaults to HTTPS, or HTTP for localhost');
        if (input === undefined) {
          continue;
        }

        const result = networkRuleSchema.safeParse({destination: input.trim(), access: 'allow'});
        if (!result.success) {
          ctx.ui.notify('Enter an HTTP or HTTPS origin without credentials, paths, queries, fragments, or wildcards.', 'warning');
          continue;
        }

        destination = new URL(result.data.destination).origin;
      }

      selectedId = destination;
      const matches = entries.filter(({rule}) => rule.destination === destination);
      let source: Scope = matches.find(({scope}) => scope === 'Local')?.scope ?? matches[0]?.scope ?? 'Local';
      let stored = matches.find(({scope}) => scope === source)?.rule;
      let access = stored?.access === 'block' ? 'Block' : (stored?.requests === undefined ? 'Allow' : 'Filtered');
      let requests = structuredClone(stored?.access === 'allow' ? stored.requests ?? [] : []);
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
            id: 'access', label: 'Access', currentValue: access, values: [''],
          },
          ...access === 'Filtered'
            ? [{
              id: 'filters', label: 'Request filters…', currentValue: `${requests.length} patterns`, values: [''],
            }]
            : [],
          {
            id: 'continue', label: 'Continue…', currentValue: '', values: [''],
          },
          ...matches.length > 0
            ? [{
              id: 'remove', label: 'Remove rule…', currentValue: '', values: [''],
            }]
            : [],
        ]);
        if (action === undefined) {
          break;
        }

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
          access = await ctx.ui.select('Access', ['Allow', 'Block', 'Filtered']) ?? access;
          continue;
        }

        if (action === 'filters') {
          await editRequestFilters(ctx, requests);
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

        const targetScope = await showNetworkPage(ctx, {
          title: `${action === 'remove' ? 'Remove rule from' : `Save “${access}” for`} ${destination}`,
          subtitle: 'Enter commits to this scope only. Existing values in that scope are replaced; the other scope stays unchanged.',
        }, scopes.filter(scope => action !== 'remove' || matches.some(entry => entry.scope === scope.source)).map(scope => {
          const remaining = matches.filter(entry => entry.scope !== scope.source).map(entry => entry.rule);
          if (action === 'continue' && result.success) {
            remaining.push(result.data);
          }

          const effective = remaining.length === 0 || remaining.some(rule => rule.access === 'block')
            ? 'Block'
            : (remaining.some(rule => rule.requests !== undefined) ? 'Filtered' : 'Allow');
          return {
            id: scope.source, label: scope.label, currentValue: `Effective: ${effective}`,
            description: action === 'remove'
              ? 'Removes only this rule. Rules from the other scope still apply.'
              : 'Block wins in either scope. All matching filters must pass; Allow cannot cancel another scope’s filters.',
            values: [''],
          };
        }), source);
        const target = scopes.find(scope => scope.source === targetScope);
        if (target === undefined) {
          continue;
        }

        const config = await target.store.load();
        const network = (config.sandbox?.network ?? []).filter(rule => rule.destination !== destination);
        if (action === 'continue' && result.success) {
          network.push(result.data);
        }

        target.store.config = {...config, sandbox: {...config.sandbox, network}};
        await target.store.save();
        ctx.ui.notify(`${action === 'remove' ? 'Removed from' : 'Saved to'} ${target.source}. Changes apply after /reload or restarting Pi.`, 'info');
        break;
      }
    }
  } catch (error) {
    ctx.ui.notify(`Network settings: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}
