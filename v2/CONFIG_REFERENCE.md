# V2 configuration reference (proposal)

Status: network and filesystem changes below are proposals for review. The Current implementation and HOME configuration sections describe implemented behavior. `DESIGN.md` remains the reference for agreed V2 decisions.

This document describes proposed Safety Pin network and filesystem configuration, how Global and Local rules would combine, and how we would translate them into Anthropic Sandbox Runtime (SRT) settings. It is a working reference, not yet an exhaustive schema. Field names, defaults, and semantics below are recommendations until agreed.

## Current implementation

- V2 currently accepts SRT's filesystem object (`allowRead`, `denyRead`, `allowWrite`, `denyWrite`), not the path objects proposed below.
- V2 accepts SRT's network configuration object under `sandbox.network`, including `allowedDomains` and `deniedDomains`. It does not yet implement the proposed rules below; the Network Access screen is a stub.
- V1 stores connection rules in SRT's network lists and custom request rules in `sandbox.requestPolicies`.
- V1 translates those request policies into SRT's `network.filterRequest` callback and enables `network.tlsTerminate` when policies exist.
- V1 uses SRT's built-in proxy, not a separate Safety Pin proxy service.

Verified against installed SRT 0.0.83. Its API is experimental and may change.

## HOME configuration (implemented)

`sandbox.isolatedHome` is an optional boolean, defaulting to `false`.

```json
{
  "sandbox": {
    "isolatedHome": false
  }
}
```

- **`false` (default):** set `HOME` to the host home directory so tools discover their usual configuration paths.
- **`true`:** set `HOME` to the temporary sandbox directory instead.
- This setting grants no filesystem access. The host home remains blocked by default except for existing workspace/skill grants; explicitly allow each tool's configuration/cache paths as needed.
- `TMPDIR` and `CLAUDE_CODE_TMPDIR` continue to use sandbox scratch space in either mode.

This replaces the unused V2 `sandbox.shareHostHomeDirectory` field; use `isolatedHome` in V2 configuration.

## Why change the configuration?

One destination should have one place to describe connection access and optional request restrictions. Users should not have to maintain a domain allowlist separately from the policies that restrict it.

This means Safety Pin would own its network configuration format rather than simply extending SRT's format. We would still use SRT's domain rules and proxy internally, but raw `allowedDomains` / `deniedDomains` would no longer be the user-facing interface.

The same principle applies to files: describe the access a path should have instead of asking users to reason across four lists with different precedence rules.

Changing the format is not the same as dropping the underlying capabilities. We need to explicitly document which capabilities Safety Pin exposes, translates, or leaves unsupported.

## Proposed network configuration

Use an array of destination objects instead of separate connection and request-policy lists. Illustrative placement:

```json
{
  "sandbox": {
    "network": [
      {
        "destination": "https://registry.npmjs.org",
        "access": "allow"
      },
      {
        "destination": "https://api.github.com",
        "access": "allow",
        "requests": [
          {
            "methods": ["GET"],
            "pathPrefixes": ["/repos/my-org"]
          }
        ]
      },
      {
        "destination": "https://example.com",
        "access": "block"
      }
    ]
  }
}
```

Making `sandbox.network` an array is a breaking change from its current SRT object shape. Placement is not settled: SRT's other network options still need a home. Do not implement this example by silently discarding those settings.

### Destination fields

| Field | Proposed meaning |
| --- | --- |
| `destination` | An HTTP or HTTPS origin: scheme, hostname, and optional port. No credentials, query, fragment, or non-root path. |
| `access` | Required: `allow` or `block`. |
| `requests` | Optional nonempty array of allowed request patterns. Valid only for `allow`. Omitted means no method/path/header restrictions from this entry. |

Recommend starting with exact origins. Wildcards need separate syntax and overlap semantics; do not assume a wildcard is a valid URL origin.

Normalize host casing, trailing DNS dots, and default ports consistently before comparing entries. Reject malformed rules rather than dropping them or falling back to unrestricted access.

### Request fields

Retain V1's useful predicates:

| Field | Proposed meaning |
| --- | --- |
| `methods` | Nonempty list of accepted HTTP methods, normalized to uppercase. |
| `paths` | Nonempty list of exact URL pathnames. |
| `pathPrefixes` | Nonempty list of path prefixes, matched at a segment boundary. `/repos/my-org` matches itself and `/repos/my-org/example`, not `/repos/my-organization`. |
| `headers` | Map of case-insensitive header names to nonempty lists of accepted exact values. Every named header must match. |

Within one request pattern, method, path, and header conditions combine with AND. If both `paths` and `pathPrefixes` exist, either path condition can satisfy the path portion. Patterns within `requests` combine with OR.

