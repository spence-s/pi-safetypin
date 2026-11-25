import type {ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {requestSchema} from '../../../config/index.ts';
import {showNetworkPage} from './utilities.ts';

/**
 * Keeps header conditions editable without requiring users to write configuration JSON.
 */
export async function editHeaders(ctx: ExtensionCommandContext, headers: Record<string, string[]>): Promise<Record<string, string[]>> {
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

