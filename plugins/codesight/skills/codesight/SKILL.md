---
name: codesight
description: Use CodeSight GraphRAG tools (`codesight_map`, `codesight_ask`, `codesight_trace`, `codesight_diagnose`) to understand unfamiliar repositories, check blast radius before editing shared files, detect silent regressions (removed guards, empty catch, `as any`), and present clear architectural fix directions to the user.
---

# CodeSight Workflow Skill

Activate this skill whenever:
1. The user asks how a codebase is organized or where a feature lives (`codesight_map` / `codesight_ask`).
   - Tip: If the project has a domain-specific architecture (e.g. Frontend vs Backend vs Worker/AI Pipeline), you may pass a tailored `architectureOverride` object to `codesight_map` (`zones` with `kind: "frontend" | "backend" | "shared" | "core"`) so CodeSight renders and caches a bespoke visual architecture map with zero extra API keys.
2. You are about to modify a shared type, schema, or utility imported across multiple modules — run `codesight_trace` first to inspect all cross-file callers.
3. A build/runtime error occurs or you finish a multi-file Vibe Coding edit — run `codesight_diagnose` (with `rawError` or `useGit: true`) to verify blast radius and ensure zero silent regressions (`REMOVED_GUARD`, `SWALLOWED_ERROR`, `TYPE_ESCAPE_HATCH`).

## Output Guidelines for the User
- Lead with a 1-sentence plain-language explanation of what role broke or shifted.
- State the exact **Blast Radius** (direct/indirect files affected) AND the **Safe Zone** (how many files are unaffected).
- When modifying a **high-hub** file, present the 2–3 **Fix Directions** returned by `codesight_diagnose` and let the user choose before performing sweeping edits.
