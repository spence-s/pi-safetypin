import type {ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {requestSchema, type RequestPattern} from '../../../config/index.ts';
import {editHeaders} from './headers.ts';
import {showNetworkPage} from './utilities.ts';

/**
 * Validates replacements before changing the draft, so cancel preserves the original conditions.
 */
export async function editRequest(ctx: ExtensionCommandContext, index: number, request: RequestPattern | undefined): Promise<RequestPattern | 'remove' | undefined> {
  const pattern = structuredClone(request ?? {});
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
      return undefined;
    }

    if (field === 'remove') {
      return 'remove';
    }

    if (field === 'done') {
      const result = requestSchema.safeParse(pattern);
      if (!result.success) {
        ctx.ui.notify('Add at least one valid condition. Paths must start with /; methods and headers must be valid HTTP tokens.', 'warning');
        continue;
      }

      return result.data;
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
