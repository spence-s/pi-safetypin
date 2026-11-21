import {createEditTool, type EditOperations} from '@earendil-works/pi-coding-agent';
import type {SafetyPin} from '../safety-pin.ts';
import {createReadOperations} from './read.ts';
import {createWriteOperations} from './write.ts';

/**
 * Keeps edit on the same sandboxed read and write paths as the other tools.
 */
export function createEditOperations(safetyPin: SafetyPin): EditOperations {
  return {
    ...createReadOperations(safetyPin),
    ...createWriteOperations(safetyPin),
    /**
     * Requires both permissions before Pi attempts an edit.
     */
    async access(path) {
      const quotedPath = `'${path.replaceAll('\'', '\'"\'"\'')}'`;
      const {process} = await safetyPin.run(`test -r ${quotedPath} && test -w ${quotedPath}`, {reject: false});
      const result = await process;
      if (result.exitCode !== 0) {
        throw new Error(result.stderr.trim().length > 0 ? result.stderr.trim() : `Cannot edit ${path}`);
      }
    },
  };
}

/**
 * Retains Pi's edit matching and formatting without host filesystem writes.
 */
export function createSandboxEditTool(cwd: string, safetyPin: SafetyPin): ReturnType<typeof createEditTool> {
  return createEditTool(cwd, {operations: createEditOperations(safetyPin)});
}
