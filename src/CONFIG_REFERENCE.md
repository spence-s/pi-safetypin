# V2 configuration reference

Status: network rules and HOME behavior below are implemented. Filesystem object entries and inheritance remain proposals; the runtime still uses SRT's filesystem lists. `DESIGN.md` records agreed decisions.

## Current implementation

- `sandbox.network` is an array of HTTP/HTTPS destination rules, not an SRT network object.
- The Network Access editor shows Global and Local rules together, shows combined access in the destination list, and saves only the chosen source.
- Rules take effect after `/reload` or restarting Pi, not immediately on save.
- V2 still accepts SRT's filesystem object (`allowRead`, `denyRead`, `allowWrite`, `denyWrite`). The filesystem proposal below is not implemented.
- V2 is Safety Pin's clean starting point, not a user migration. There are no legacy-field guards, compatibility exceptions, or config-conversion paths.

Verified against SRT 0.0.83. Its API is experimental and may change.

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

## Network configuration

```json
{
  "sandbox": {
    "network": [
      {"destination": "https://registry.npmjs.org", "access": "allow"},
      {
        "destination": "https://api.github.com",
        "access": "allow",
        "requests": [{"methods": ["GET"], "pathPrefixes": ["/repos/my-org"]}]
      },
      {"destination": "https://example.com", "access": "block"}
    ]
  }
}
```

An origin string in a settings file, such as `"registry.npmjs.org"`, is shorthand for an unrestricted allow entry. A missing scheme defaults to HTTPS, except for `localhost` (case-insensitive, with an optional port or trailing DNS dot), which defaults to HTTP. For example, `example.com` becomes `https://example.com`, and `localhost:3000` becomes `http://localhost:3000`. Explicit HTTP/HTTPS schemes are preserved. These defaults apply to both strings and `destination` fields, including TUI input; saved rules use canonical explicit origins.

| Field | Meaning |
| --- | --- |
| `destination` | Exact HTTP or HTTPS origin: scheme, hostname, optional port. No credentials, wildcard, query, fragment, or non-root path. |
| `access` | Required: `allow` or `block`. |
| `requests` | Optional nonempty array of request patterns. Restricts `allow`; retained but inactive on `block`. Omitted means an allow entry adds no request restrictions. |

Origins are canonicalized before comparison: host casing, a trailing DNS dot, default ports, IDNs, and IP spellings follow URL/SRT normalization. Duplicate canonical destinations in one settings file are rejected. Use multiple patterns in a single entry for alternatives. Cross-scope entries retain their separate restrictions.

### Request patterns

| Field | Meaning |
| --- | --- |
| `methods` | Nonempty list of HTTP methods, normalized to uppercase. The editor accepts comma-separated methods. |
| `paths` | Nonempty list of exact URL pathnames. |
| `pathPrefixes` | Nonempty list of prefixes matched at segment boundaries. `/repos/org` matches itself and `/repos/org/example`, not `/repos/organization`. |
| `headers` | Header-name map to nonempty lists of accepted exact values. Names are case-insensitive; every named header must match. |

Within a pattern, method, path, and header conditions combine with AND. Exact paths and prefixes are alternatives for the path portion. Patterns in one entry combine with OR. A missing condition is unrestricted; an empty pattern or `requests: []` is rejected.

Use URL pathnames, not full URLs, queries, or fragments. Query parameters and body content are not checked. Paths describe what the proxy sees, not application-specific routing or authorization; matching a path does not guarantee a safe operation or payload. Header conditions do not inject headers or credentials. Avoid storing secrets as accepted header values: they are visible in configuration and the editor.

### Global and Local composition

1. Unlisted origins are blocked.
2. An allow in either scope grants the origin unless another matching entry blocks it.
3. A block in either scope wins.
4. Every matching filtered entry must pass; alternatives within each entry remain OR.
5. An unrestricted allow never cancels another scope's filters.

