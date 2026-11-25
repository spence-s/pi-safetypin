import type {ExtensionCommandContext} from '@earendil-works/pi-coding-agent';
import type {RequestPattern} from '../../../config/index.ts';
import {editRequest} from './edit-request.ts';
import {showNetworkPage} from './utilities.ts';

/**
 * Keeps alternative request patterns separate from the ordinary allow/block form.
 */
export async function editRequestFilters(ctx: ExtensionCommandContext, requests: RequestPattern[]): Promise<void> {
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
    const pattern = await editRequest(ctx, index, requests[index]);
    if (pattern === 'remove') {
      requests.splice(index, 1);
    } else if (pattern !== undefined) {
      requests[index] = pattern;
    }
  }
}
