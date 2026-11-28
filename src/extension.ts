import type {ExtensionAPI} from '@earendil-works/pi-coding-agent';
import {getSafetyPin} from './api.ts';
import type {SafetyPin} from './safety-pin.ts';
import {SafetyPinTools} from './tools/index.ts';
import {registerSafetyPinUiCommand} from './ui/index.ts';

/**
 * Shares the process-wide Safety Pin instance with add-ons while keeping shutdown owned by Pi.
 */
export default function SafetyPinExtension(pi: ExtensionAPI): void {
  let safetyPin: SafetyPin | undefined;

  registerSafetyPinUiCommand(pi);

  pi.on('session_start', async (_event, ctx) => {
    const {cwd} = ctx;
    safetyPin = await getSafetyPin({cwd});
    await safetyPin.start();
    new SafetyPinTools(pi, cwd, safetyPin).register();
  });

  pi.on('before_agent_start',
    /**
     * Reflects active tools and running policy without enabling tools or rereading unapplied settings.
     */
    event => {
      if (safetyPin === undefined) {
        return;
      }

      const selectedTools = event.systemPromptOptions.selectedTools ?? pi.getActiveTools();
      const sandboxedTools = ['bash', 'read', 'write', 'edit', 'find', 'grep', 'ls'].filter(name => selectedTools.includes(name));
      const {cwd, scratchPath, home, filesystem, network} = safetyPin.getEnvironment();
      const destinations = Map.groupBy(network, rule => rule.destination);
      const networkSummary: string[] = [];
      for (const [destination, entries] of destinations) {
        if (entries.some(rule => rule.access === 'block')) {
          networkSummary.push(`- Blocked: ${JSON.stringify(destination)}.`);
          continue;
        }

        const filters = entries.filter(rule => rule.requests !== undefined);
        networkSummary.push(`- ${filters.length === 0 ? 'Allowed' : 'Filtered'}: ${JSON.stringify(destination)}.`);
        for (const entry of filters) {
          const patterns = entry.requests!.map(
            /**
             * Header values can contain credentials; describe the requirement without disclosing them.
             */
            ({methods, paths, pathPrefixes, headers}) => ({
              methods,
              paths,
              pathPrefixes,
              ...(headers !== undefined && {requiredHeaders: Object.keys(headers)}),
            }),
          );
          networkSummary.push(`  - Must match one of these request patterns: ${JSON.stringify(patterns)}.`);
        }
      }

      event.systemPromptOptions.sections.safety_pin = [
        'Safety Pin environment',
        `- Temporary workspace: ${JSON.stringify(scratchPath)}. Use $TMPDIR for temporary files, not /tmp. This directory is removed when the sandbox stops.`,
        '- TMPDIR and CLAUDE_CODE_TMPDIR point to this temporary workspace.',
        `- Working directory: ${JSON.stringify(cwd)}.`,
        `- HOME: ${JSON.stringify(home)}. HOME does not grant filesystem access.`,
        '',
        sandboxedTools.length > 0
          ? `Active Safety Pin sandboxed tools: ${sandboxedTools.join(', ')}.`
          : 'No Safety Pin sandboxed tools are currently active.',
        'Filesystem policy for Safety Pin sandboxed operations:',
        ...(filesystem.disabled
          ? ['- Filesystem isolation is disabled; configured path restrictions do not apply.']
          : [
            `Write grants (allowWrite):\n  - ${filesystem.allowWrite?.join(',\n  - ') ?? 'None'}.`,
            `Write restrictions (denyWrite):\n  - ${filesystem.denyWrite?.join(',\n  - ') ?? 'None'}.\n Write restrictions override grants.`,
            `Read restrictions (denyRead):\n  - ${filesystem.denyRead?.join(',\n  - ') ?? 'None'}.\n Never attempt to access a denyRead path.`,
            `Read exceptions (allowRead):\n  - ${filesystem.allowRead?.join(',\n  - ') ?? 'None'}.\n These can reopen restricted regions; more-specific read restrictions still apply.`,
            '- Other paths are generally readable, but not writable. Read exceptions are not a read allowlist.',
            '- Sandbox-managed runtime access and mandatory protections also apply; a configured grant does not guarantee access.',
          ]),
        '',
        'Network policy for Safety Pin sandboxed operations:',
        '- Unlisted HTTP/HTTPS origins are blocked. Origins include scheme, hostname, and port.',
        ...(networkSummary.length === 0 ? ['- No network origins are allowed.'] : networkSummary),
        '- A block in either scope wins. Every listed filter group for an origin must pass; patterns within a group are alternatives.',
        '- Conditions within a pattern must all pass. paths are exact URL pathnames; pathPrefixes match at segment boundaries. Exact paths and prefixes are alternatives.',
        '- requiredHeaders lists headers whose values must match configured accepted values; those values are intentionally omitted here. Filters do not supply credentials.',
        '- HTTPS requires TLS inspection. Certificate-pinned/mTLS clients may fail; opaque tunnels and raw TCP are not supported.',
        '',
        '- Other extensions and tools are outside this boundary unless they provide their own isolation.',
        '- This section describes the currently active policy and supersedes earlier policy summaries. Earlier denials reflect the policy at that time, not a permanent prohibition.',
        '- Treat a sandbox denial as a boundary. Do not repeat a blocked operation unchanged under the same policy or bypass it using another tool or execution path.',
        '- Ask the user for permission changes. Saved settings take effect after /reload or restarting Pi.',
        '- After a user-authorized permission change and reload or restart, you may retry blocked operations through Safety Pin under the updated policy. Reload alone does not grant access.',
        '- Do not automatically replay blocked commands. Check for partial side effects before retrying.',
      ].join('\n');
    },
  );

  pi.on('session_shutdown', async () => {
    await safetyPin?.stop();
    safetyPin = undefined;
  });
}
