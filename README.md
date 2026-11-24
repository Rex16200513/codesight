<p align="center">
  <img src="./assets/codesight-social.png" alt="CodeSight" width="760" />
</p>

<p align="center">
  <strong>See what your AI changed — before it breaks.</strong>
</p>

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="./CHANGELOG.md">Changelog</a> ·
  <a href="./LICENSE">MIT License</a>
</p>

---

**CodeSight** is a local-first GraphRAG comprehension and diagnostic engine for AI-assisted coding. It builds an AST call graph and dependency map of your repository (TypeScript, JavaScript, Python), catches silent regressions (`as any`, empty `catch`, removed guards) with **zero LLM tokens**, and renders a minimalist interactive architecture board inside your AI agent or as a native macOS HUD.

## Why CodeSight

- **Deterministic & Local-First** — Real TypeScript Compiler AST + Python import/call parser + hybrid BM25 / vector / 1-hop graph RRF. No code leaves your machine by default.
- **Minimalist Interactive Cards (MCP Apps)** — Vertical Frontend / Backend / Core board with directional dashed dependency lines, prototype wireframes on click, one-click card collapse (`44px` bar), and live English / Chinese switching.
- **Silent Regression Guard** — Flags when an AI "fixes" an error by silently removing validation guards, swallowing exceptions, or adding `as any`.
- **Unified Settings Everywhere** — One `~/.codesight/config.json` shared across AI Agent plugins (`codesight_settings` + in-card `⚙`), CLI (`codesight config`), browser board (`http://127.0.0.1:4317`), and the native macOS HUD (`⌘,`).
- **Works Across Every Agent** — Dual-transport MCP + MCP Apps server (`stdio` and Streamable HTTP `/mcp`) for Antigravity, Claude Code, Claude Desktop, Cursor, VS Code, Codex, and ChatGPT, plus a native SwiftUI macOS Floating HUD for traditional IDE users.

## Quick Start

```bash
git clone https://github.com/Rex16200513/codesight.git
cd codesight
npm install && npm run build
```

### 1. Install into your AI Agent

```bash
node packages/cli/dist/cli.js install --target cursor
node packages/cli/dist/cli.js install --target claude-code
node packages/cli/dist/cli.js install --target antigravity
# Or all supported agents: --target all
```

| MCP Tool | Purpose |
| --- | --- |
| `codesight_map` | Build layered architecture map + interactive HTML card |
| `codesight_ask` | Locate relevant files via hybrid BM25 + vector + 1-hop graph RRF |
| `codesight_trace` | Trace cross-file callers & callees of any function or component |
| `codesight_diagnose` | Project stack trace or `git diff` onto the graph for blast radius, silent regressions, and fix directions |
| `codesight_settings` | View or update unified preferences (`language`, `dashedLines`, `collapsedByDefault`, `silentRegressionGuard`, `architectureMode`, BYOK LLM) |

### 2. Open the Interactive Board in Your Browser

```bash
# One-shot preview
node packages/cli/dist/cli.js map --open

# Or run the local Sidecar (live map + persistent settings at http://127.0.0.1:4317)
npm run dev:sidecar
```

### 3. Manage Settings (CLI / Agent / HUD)

```bash
node packages/cli/dist/cli.js config show
node packages/cli/dist/cli.js config set language en
node packages/cli/dist/cli.js config set collapsedByDefault true
node packages/cli/dist/cli.js config set dashedLines hover
```

In your AI agent, ask *"Open CodeSight settings"* or click `⚙` in any CodeSight visual card.

### 4. Optional: Native macOS Floating HUD (for VS Code / IDE users)

```bash
npm run hud:open
```

Click the slider icon in the HUD header (or press `⌘,`) to configure Language, Always on Top, Opacity, Regression Guard, Flow Lines, and optional BYOK models — synced with `~/.codesight/config.json`.

## Architecture

```text
assets/        Brand identity (logo.svg, codesight-logo.png, codesight-social.png)
packages/
  core/        TS AST & Python parser, dependency/call graph, hybrid RRF, config store
  mcp-server/  Stdio + Streamable HTTP (/mcp) server & Apple-minimalist MCP App cards
  cli/         CLI (map, ask, trace, diagnose, config, install)
  sidecar/     Local HTTP/SSE engine bridge & browser visual board (port 4317)
  ui/          Shared React HUD components
apps/
  macos-hud/   Native SwiftUI + AppKit floating HUD (arm64 macOS)
plugins/
  codesight/   Antigravity & Claude Code native plugin bundle
```

## License

[MIT](./LICENSE)
