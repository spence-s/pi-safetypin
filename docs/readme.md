<p align="center">
  <img src="../assets/safety-pin.svg" width="250" height="250" alt="Safety Pin">
</p>

# Safety Pin

Control what your Pi agent can access.

Safety Pin runs Pi’s shell and filesystem tools inside [Anthropic Sandbox Runtime](https://github.com/anthropics/sandbox-runtime). Set filesystem and network rules without leaving Pi. Use the same sandbox in your own extensions.

> **V2 preview.** This README describes the coming V2 release. The sandbox and extension API are in development. Settings screens are incomplete. Features marked **Planned** are not ready to use.

**Demo placeholder:** a short GIF showing `/safetypin`, a permission change, and a successful retry. Record this when the workflow is ready.

## Contents

- [Why Safety Pin?](#why-safety-pin)
- [Quick start](#quick-start)
- [Control access](#control-access)
- [What it protects](#what-it-protects)
- [Build your own extension](#build-your-own-extension)
- [Guides and reference](#guides-and-reference)
- [Development](#development)
- [License](#license)

## Why Safety Pin?

Coding agents need access to your project. They do not need access to everything on your computer.

A shell command can read personal files, change files outside your project, or send data over the network. A prompt asking the agent not to do those things is not an access boundary.

Safety Pin brings permissions, sandboxing, and configuration into one extension. The V2 goal is a complete workflow, not just a sandbox wrapper or a series of approval prompts.

- **Permissions and sandboxing together.** Control what the agent may do and enforce filesystem and network boundaries around managed tools.
- **Full TUI configuration — Planned.** Manage permissions and sandbox settings inside Pi. See global and project rules together without hand-editing configuration files.
- **Choose how to sandbox MCP servers.** Use a launcher CLI to start a server inside the sandbox, or an optional transport integration for control over its launch configuration and explicit environment variables. Both are prototypes; packaging and user-facing setup are unfinished.
- **Keep MCP OAuth working — Design goal.** Add sandboxing without taking over or interrupting the MCP client’s OAuth flow. End-to-end compatibility is not verified yet.
- **Review access after the turn — Planned.** See what the agent tried to access, then choose what to allow or stop being asked about. No permission is granted automatically.
- **Share the sandbox.** Extension authors can use the same API and active policy instead of building a separate sandbox.

Safety Pin limits access. It does not decide whether a command is a good idea. A command can still damage files it is allowed to change.

## Quick start

### Prerequisites

- [Pi](https://pi.dev).
- Node.js 24 or newer.
- macOS: `ripgrep`.
- Linux: `bubblewrap`, `socat`, and `ripgrep`.

### Install the preview

```sh
pi install git:github.com/spence-s/pi-safetypin
```

Add `--local` to install for the current project only. Restart Pi or run `/reload`.

Do not load another extension that replaces the same tools alongside Safety Pin.

### Open settings

```text
/safetypin
```

The preview opens the settings menu. Filesystem settings are being built out. Network settings and the complete permission-editing workflow are not ready yet.

**Screenshot placeholder:** the main settings menu. Capture the V2 screen, not a legacy screen.

## Control access

### Filesystem access

The default policy gives managed tools read and write access to the current project. It also allows reading configured skill locations and using private temporary storage.

The rest of your home directory is denied by default when the project is outside it. **Do not launch from your home directory if you want that boundary:** the current project is an allowed workspace.

Use `$TMPDIR` or `mktemp` for temporary files. Do not assume `/tmp` is writable.

**Planned settings workflow:** review filesystem rules, select their scope, and save changes from the same screen.

**GIF placeholder:** add a project filesystem rule, save it, and return to the rule list.

### Network access

No network destinations are allowed by default. Add the destinations your tools need through configuration.

**Planned settings workflow:** review and edit allowed and denied destinations from the network screen.

**GIF placeholder:** allow one destination. Include a short written version of the steps beside the final clip.

### Detect and review access — Planned

Let the agent finish its turn before reviewing blocked access. Safety Pin will collect detected access attempts and offer a single review afterward, rather than stopping for each one.

For example, if the agent tried to reach GitHub, you could choose:

- **Allow access.** Add the relevant domain to the network configuration after you approve it.
- **Keep blocked and don’t ask again.** Save that choice so future turns do not keep asking about the same access.
- **Keep blocked and don’t ask this session.** Suppress further prompts for this session only.

Dismissing the review does not grant access. Suppressing a prompt does not grant access either. An allowance applies to later attempts; it does not mean the failed operation already succeeded.

The persistent choice may use a deny rule. The session-only choice may use in-memory state loaded into the review workflow. Those storage details are not settled. The review UI, detection coverage, and when policy changes take effect still need design work.

**GIF placeholder:** finish a turn with blocked GitHub access, review it, and choose an outcome.

### Global and project rules

V2 reads configuration from two locations:

| Scope | File | Applies to |
| --- | --- | --- |
| Global | `~/.pi/agent/safetypin.json` | All projects |
| Project | `.pi/safetypin.json` | The current project |

If `PI_CODING_AGENT_DIR` is set, the global file lives in that directory instead of `~/.pi/agent`.

**Planned settings workflow:** show both scopes together. Make the scope explicit on every edit. No separate global or local mode to choose first.

**Screenshot placeholder:** global and project rules displayed together.

## What it protects

Safety Pin replaces Pi’s `bash`, `read`, `write`, `edit`, `find`, `grep`, and `ls` tools with sandboxed versions.

It also protects operations that other extensions explicitly run through its API.

It does **not** sandbox:

- Pi itself.
- Extension code running on the host.
- Tools from other extensions that do not use Safety Pin.
- Commands you run outside Safety Pin.

Only install extensions you trust. Allowing a network destination lets sandboxed commands send data there. Allowing writes lets them modify or delete files within that access.

## Build your own extension

Your extension can use Safety Pin’s active sandbox. Users keep one policy instead of configuring a separate sandbox for every extension.

Use the API for commands that should respect the user’s filesystem and network rules.

### Run a sandboxed command

This is the current V2 API shape. It assumes the Safety Pin extension has already started its sandbox.

```ts
import {getSafetyPin} from 'pi-safetypin/v2';

const safetyPin = await getSafetyPin();
const {process: command} = await safetyPin.run('git status --short');
const {stdout} = await command;
```

`getSafetyPin()` reuses the active instance. `run()` returns a subprocess you can await for output and errors.

If there is no active instance, `getSafetyPin()` returns an unstarted instance. It does not start one for you. Standalone ownership and lifecycle belong in the API guide, not in this shared-instance example.

### Do

- Reuse the active instance and its user-configured policy.
- Run commands through `safetyPin.run()`.
- Keep command strings fixed where possible. Treat interpolated input as shell input, not safe data.
- Handle failures. Explain access problems without hiding other command errors.
- Use sandboxed commands for file access that must follow the policy. Direct Node.js filesystem calls run on the host.
- Leave startup and shutdown to the Safety Pin extension when sharing its instance.

### Don’t

- Retry a blocked operation with host shell or filesystem APIs.
- Silently broaden permissions to make an operation succeed.
- Pass custom configuration when reusing an active instance. The API rejects it.
- Stop a shared instance when your extension finishes a task.
- Assume subprocess options are sandboxed. File-backed streams and transforms can run on the host.
- Pipe output into an unsandboxed command and call the whole pipeline protected.
- Claim that using the API sandboxes your entire extension.

### Example extensions

**Planned documentation:** a focused **Build your own extension** page with complete, copyable examples:

1. A small Pi extension that runs a fixed command and displays its result.
2. An extension that accepts input, runs a sandboxed operation, and reports failures.

Examples should link to their source in this repository. Add those links when the files exist.

**Planned real-world example: the subagent extension.** It will show how delegated work uses Safety Pin. Link to its implementation here and from the API guide once it is built. It is not available yet.

## Guides and reference

The full guide will use short Markdown pages. Each page answers one question or walks through one task.

The planned site uses [Starlight](https://starlight.astro.build/), Astro’s documentation framework. No site has been set up yet. The titles below are a proposed navigation, not links to existing pages.

| Section | Pages |
| --- | --- |
| Start here | Overview · Install · First session |
| Everyday use | Settings · Filesystem access · Network access · Post-turn access review · Global and project rules |
| Understand protection | Defaults · Security boundaries · Temporary files |
| Troubleshooting | Access denied · Installation problems · Conflicting extensions |
| Build extensions | Build your own extension · Example extensions · API reference |
| MCP servers | Launcher CLI · Optional sandbox transport · OAuth compatibility |
| Reference | Commands · Configuration |
| Planned add-ons | Subagents · Browser automation |

Screenshots will show the main screens. Short GIFs will show individual tasks. Every clip will have written steps so the guide works without animation.

## Development

From a checkout:

```sh
npm install
npm run check && npm run lint && npm test
pi -e .
```

Disable conflicting tool-replacement extensions for this checkout before launching the preview. Keep that override local so other projects stay protected.

## License

[MIT](../LICENSE)

<!-- When promoting this file to the repository root, change ../assets/ and ../LICENSE to root-relative file paths. Replace media placeholders and the proposed guide navigation as their targets become available. -->
