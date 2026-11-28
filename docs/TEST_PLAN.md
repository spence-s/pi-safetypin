# V2 test plan

Proposal only: V1 tests are deleted; no V2 tests are implemented yet. A green `npm test` with zero tests is not evidence of sandbox protection.

## Approach

- Use Node's built-in test runner and native TypeScript; no new test dependencies.
- Prefer integration tests through the public API and registered tools. Keep fixtures under `$TMPDIR`, never real user configuration or credentials.
- Run each real SRT scenario in a fresh child process: SRT has process-global ownership and macOS cannot reliably nest sandbox profiles. Run these from an unsandboxed terminal or CI, not from inside an active Safety Pin sandbox.
- Use local HTTP/HTTPS fixture servers and disposable certificates; no public-network dependency. Assert server receipt/non-receipt as well as command results.
- Bound every child process and network request with a timeout. Always clean up servers, children, config files, and scratch directories.
- Test enforcement separately from diagnostic delivery: denial observation is best effort and can arrive late. An application 403 or ordinary command failure must not be labeled a sandbox denial.

## 1. Package and configuration — first batch

- Build, pack, and import `pi-safetypin` from a temporary consumer. Verify `getSafetyPin`, declarations, and the Pi extension entry resolve; no V1 or `v2/` paths ship.
- Load defaults with disposable global/project stores, including `PI_CODING_AGENT_DIR`, missing files, invalid JSON, invalid fields, and duplicate canonical origins.
- Save only the selected scope; retain the other file unchanged. Round-trip configuration without persisting merged defaults.
- Verify default workspace/skill grants, home restrictions, HOME isolation options, and additive network composition. Local allow must not erase global filters or blocks.
- Cover destination canonicalization: default schemes, ports, trailing dots, IPv6/mapped IPv4, and rejection of credentials, wildcards, paths, queries, fragments, malformed destinations, and empty request patterns.

## 2. Real runtime enforcement — release-blocking

- Lifecycle: inactive calls fail; start, run, stop work; active instance reuse rejects new config; concurrent owners fail; failed startup releases ownership and scratch resources.
- Filesystem: allow project/scratch writes, deny outside writes and restricted reads, preserve explicit read exceptions and deny-write precedence. Exercise symlinks and paths containing spaces/quotes.
- Environment: HOME matches the configured mode without granting access; temporary variables point to scratch; host secrets are not inherited; stopping removes scratch.
- Commands: stdout/stderr, nonzero exits, `reject: false`, streaming, cancellation, timeout, descendant cleanup, and refusal to stop with work in flight. Explicit-path `rg` completes; investigate pathless stdin behavior as a separate regression case.
- Network: unlisted denied; allowed HTTP and inspected HTTPS work; scheme/port mismatches and cross-origin redirects cannot bypass policy; either-scope block wins.
- Filters: OR across alternatives, AND across fields and scoped entries; methods, exact paths, segment-boundary prefixes, and required header values. Missing/wrong headers deny; filters never inject credentials.
- Reject host/connection-target mismatches, ambiguous targets, opaque CONNECT/SOCKS tunnels, and unsupported raw TCP. Confirm TLS inspection cannot be bypassed by an unrestricted HTTPS allow.

## 3. Pi tools and diagnostics

- Register all seven managed tools without activating optional tools. Exercise read/write/edit/find/grep/ls/bash through their registered execution contracts.
- Preserve existing output, structured content, exit status, and thrown errors when attaching denial diagnostics, including partially successful commands.
- Attribute concurrent denials only to the correct operation; ignore old/unattributed events; unsubscribe listeners after success and failure.
- Show deduplicated raw denial lines with escaped control characters. Keep the sensitive-data warning and no-retry guidance. Use synthetic secrets, never real credentials.
- System prompt reflects running policy, selected tools, HOME, and scratch. Required header names may appear; accepted values must not.
- Session shutdown releases the owner; saved settings do not alter live policy until reload.

## 4. Settings and MCP

- Drive filesystem/network screens with scripted UI responses: both scopes visible, edit/save/cancel loops, validation retry, removal confirmation, and write failures.
- Network editor: new entries remain absent until a valid save; block retains inactive filters; editing filters does not unblock; deleting the final filter preserves the chosen access; quoted commas/whitespace round-trip.
- CLI: no-argument usage, literal argument quoting, child exit codes, signals, untouched stdio framing, and cleanup.
- MCP transport: tiny local stdio server, message round-trip, explicit environment forwarding only, invalid environment rejection, stdin closure/cancellation, and shared-owner preservation.
- Manually verify `/safetypin`, scope labels, Esc/back navigation, reload, and diagnostics in a real Pi session. OAuth, browser automation, subagents, and unimplemented permission-review workflows remain outside this plan's automated scope.

## CI and completion

Start with package/config coverage, then runtime filesystem/network enforcement, then tool diagnostics, then settings/MCP. Use macOS and Linux with Node 24 plus the current supported Node release; install platform SRT prerequisites. Missing prerequisites should fail the enforcement job, not silently skip it.

Keep check, lint, tests, and build as gates. Until real enforcement tests exist, label coverage as incomplete. No numeric coverage target substitutes for testing allow and deny behavior across the actual sandbox boundary.
