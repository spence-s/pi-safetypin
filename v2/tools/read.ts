import {Buffer} from 'node:buffer';
import {realpathSync} from 'node:fs';
import {createReadTool, type ReadOperations} from '@earendil-works/pi-coding-agent';
import type {SafetyPin} from '../safety-pin.ts';

/**
 * Shares sandboxed reads with edit and grep without invoking another tool.
 */
export function createReadOperations(safetyPin: SafetyPin): ReadOperations {
  return {
    /**
     * Opening without reading preserves OS errors and exercises per-command denial collection.
     */
    async access(path) {
      const quotedPath = `'${realpathSync(path).replaceAll('\'', '\'"\'"\'')}'`;
      const result = await safetyPin.run(`: < ${quotedPath}`, {reject: false});
      if (result.exitCode === 0) {
        return;
      }

      const message = result.stderr.trim().length > 0 ? result.stderr.trim() : `Cannot read ${path}`;
      const diagnostics = result.denials.map(denial => denial.line).join('\n');
      throw new Error(diagnostics.length > 0 ? `${message}\n\nSandbox observations:\n${diagnostics}` : message);
    },
    /**
     * Preserves binary content across the sandbox's shell boundary.
     */
    async readFile(path) {
      const quotedPath = `'${realpathSync(path).replaceAll('\'', '\'"\'"\'')}'`;
      const {process} = await safetyPin.spawn(`base64 < ${quotedPath}`, {reject: false});
      const result = await process;
      if (result.exitCode !== 0) {
        throw new Error(result.stderr.trim().length > 0 ? result.stderr.trim() : `Cannot read ${path}`);
      }

      return Buffer.from(result.stdout, 'base64');
    },
    /**
     * Keeps image inspection subject to the same policy as reading the file.
     */
    async detectImageMimeType(path) {
      const quotedPath = `'${realpathSync(path).replaceAll('\'', '\'"\'"\'')}'`;
      const {process} = await safetyPin.spawn(`file --mime-type -b -- ${quotedPath}`, {reject: false});
      const result = await process;
      if (result.exitCode !== 0) {
        throw new Error(result.stderr.trim().length > 0 ? result.stderr.trim() : `Cannot identify ${path}`);
      }

      const mime = result.stdout.trim();
      return ['image/gif', 'image/jpeg', 'image/png', 'image/webp'].includes(mime) ? mime : null;
    },
  };
}

/**
 * Retains Pi's read behavior while replacing its filesystem access.
 */
export function createSandboxReadTool(cwd: string, safetyPin: SafetyPin): ReturnType<typeof createReadTool> {
  return createReadTool(cwd, {operations: createReadOperations(safetyPin)});
}
