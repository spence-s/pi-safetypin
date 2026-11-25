/* eslint-disable unicorn/consistent-boolean-name -- Save operations return success so rejected edits keep the screen open. */
import type {ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {requestSchema, type RequestPattern} from '../../../config/index.ts';
import {editHeaders} from './headers.ts';
import {showNetworkPage} from './utilities.ts';

/**
 * Validates complete patterns at every Done boundary while leaving unfinished edits local to this screen.
 */
export async function editRequest(
  ctx: ExtensionCommandContext,
  index: number,
  request: RequestPattern | undefined,
  save: (pattern: RequestPattern | 'remove') => Promise<boolean>,
): Promise<void> {
  const pattern = structuredClone(request ?? {});
  while (true) {
    const field = await showNetworkPage(ctx, {
      title: `Request pattern ${index + 1}`,
      subtitle: 'Conditions combine with AND · Done saves · Esc: back; unfinished edits discarded, saved changes kept.',
    }, [
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
      return;
    }

    if (field === 'remove') {
      if (await save('remove')) {
        return;
      }

      continue;
    }

    if (field === 'done') {
      const result = requestSchema.safeParse(pattern);
      if (!result.success) {
        ctx.ui.notify('Add at least one valid condition. Paths must start with /; methods and headers must be valid HTTP tokens.', 'warning');
        continue;
      }

      if (await save(result.data)) {
        return;
      }

      continue;
    }

    if (field === 'headers') {
      /**
       * Header Done saves the entire pattern, including any other completed conditions on this screen.
       */
      async function saveHeaders(headers: Record<string, string[]>): Promise<boolean> {
        const result = requestSchema.safeParse({...pattern, headers});
        if (!result.success) {
          ctx.ui.notify('Keep at least one valid condition. Check methods and paths in the pattern editor.', 'warning');
          return false;
        }

        if (!await save(result.data)) {
          return false;
        }

        pattern.headers = headers;
        return true;
      }

      await editHeaders(ctx, pattern.headers ?? {}, saveHeaders);
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
