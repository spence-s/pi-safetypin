<p align="center">
  <img src="assets/safety-pin.svg" width="250" height="250" alt="">
</p>

A [Pi](https://pi.dev) extension that runs shell and filesystem tools inside [Anthropic Sandbox Runtime](https://github.com/anthropics/sandbox-runtime).

It replaces Pi's `bash`, `read`, `write`, `edit`, `find`, `grep`, and `ls` tools with sandboxed versions. By default, they can work in the current project and private temporary storage, read global skills, and cannot access the network until you allow a destination.

## Install

Requires Pi and Node.js 24+. On macOS, install `ripgrep`; on Linux, install `bubblewrap`, `socat`, and `ripgrep`.

From npm (once published):

```sh
pi install npm:pi-safetypin
```

Or from Git:

```sh
pi install git:github.com/spence-s/pi-safetypin
```

Choose one. Add `--local` to install for the current project only, then restart Pi or run `/reload`.

## Use

The package loads the V2 proof of concept. Run `/safetypin` to manage filesystem and network access.

### V1

To use the legacy sandbox, load `./src/index.ts` directly instead of the package. Run `/sandbox` to manage filesystem access, allowed network destinations, and advanced settings for the current project or globally. Blocked network requests can prompt you to approve access.

- `/sandbox status` — check protection.
- `/sandbox off` or `/sandbox on` — disable or enable it for this session. **When off, managed tools run directly on the host.**
- `research_scout` — optional read-only research delegation, configurable through `/sandbox`.
- `/playwright on` — optional Playwright CLI bridge using host Chrome through the sandbox's network proxy; requires Chrome and `playwright-cli` installed separately.

**Scope:** this extension isolates its managed tools, not Pi itself or tools from other extensions. Only load extensions you trust.

## Development

```sh
npm install
npm run check && npm run lint && npm test
pi -e .
```

If Sloppi's sandbox is already installed, run `pi config --local` from this checkout and disable only its sandbox extension before launching V2. Both extensions replace the same tools. Keep the override local so other projects stay protected.

## License

[MIT](LICENSE)
