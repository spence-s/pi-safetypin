# Agent guidelines

This is a Node.js 24+ TypeScript library using pure ESM and native type stripping.

- Keep changes focused and follow the existing code style.
- Use `.ts` extensions for local imports and `import type` for type-only imports.
- Use erasable TypeScript syntax; do not add CommonJS.
- Add or update tests for behavior changes.
- Run `npm run lint -- --fix` to format code
- Run `npm run check && npm run lint && npm test` before finishing.

Before any V2 discussion or work, read `src/DESIGN.md`. V2 is a minimal proof of concept, and much of the work right now is planning. Treat design discussions as read-only. Do not edit files unless the user explicitly asks you to make that change. For V2 POC changes, do not add tests unless explicitly requested; this takes precedence over the general test guideline below.

## Text Output and Conversational Guidelines

- Be extremely concise in your responses.
- Sacrifice grammar for the sake of concision.