Reject empty request patterns and `requests: []`; neither should accidentally become unrestricted access. Query parameters and body content are not covered by these predicates. A matching path does not guarantee a safe operation or safe payload.

A destination is an origin, not a base path. Do not accept `https://example.com/api` and silently open the whole host; express `/api` as a request restriction instead.

## Proposed network Global / Local combination

Global means all projects; Local means the current project. Both appear together in the UI, but edits write only to the selected source file.

Recommendation: combine grants without letting one scope silently erase another scope's restrictions:

1. Unlisted destinations are blocked.
2. An allow entry in either scope can grant a destination.
3. A matching block entry in either scope wins over allows.
4. All matching filtered entries must be satisfied. Within each entry, any one request pattern may match.
5. An unrestricted allow entry does not cancel a filtered entry from the other scope.

Example: Global allows GitHub with only GET requests; Local allows GitHub with only `/repos/my-org` paths. Effective access requires GET **and** a matching path. Local cannot broaden that Global grant to POST.

This is a proposed safety-oriented policy, not V1 compatibility. V1 combines alternative request policies for a destination with OR; migration must account for the difference.

Recommend rejecting duplicate canonical destinations within a single scope: use multiple request patterns in one entry instead. Global and Local may each contain an entry for the same destination.

Do not rely on a generic deep merge to produce these semantics. Load and validate each scope, retain its provenance, then explicitly derive the effective network policy. Do not persist the computed policy over either source file.

An empty Local array contributes no rules; it does not clear Global grants. Turning off inherited access requires an explicit Local block.

Open question: should Local ever be allowed to replace or broaden a Global restriction? If so, that needs an explicit design rather than an incidental array-merge behavior.

## Network translation into SRT

The config layer loads and validates Safety Pin rules. At the runtime boundary, translate the effective policy into SRT configuration and executable matching logic. JSON configuration must not contain callbacks.

1. **Resolve scopes and normalize destinations.** Keep source information for UI explanations and conflicts.
2. **Derive connection grants.** Extract host and port from allowed origins to populate SRT's `network.allowedDomains`. No Safety Pin grant means no SRT grant.
3. **Apply blocks.** Use `network.deniedDomains` where its host/port semantics express the intended block exactly. Enforce finer distinctions in the callback.
4. **Build `network.filterRequest`.** Evaluate the canonical destination, scheme, and effective request restrictions; deny unmatched requests. Do not use an allow-by-default callback to compensate for a broad connection grant.
5. **Enable `network.tlsTerminate` when HTTPS inspection is required.** SRT manages the interception CA and client trust configuration. Reject configurations that exclude a filtered HTTPS destination from termination.
6. **Close opaque bypasses.** SRT exposes `refuseOpaqueTunnels` for non-inspectable CONNECT and SOCKS traffic. Establish the enforcement posture before claiming request restrictions are guaranteed.
7. **Initialize or restart the runtime.** SRT 0.0.83 captures `filterRequest` when the proxy starts; changing a config file alone does not replace that callback.

### Origin semantics are stricter than SRT connection lists

SRT's connection rules describe host/port, not scheme. A grant for `https://example.com` becomes a connection grant for `example.com:443`, but that alone does not enforce HTTPS. Similarly, a block for `http://example.com:443` cannot safely become an unconditional host/port block if HTTPS on that port should remain allowed.

Recommendation: enforce scheme distinctions through request inspection and reject opaque traffic in this origin-based model. HTTPS origins may therefore require termination even without method/path/header filters. Alternatively, choose host/port destinations and explicitly give up scheme-specific semantics. This choice needs agreement before implementation.

`refuseOpaqueTunnels` is a broad runtime setting, not a per-destination exception list. If we later support SSH or other raw TCP traffic, we must design that alongside HTTP policy rather than quietly bypassing it.

## Network SRT capability mapping

This table covers network capabilities. The filesystem mapping follows below; other SRT capabilities still need an inventory.

| SRT capability | Proposed Safety Pin treatment |
| --- | --- |
| `allowedDomains`, `deniedDomains` | Generated internally from destination entries; not accepted as a second user-facing source of truth. |
| `filterRequest` | Generated from our request patterns; SRT does not supply our declarative policy language. |
| `tlsTerminate` | Managed as required for enforcement; any advanced overrides must not bypass protected destinations. |
| `refuseOpaqueTunnels` | Managed as part of enforcement; compatibility impact must be explicit. |
| Host/port wildcards | Deferred pending syntax and overlap decisions. |
| `allowLocalBinding` | Separate advanced capability; placement and support undecided. It can weaken network isolation. |
| `allowUnixSockets`, `allowAllUnixSockets` | Not HTTP destination rules. Placement and user-facing support undecided; preserve runtime-owned socket access. |
| Resolved-address restrictions, proxy chaining, other SRT network options | Inventory and support decisions still needed; do not assume automatic passthrough. |

