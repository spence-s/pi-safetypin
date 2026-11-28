import type {Config} from '../config/index.ts';

export const permissions = ['allowRead', 'allowWrite', 'denyRead', 'denyWrite'] as const;
export const accessOptions = [
  {label: 'Read/Write', rules: ['allowRead', 'allowWrite']},
  {label: 'Read only', rules: ['allowRead', 'denyWrite']},
  {label: 'No access', rules: ['denyRead', 'denyWrite']},
  {label: 'Remove rule', rules: []},
] as const;
export type Permission = typeof permissions[number];
export type Entry = NonNullable<NonNullable<NonNullable<Config['sandbox']>['filesystem']>['denyRead']>[number];