For example, Global GET-only plus Local `/repos/my-org`-only requires both GET and that path. An empty Local array contributes no restrictions or grants; it does not clear Global rules. Removing a Local rule can reveal inherited Global access. Use Local Block to disable a Global grant.

`loadConfig()` and `mergeConfigs()` explicitly concatenate network entries. Fully composed configurations can therefore contain repeated origins representing independent restrictions; the runtime applies them conjunctively. Do not save a composed configuration over either source file. `getSafetyPin({overrides})` uses the same additive network composition. A directly supplied `config` remains the caller's complete policy.

### Enforcement and compatibility

Safety Pin generates SRT host/port grants, enables a strict allowlist, and evaluates origin and request restrictions in SRT's `filterRequest`. The callback checks the proxy's actual scheme and connection target, not only the client-supplied URL. Scheme-distinct rules sharing a host/port remain distinct.

HTTPS access, including unrestricted Allow, requires TLS inspection to enforce origin semantics. SRT creates the CA and configures child trust. Host-header/SNI mismatches and ambiguous request targets are refused. Opaque CONNECT and SOCKS tunnels are refused; there is no raw TCP/SSH bypass. Certificate-pinned clients, mTLS, or tools that ignore proxy/CA configuration may fail; inspection is not silently disabled for them.

Raw SRT network options are not exposed alongside these rules. External proxy ports, TLS exclusions, arbitrary callbacks, local-binding grants, custom Unix socket grants, and parent proxy settings are not part of the network-rule format. Runtime-owned scratch/proxy socket access remains managed internally. Further advanced options need a design that preserves request enforcement.

## Network editor

Existing rules: destination list → rule editor in the existing scope → request-pattern/header editors. New destinations choose Local/Global scope before entering the rule editor; choosing scope alone does not create a rule.

- One row per origin, with combined Allow / Block / Filtered access and source scopes.
- Existing rules load Local values first if present, otherwise Global. The Scope row selects which source is edited; switching loads that source's saved rule.
- Accepted method/path/prefix fields, accepted header values, access changes, and pattern/header removals immediately save the complete valid rule to that scope. No page-level Save is needed.
- Multi-value fields use prefilled single-line comma-separated inputs. Surround values containing literal commas or leading/trailing spaces with double quotes; quoted values use JSON string escaping (for example, `"/items/a,b", /other`). Existing exact values are quoted automatically when needed.
- Esc only navigates back and preserves completed saves. Canceling a text editor discards only its unfinished input. Invalid fields and failed writes stay in the field editor with the submitted text available for correction or retry; failed access changes leave the displayed saved access unchanged.
- New destinations remain uncreated until Allow/Block is explicitly selected or the first valid filter is completed. Choosing scope, opening editors, and Esc never create an unrestricted grant.
- The Access option toggles only Allow / Block and saves immediately. Block retains optional inactive filters, including after reopening; editing those filters keeps the rule blocked. The destination list still labels filtered allows Filtered.
- Removing the last pattern immediately removes the entry's filter restrictions without confirmation; a blocked rule remains blocked. Clearing the final condition inside a pattern is invalid: remove the pattern instead.
- Rule removal confirms the selected scope and leaves the other scope untouched.
- Files are reloaded before saving so unrelated saved settings are retained. Runtime-generated policy is never written to either source. Saved changes take effect after `/reload` or restarting Pi.

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

- `config/schema.ts`: V2 validation and network rule schemas.
- `config/utilities.ts`: scoped loading and additive network composition.
- `safety-pin.ts`: current V2 runtime configuration boundary.
- `ui/screens/network-access/`: scoped network editor.
- `config/network.ts`: declarative rules to SRT request enforcement.
- [SRT filesystem and network documentation](https://github.com/anthropic-experimental/sandbox-runtime#network-configuration).
- [SRT request-filter API](https://github.com/anthropic-experimental/sandbox-runtime/blob/main/src/sandbox/request-filter.ts).
