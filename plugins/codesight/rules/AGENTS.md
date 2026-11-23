# CodeSight Safety & Comprehension Rules

- Before making breaking signature or schema changes to core files, call `codesight_trace` to check cross-file callers and blast radius.
- Never fix compiler/runtime errors by silently removing auth/validation guards, adding empty `catch {}` blocks, or casting to `as any`.
- When hitting a recurring error loop (2+ failed fix attempts), call `codesight_diagnose` with the error stack trace and summarize the causal path and fix directions concisely for the user.
