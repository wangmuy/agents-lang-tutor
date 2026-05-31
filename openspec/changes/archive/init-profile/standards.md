# Standards

Advisory guidance: SHOULD / PREFER.
Deviations allowed with explicit justification.
Contrasts with `constitution.md` where violations are blocking.

## Coding Style

- PREFER `const` over `let`. Use `let` only for reassignment in a visible scope.
- PREFER arrow functions for closures and callbacks. Use `function` for named
  exports of primary API surface.
- PREFER early returns over deep `if/else` nesting. Keep functions to ~40 lines.
- PREFER descriptive variable names over comments. Name boolean variables with
  `is`/`has`/`should` prefixes (e.g., `isNativeLanguage`).
- Files SHOULD have one primary export. Utility files MAY have barrel exports.

## Best Practices

- PREFER dependency injection over global state for config that varies per
  invocation (e.g., pass config rather than re-reading globally).
- PREFER pure utility functions for deterministic logic (`stripCodeBlocks`,
  `detectLanguage`). Side effects belong in the plugin orchestration layer.
- AVOID try/catch swallowing — always log errors to the shared logger and
  re-throw or return a fallback value explicitly.
- PREFER `Array.includes()` over `===` chains for multi-value checks.
- PREFER `Promise.resolve().then(...)` for fire-and-forget background work
  (async mode) rather than `setTimeout(fn, 0)`.

## Language Patterns

- Use optional chaining (`?.`) and nullish coalescing (`??`) over ternary/`&&`
  patterns for optional property access.
- Use template literals over string concatenation (`+`).
- Use `async/await` over raw `.then()` chains for readability.
- Use `const` enums or union types (`"sync" | "async"`) over string literals
  for typed config options.

## Testing Style

- Test files SHOULD live next to the source file with a `.test.ts` suffix
  (e.g., `stripCodeBlocks.test.ts` next to `stripCodeBlocks.ts` — but since
  the entire plugin is a single file, tests go in a co-located `.test.ts`).
- Name tests using the pattern: `"should <expected behavior> when <condition>"`.
- PREFER behavior-oriented tests over implementation-oriented tests.
  Test what the function does, not how it does it.
- Coverage expectations: at minimum, test all code-block patterns (fenced,
  inline, mixed), language detection edge cases (short text, unknown language),
  and LLM response parsing (OK vs tip, empty, error).

## Project Idioms

- All plugin source code for a given agent goes in a single entry file
  under that agent's plugin directory. Extract helpers only when
  a file exceeds ~500 lines.
- Config resolution follows a standard pattern: read agent config → find plugin
  entry → merge plugin options with defaults.
- LLM API calls follow a standard pipeline: build messages array → POST to
  LLM endpoint → parse response → handle errors/retries.
- Display methods are named `display{Method}` (e.g., `displayInline`,
  `displayNotification`). Each returns `void` and handles its own rendering.
- Logger is initialized at module scope with `os.tmpdir()/lang-tutor.log`.
  All modules within a plugin use the same logger instance.