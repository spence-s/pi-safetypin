# V2 design notes

## How we work

V2 is a minimal proof of concept. The goal is an API that's easy to read and use, both inside Safety Pin and for add-on authors who want to sandbox their own operations.

Start with what the caller should write. Prefer the API already there. When a change is needed, keep it direct and inline, with minimal comments. Skip speculative abstractions, edge-case polish, and new tests at this stage. Keep the sandbox boundary intact.

Discuss and plan freely, but don't change files without an explicit request. Record agreed decisions here; don't turn proposals into decisions.

When making changes, focus on extremely small and focused edits. Stop and check in with the user frequently to ensure we are following an agreed upon path. Always attempt to work on the smallest unit of work at a time as possible.
For example, work in a single funcion, then check in, work in a single file, then check in, then tie the work together across multiple files. Work should start small and tie in together as the work expands in an agreed upon way.

Leave `package.json` and package wiring out of scope for now.

## V1 migration plan

V2 is an incremental improvement over V1. We’re already migrating parts of V1. Later, we’ll move V1’s Playwright extension and sub-agents into first-party Safety Pin add-ons that use the same `getSafetyPin()` API as other add-ons. Both migrations are planned, not part of the current work.

## Agreed API

- `getSafetyPin()` is the entry point. If Safety Pin is already active, callers get the same instance.
- Otherwise, callers can use the default config, supply their own, or use the exported `loadConfig()` to load and compose it themselves.
- No separate factory or lifecycle API is needed for this use case.
- V2 reads `safetypin.json` from the Pi agent directory (`PI_CODING_AGENT_DIR` or `~/.pi/agent`) and `.pi/safetypin.json` from the project. Existing V2 `sandbox.json` files must be renamed manually; V1 config is unchanged.

- V2 config nests SRT fields and Safety Pin sandbox options under `sandbox`. Existing root-level SRT fields must be moved manually; old layouts are rejected.

## Agreed settings navigation

- Use one settings menu, with no Global or Local mode to choose up front.
- Filesystem Access and Network Access each show global and local rules together and let users edit either scope without leaving the screen.
- Make the scope explicit for each edit: Global applies to all projects; Local applies to the current project. Leave the layout and interaction details open.
- As V1 settings screens move to V2, use an explicit loop rather than recursively reopening the screen. Saving or canceling an edit returns to the screen; canceling from the screen exits it.
