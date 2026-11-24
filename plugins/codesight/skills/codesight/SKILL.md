---
name: codesight
description: Use CodeSight GraphRAG tools (`codesight_map`, `codesight_ask`, `codesight_trace`, `codesight_diagnose`, `codesight_settings`) to understand unfamiliar repositories, check blast radius before editing shared files, detect silent regressions (removed guards, empty catch, `as any`), adjust user settings, and present clear architectural fix directions to the user.
---

# CodeSight Workflow Skill

Activate this skill whenever:
1. The user asks how a codebase is organized or where a feature lives (`codesight_map` / `codesight_ask`).
   - Tip: If the project has a domain-specific architecture (e.g. Browser Extension, Frontend vs Backend, or AI Pipeline) or custom UI components whose actual screen appearance isn't obvious from filenames alone, pass `architectureOverride` (`zones` AND optional `prototypes: { "path/to/Modal.ts": { kind: "ui-modal", visualSummary: "...", elements: ["Header", "Preset Toggle", "Save"] } }`) to `codesight_map` so CodeSight renders and caches a bespoke visual map + real UI wireframes with zero extra API keys.
2. You are about to modify a shared type, schema, or utility imported across multiple modules — run `codesight_trace` first to inspect all cross-file callers.
3. A build/runtime error occurs or you finish a multi-file Vibe Coding edit — run `codesight_diagnose` (with `rawError` or `useGit: true`) to verify blast radius and ensure zero silent regressions (`REMOVED_GUARD`, `SWALLOWED_ERROR`, `TYPE_ESCAPE_HATCH`).
4. The user wants to view or change CodeSight preferences (language `zh`/`en`, dashed flow lines, silent regression guard, architecture mode, optional BYOK LLM) — call `codesight_settings` (`action: "get" | "set" | "reset"`). Settings persist in `~/.codesight/config.json` and stay synced with the native macOS HUD.

## Output Guidelines for the User
- Lead with a 1-sentence plain-language explanation of what role broke or shifted.
- State the exact **Blast Radius** (direct/indirect files affected) AND the **Safe Zone** (how many files are unaffected).
- When modifying a **high-hub** file, present the 2–3 **Fix Directions** returned by `codesight_diagnose` and let the user choose before performing sweeping edits.