No unrestricted raw-SRT escape hatch is proposed here. Such an escape hatch could conflict with the guarantees shown by the editor.

## Proposed network editing screen

Follow the agreed navigation: one Network Access screen showing Global and Local rules together, with explicit scope for every edit.

```text
Network Access
Unlisted destinations are blocked.

Destination                  Access       Scope
https://registry.npmjs.org   Allowed      Global
https://api.github.com      Filtered     Local
https://example.com         Blocked      Local

Add destination…
```

The normal destination editor asks for destination, scope, and Allow / Block. An allowed destination offers All requests / Only matching requests.

Recommendation: put detailed request patterns behind a separate “Request filters…” editor. Ordinary allow/block edits stay small; multiple alternative patterns have room to be readable. Headers are advanced fields, not part of every ordinary edit.

Show effective restrictions and their source when Global and Local overlap. Distinguish “this entry allows all requests” from “effective access is filtered by another entry.” Removing a Local entry must not imply inherited Global access was removed.

Do not expose proxy switches, certificates, or SRT callback terminology in the normal workflow. Explain inspection compatibility limits when relevant. Use an explicit screen loop; save/cancel returns to the list and cancel from the list exits.

## Compatibility and open decisions

Before implementation, settle:

- Array placement and the home for remaining SRT network options.
- Origin versus host/port destinations, and the resulting TLS/opaque-traffic posture.
- Global/Local restriction composition and any override mechanism.
- Whether wildcards are needed in the first version.
- Migration of V1 rules and existing V2 raw SRT network objects. Do not silently reinterpret old files or weaken restrictions.
- Certificate-pinning, mTLS, and non-HTTP compatibility: inspection can break these clients, and bypassing inspection cannot preserve request-level guarantees.

The filesystem proposal below has additional mapping decisions. Other Safety Pin fields and SRT capabilities still need to be added before this is a complete configuration reference.

## Proposed filesystem configuration

Use one entry per path, with an explicit access level:

```json
{
  "sandbox": {
    "filesystem": [
      {"path": "~", "access": "none"},
      {"path": ".", "access": "read-write"},
      {"path": "~/.pi/agent/skills", "access": "read"}
    ]
  }
}
```

Intent: home is private except the project and skills; the project is writable and skills are read-only. This example describes those regions, not a settled policy for the rest of the machine.

| Field | Proposed meaning |
| --- | --- |
| `path` | A literal file or directory path. Relative paths resolve against the project directory, including those in Global config; `~` refers to the host home directory. These resolution rules need agreement. |
| `access` | Required: `none`, `read`, or `read-write`. |

- `none`: deny reads and writes.
- `read`: allow reads and prohibit writes, even inside an otherwise writable region.
- `read-write`: allow reads and writes, subject to mandatory runtime protections.

No write-only mode initially. Its main use is a drop folder, but write-only does not imply append-only or create-only: overwriting or deleting unreadable data may still be possible. Those stronger guarantees are outside this proposal.

### Proposed inheritance and scope behavior

Within one scope, prefer the most-specific matching path, independent of array order. A directory rule covers descendants unless a more-specific rule changes their access. Reject duplicate canonical paths within a scope.

Across scopes, do not blindly apply the network rule that every block wins: a filesystem parent block with a child exception is a normal use case. We need to agree on how specificity interacts with scope before implementing the merge.

Possible policies to review:

- **Specificity across both scopes:** a Local child can reopen part of a Global blocked parent. Simple to explain, but Global restrictions are not a ceiling.
- **Global restrictions are a ceiling:** resolve inheritance within each scope, then intersect applicable permissions. Local can narrow a Global grant, but cannot reopen an explicit Global restriction. An absent rule must be distinguished from an explicit `none` so Local can grant previously unconfigured paths.

Neither option is selected here. In particular, decide whether Global `read` on a parent allows a Local `read-write` child. The UI must show both the stored rule and effective access when they differ.

### Default access is unresolved

SRT ordinarily permits reads outside denied regions and denies writes outside allowed regions. A simple object list does not itself change that default.

Two options:

- Preserve that baseline: unlisted paths are readable but not writable. Compatible with typical developer tools, but the list is not a read allowlist.
- Deny unlisted reads and writes: easier to describe as an allowlist, but commands also need executables, shared libraries, certificates, devices, and runtime support files. These dependencies need explicit or managed grants.

Do not silently promise deny-by-default reads. Document managed baseline access separately from user rules and show it in settings where useful.

## Filesystem translation into SRT

