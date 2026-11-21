# V2 design notes

## How we work

V2 is a minimal proof of concept. The goal is an API that's easy to read and use, both inside Safety Pin and for add-on authors who want to sandbox their own operations.

Start with what the caller should write. Prefer the API already there. When a change is needed, keep it direct and inline, with minimal comments. Skip speculative abstractions, edge-case polish, and new tests at this stage. Keep the sandbox boundary intact.

Discuss and plan freely, but don't change files without an explicit request. Record agreed decisions here; don't turn proposals into decisions.

## Agreed API

- `getSandbox()` is the entry point. If the sandbox is already loaded, callers get the same instance.
- Otherwise, callers can use the default config, supply their own, or use the exported `loadConfig()` to load and compose it themselves.
- No separate factory or lifecycle API is needed for this use case.
