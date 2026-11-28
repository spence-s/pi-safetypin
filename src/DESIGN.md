# V2 design notes

## How we work

V2 is a minimal proof of concept. The goal is an API that's easy to read and use, both inside Safety Pin and for add-on authors who want to sandbox their own operations.

Start with what the caller should write. Prefer the API already there. When a change is needed, keep it direct and inline, with minimal comments. Skip speculative abstractions, edge-case polish, and new tests at this stage. Keep the sandbox boundary intact.

Discuss and plan freely, but don't change files without an explicit request. Record agreed decisions here; don't turn proposals into decisions.

When making changes, focus on extremely small and focused edits. Stop and check in with the user frequently to ensure we are following an agreed upon path. Always attempt to work on the smallest unit of work at a time as possible.
For example, work in a single funcion, then check in, work in a single file, then check in, then tie the work together across multiple files. Work should start small and tie in together as the work expands in an agreed upon way.

Source now lives in `src/`; the package root exports the API and Pi loads `src/extension.ts`. V1 and its tests have been removed.

## V2 is Safety Pin's starting point

V2 is a clean starting point for Safety Pin, not a user migration from V1 or earlier experimental configurations. Do not add migration guards, legacy-field detection, compatibility exceptions, or configuration conversion unless explicitly requested. Define and validate V2's own configuration without special handling for V1 settings.

Playwright and sub-agents are planned as first-party Safety Pin add-ons using the same `getSafetyPin()` API as other add-ons. That work is not part of the current scope.

## Agreed API

- `getSafetyPin()` is the entry point. If Safety Pin is already active, callers get the same instance.
- Otherwise, callers can use the default config, supply their own, or use the exported `loadConfig()` to load and compose it themselves.
- No separate factory or lifecycle API is needed for this use case.
- V2 reads `safetypin.json` from the Pi agent directory (`PI_CODING_AGENT_DIR` or `~/.pi/agent`) and `.pi/safetypin.json` from the project.

- V2 config nests SRT fields and Safety Pin sandbox options under `sandbox`.

## Agreed HOME behavior

- `sandbox.isolatedHome` defaults to `false`: commands use the host home directory as `HOME` so tools can discover their usual configuration paths.
- Set it to `true` to use the temporary sandbox directory as `HOME` instead.
- This setting grants no filesystem access. Existing home restrictions remain; users explicitly allow the tool configuration/cache paths they need.
- Temporary files remain in sandbox scratch space in either mode.

## Agreed settings navigation

- Use one settings menu, with no Global or Local mode to choose up front.
- Filesystem Access and Network Access each show global and local rules together and let users edit either scope without leaving the screen.
- Make the scope explicit for each edit: Global applies to all projects; Local applies to the current project. Leave the layout and interaction details open.
- Settings screens use an explicit loop rather than recursively reopening the screen. Saving or canceling an edit returns to the screen; canceling from the screen exits it.

## Implemented network editor and policy

- Network Access shows one row per canonical HTTP/HTTPS origin with combined Allow / Block / Filtered access. Existing rules edit their current scope (Local first when both exist); new destinations choose scope before editing, without creating a rule yet.
- Methods, paths, prefixes, and accepted header values use comma-separated, prefilled single-line inputs. Quoted JSON strings preserve literal commas and surrounding whitespace.
- Completed access changes, field submissions, and filter/header removals immediately save the complete valid rule to the selected scope. Esc only navigates back; canceling a text editor discards only its unfinished input. Rejected field input remains in its editor for correction or retry. New destinations remain uncreated until access is explicitly chosen or the first valid filter is completed.
- The Access option toggles only Allow / Block and saves immediately. Block rules retain optional inactive filters across reopening; editing those filters does not unblock the origin. The destination list still summarizes filtered allows as Filtered. Removing the final filter saves without confirmation (unrestricted Allow for allowed rules; Block stays Block). Rule removal confirms the selected scope.
- Network destinations without a scheme default to HTTPS, except `localhost` (including ports), which defaults to HTTP. Explicit schemes are preserved; validation still requires an exact origin.
- `sandbox.network` is an array of destination rules, not a raw SRT network object.
- Unlisted origins are blocked; a block in either scope wins. All matching filtered entries must pass; alternatives within an entry use OR. Local cannot broaden a Global restriction.
- Edits save only the selected source. Removing one scope's entry leaves the other intact. Changes apply after `/reload` or restarting Pi.
- Origin enforcement uses request inspection, including for unrestricted HTTPS allows. SRT manages TLS termination; opaque CONNECT/SOCKS traffic is refused. Pinned/mTLS clients and raw TCP may be incompatible. No user-facing inspection bypass or raw-SRT network escape hatch is exposed.
- `CONFIG_REFERENCE.md` describes the implemented network format, composition, and runtime compatibility. Filesystem object-rule proposals remain unresolved.
