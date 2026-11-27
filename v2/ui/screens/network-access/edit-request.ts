/* eslint-disable unicorn/no-break-in-nested-loop -- Retry loops keep unfinished input in its editor. */
/* eslint-disable unicorn/consistent-boolean-name -- Save operations return success so rejected edits keep the screen open. */
import type {ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import {requestSchema, type RequestPattern} from '../../../config/index.ts';
import {editHeaders} from './headers.ts';
import {inputValues} from './input-values.ts';
import {showNetworkPage} from './utilities.ts';

/**
 * Saves accepted comma-separated fields as complete patterns, retaining rejected values for correction or retry.
 */
export async function editRequest(
  ctx: ExtensionCommandContext,
  index: number,
  request: RequestPattern | undefined,
  save: (pattern: RequestPattern | 'remove') => Promise<boolean>,
): Promise<void> {
  let pattern = structuredClone(request ?? {});

  /**
   * Saves headers with the other conditions so an empty or invalid pattern cannot replace a valid one.
   */
  async function saveHeaders(headers: Record<string, string[]>): Promise<boolean> {
    const result = requestSchema.safeParse({...pattern, headers});
    if (!result.success) {
      ctx.ui.notify('Keep at least one valid condition. To clear the final condition, remove the pattern instead.', 'warning');
      return false;
    }

    if (!await save(result.data)) {
      return false;
    }

    pattern = result.data;
    return true;
  }

  while (true) {
    const field = await showNetworkPage(ctx, {
      title: `Request pattern ${index + 1}`,
      subtitle: 'Conditions combine with AND · Accepted fields save automatically · Esc: back.',
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

    if (field === 'headers') {
      await editHeaders(ctx, pattern.headers ?? {}, saveHeaders);
      continue;
    }

    if (field !== 'methods' && field !== 'paths' && field !== 'pathPrefixes') {
      continue;
    }

    let values = pattern[field] ?? [];
    const label = field === 'methods' ? 'Methods' : (field === 'paths' ? 'Exact paths' : 'Path prefixes');
    while (true) {
      const input = await inputValues(ctx, `${label} · Empty means unrestricted`, values);
      if (input === undefined) {
        break;
      }

      values = input;
      const conditions = values.filter(Boolean);
      const result = requestSchema.safeParse({
        ...pattern,
        [field]: conditions.length === 0 ? undefined : (field === 'methods' ? conditions.map(value => value.toUpperCase()) : conditions),
      });
      if (!result.success) {
        ctx.ui.notify('Keep at least one valid condition. Paths must start with /; methods must be valid HTTP tokens. Remove the pattern to clear its final condition.', 'warning');
        continue;
      }

      if (await save(result.data)) {
        pattern = result.data;
        break;
      }
    }
  }
}