There is no filesystem equivalent of `filterRequest` that can decide every read or write in application code. The generated OS sandbox rules must faithfully express our policy.

For uncomplicated layouts, the conceptual mapping is:

| Safety Pin entry | SRT fields needed |
| --- | --- |
| `none` | `denyRead` and `denyWrite`. |
| `read` | `allowRead` when reopening a denied region, plus `denyWrite` when restricting a writable region. |
| `read-write` | `allowWrite`, plus `allowRead` when reopening a denied region. |

These are contributions to a complete translated policy, **not** a recipe to append every entry to those lists independently. Resolve inheritance, scopes, and defaults first; then check that the complete policy can be expressed.

### Known mismatch: write exceptions

SRT's read rules support reopening a denied parent with `allowRead`; a more-specific read denial can remain blocked. Its documented write semantics are different: `denyWrite` takes precedence over `allowWrite`.

For example:

```json
[
  {"path": "./output", "access": "read-write"},
  {"path": "./output/private", "access": "read"},
  {"path": "./output/private/generated", "access": "read-write"}
]
```

The proposed most-specific-path model wants the last directory writable. A direct translation that denies writes to `./output/private` also blocks the child grant. The earlier home/project example has the same issue if `none` on home becomes a broad `denyWrite` containing the project.

We have not established a portable SRT translation for arbitrary alternating write restrictions. Do not work around this by enumerating existing siblings: new files and directories could invalidate the policy.

Options to investigate: generate an equivalent policy using supported backend semantics, restrict allowed nesting, or change the public inheritance model. Until verified, this is a design blocker for the general most-specific-path promise. Reject unsupported layouts rather than silently broadening access or displaying a grant that does not work.

### Other mapping gaps and limits

- **Literal paths versus globs:** SRT accepts pattern strings and `{path, literal: true}` entries. Recommend literal paths initially so names containing glob characters are not interpreted as permissions patterns. Glob permissions are not exposed by this proposal.
- **Symlinks and aliases:** lexical nesting is not enough. Decide how to resolve symlinks, missing paths, and aliases; validate actual backend behavior rather than claiming string normalization prevents escapes.
- **Read-only is not content-only protection:** rename, deletion, parent-directory writes, links, and new paths must respect the effective restriction. Verify across supported operating systems.
- **Mandatory protections:** SRT protects certain shell, Git, and configuration paths even inside writable directories. `read-write` must not promise to disable these protections.
- **Managed grants:** scratch space, proxy sockets, tool/runtime files, and existing project/skill defaults must survive translation. Do not save runtime-generated paths into user config.
- **Disabling filesystem isolation:** SRT's `filesystem.disabled` is not exposed here. It would undermine the meaning of path rules.
- **Advanced backend options:** sandbox weakening, platform-specific settings, scan depth, and related controls are not represented by this small schema. Inventory them before deciding support; do not assume passthrough.
- **Credentials:** credential masking/denial is a separate SRT capability, not implied by `none` or `read`. Its interaction with path access needs a separate design if exposed.

Filesystem Access should use the same combined Global/Local navigation as Network Access. Start with Path, Access, and Scope, explain inheritance, and display conflicts or unsupported layouts before saving.

## Safety Pin as an easier SRT wrapper

A potential standalone value proposition is a readable permission model with useful enforcement features configured together, rather than raw SRT settings plus application-specific glue. The Pi extension could be one consumer of that wrapper, not its defining boundary.

That direction could offer:

- One declarative model for destination and path access.
- Request filtering with proxy/TLS setup managed by Safety Pin.
- Explicit policy composition, validation, and understandable errors.
- Clearly documented defaults and managed runtime access.

This is motivation, not a package-extraction decision. Keep package wiring out of scope. Separate genuinely general defaults from Pi-specific project/skill grants before calling the wrapper general-purpose. “More enabled out of the box” should mean useful enforcement is wired up, not broader access or weaker isolation.

The public configuration must describe guarantees we can actually enforce. A smaller honest model is preferable to readable syntax that conceals incompatible SRT behavior.

## Implementation references

- `config/schema.ts`: current V2 SRT-derived schema.
- `config/utilities.ts`: current V2 loading and generic merging.
- `safety-pin.ts`: current V2 runtime configuration boundary.
- `ui/screens/network-access.ts`: current V2 screen stub.
- `../src/config.ts`: V1 request-policy schema and scoped editing.
- `../src/session-manager.ts`: V1 policy-to-SRT translation.
- [SRT filesystem and network documentation](https://github.com/anthropic-experimental/sandbox-runtime#network-configuration).
- [SRT request-filter API](https://github.com/anthropic-experimental/sandbox-runtime/blob/main/src/sandbox/request-filter.ts).
