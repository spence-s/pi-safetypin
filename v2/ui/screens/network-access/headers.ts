/* eslint-disable unicorn/no-break-in-nested-loop -- Retry loops keep unfinished input in its editor. */
/* eslint-disable unicorn/consistent-boolean-name -- Save operations return success so rejected edits keep the screen open. */
import type {ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {requestSchema} from '../../../config/index.ts';
import {inputValues} from './input-values.ts';
import {showNetworkPage} from './utilities.ts';

/**
 * Saves complete comma-separated header values or removals; choosing a name alone never creates a condition.
 */
export async function editHeaders(
  ctx: ExtensionCommandContext,
  headers: Record<string, string[]>,
  save: (headers: Record<string, string[]>) => Promise<boolean>,
): Promise<void> {
  let saved = structuredClone(headers);
  while (true) {
    const selection = await showNetworkPage(ctx, {
      title: 'Request headers',
      subtitle: 'Every header must match an exact value; names are case-insensitive · Accepted values save automatically · Esc: back.',
    }, [
      ...Object.entries(saved).map(([name, values]) => ({
        id: `header:${name}`, label: name, currentValue: JSON.stringify(values), values: [''],
      })),
      {
        id: 'add', label: 'Add header…', currentValue: '', values: [''],
      },
    ]);
    if (selection === undefined) {
      return;
    }

    let name = selection.slice(7);
    if (selection === 'add') {
      while (true) {
        const input = await ctx.ui.input('Header name');
        if (input === undefined) {
          name = '';
          break;
        }

        const normalized = input.trim().toLowerCase();
        const validation = requestSchema.safeParse({headers: {[normalized]: ['']}});
        if (validation.success) {
          name = Object.keys(saved).find(key => key.toLowerCase() === normalized) ?? normalized;
          break;
        }

        ctx.ui.notify('Enter a valid HTTP header name.', 'warning');
      }

      if (name === '') {
        continue;
      }
    } else {
      const action = await ctx.ui.select(`Header ${name}`, ['Edit accepted values', 'Remove header']);
      if (action === undefined) {
        continue;
      }

      if (action === 'Remove header') {
        const next = Object.fromEntries(Object.entries(saved).filter(([key]) => key !== selection.slice(7)));
        if (await save(next)) {
          saved = next;
        }

        continue;
      }
    }

    let values = saved[name] ?? [''];
    while (true) {
      const input = await inputValues(ctx, `Accepted values for ${name} · Empty accepts an empty value`, values);
      if (input === undefined) {
        break;
      }

      values = input;
      const validation = requestSchema.safeParse({headers: {[name]: values}});
      if (!validation.success) {
        ctx.ui.notify('Header values must be valid HTTP header text without control characters.', 'warning');
        continue;
      }

      const next = {...saved, [name]: values};
      if (await save(next)) {
        saved = next;
        break;
      }
    }
  }
}
