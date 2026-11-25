/* eslint-disable unicorn/consistent-boolean-name -- Save operations return success so rejected edits keep the screen open. */
import type {ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import type {RequestPattern} from '../../../config/index.ts';
import {editRequest} from './edit-request.ts';
import {showNetworkPage} from './utilities.ts';

/**
 * Updates the in-memory list only after persistence succeeds, so backing out cannot undo completed saves.
 */
export async function editRequestFilters(ctx: ExtensionCommandContext, requests: RequestPattern[], save: (requests: RequestPattern[]) => Promise<boolean>): Promise<void> {
  while (true) {
    const selection = await showNetworkPage(ctx, {title: 'Request filters', subtitle: 'Any pattern may match · Done saves · Esc: back; saved changes kept.'}, [
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
    if (selection === undefined) {
      return;
    }

    if (selection === 'done') {
      if (await save(requests)) {
        return;
      }

      continue;
    }

    const index = selection === 'add' ? requests.length : Number(selection);

    /**
     * Includes the other patterns in each save, while rejected edits leave the saved list untouched.
     */
    async function savePattern(pattern: RequestPattern | 'remove'): Promise<boolean> {
      const next = [...requests];
      if (pattern === 'remove') {
        next.splice(index, 1);
      } else {
        next[index] = pattern;
      }

      if (!await save(next)) {
        return false;
      }

      requests.splice(0, requests.length, ...next);
      return true;
    }

    await editRequest(ctx, index, requests[index], savePattern);
  }
}
