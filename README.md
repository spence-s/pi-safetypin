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

The package loads the V2 proof of concept. Run `/safetypin` to manage filesystem and network access. Network rules allow, block, or filter exact HTTP/HTTPS origins; Global and Local restrictions combine. Changes apply after `/reload` or restarting Pi.

HTTPS access requires TLS inspection; pinned/mTLS clients and raw TCP/SSH are not supported. V2 is Safety Pin's clean starting point, not a user migration—see [V2 configuration](src/CONFIG_REFERENCE.md).

**Scope:** this extension isolates its managed tools, not Pi itself or tools from other extensions. Only load extensions you trust.

## API

Import `getSafetyPin` from `pi-safetypin`. The package root exposes the API; Pi loads `src/extension.ts`. The standalone launcher is `node src/cli.ts -- <command> [args...]`.

## Development

```sh
npm install
npm run check && npm run lint && npm test
pi -e .
```

The V1 test suite has been removed. `npm test` currently runs zero tests; see the proposed [V2 test plan](docs/TEST_PLAN.md).

If Sloppi's sandbox is already installed, run `pi config --local` from this checkout and disable only its sandbox extension before launching V2. Both extensions replace the same tools. Keep the override local so other projects stay protected.

## License

[MIT](LICENSE)
