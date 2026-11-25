/* eslint-disable unicorn/consistent-boolean-name -- Save operations return success so rejected edits keep the screen open. */
import type {ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {requestSchema} from '../../../config/index.ts';
import {showNetworkPage} from './utilities.ts';

/**
 * Keeps unfinished headers local and closes Done only after the complete rule has been saved.
 */
export async function editHeaders(
  ctx: ExtensionCommandContext,
  headers: Record<string, string[]>,
  save: (headers: Record<string, string[]>) => Promise<boolean>,
): Promise<void> {
  let draft = structuredClone(headers);
  while (true) {
    const selection = await showNetworkPage(ctx, {
      title: 'Request headers',
      subtitle: 'Every header must match an exact value; names are case-insensitive · Done saves · Esc: back; unfinished edits discarded.',
    }, [
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
    if (selection === undefined) {
      return;
    }

    if (selection === 'done') {
      if (await save(draft)) {
        return;
      }

      continue;
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

