# Changelog

All notable changes to **CodeSight** are documented in this file.

## [1.0.1] - 2026-11-24

### Added
- **Launch Media & Visual Documentation**: Added 1080p 60fps Apple-keynote promo video (`assets/codesight-promo.mp4`), inline README autoplay demo GIF (`assets/codesight-demo.gif`), and 6 Retina UI screenshots (`assets/screenshots/`) covering architecture board, prototype modal, error diagnosis, settings drawer, and 44px collapsed bar.
- **Professional Bilingual README**: Upgraded `README.md` and `README.zh-CN.md` with comparison matrix, visual tour gallery, ecosystem compatibility table, and Mermaid architecture diagram.
- **Icon Polish**: Alpha-masked edge-to-edge 1024×1024 macOS squircle `assets/codesight-logo.png` and rebuilt native `AppIcon.icns`.

## [1.0.0] - 2026-11-24

### Added
- **Brand Identity & Packaging**: New optical code-bracket CodeSight logo (`assets/logo.svg`, `assets/codesight-logo.png`, `assets/codesight-social.png`), native macOS `.icns` app icon, MIT `LICENSE`, bilingual documentation (`README.md` & `README.zh-CN.md`), and GitHub release packaging.
- **Apple / OpenAI Minimalist Visual Cards**: Vertical Frontend / Backend / Core board with directional dashed dependency lines, single-line module rows, interactive prototype wireframes, error-only fix choices, one-click card collapse (`44px` pill bar), and 100% live English / Chinese switching.
- **Unified Settings System (`~/.codesight/config.json`)**: Shared seamlessly across AI Agent plugins (`codesight_settings` MCP tool + in-card `⚙` drawer), CLI (`codesight config`), local browser board (`http://127.0.0.1:4317`), and the native macOS SwiftUI Floating HUD (`⌘,`).
- **Python + TypeScript/JavaScript GraphRAG**: Real TypeScript Compiler AST parser + Python relative/dotted import & call extractor, hybrid Okapi BM25 + bilingual vector + 1-hop graph RRF, and 0-token Silent Regression Guard (`as any`, empty `catch`, removed guards).
- **Universal Agent Distribution**: Dual-transport MCP + MCP Apps server (`stdio` + Streamable HTTP `/mcp`) with compiled Node 18+ JS entrypoints and one-command installer for Antigravity, Claude Code, Claude Desktop, Cursor, VS Code, Codex, and ChatGPT Apps.

## [0.9.1] - 2026-11-24
- Full English localization across groups, roles, summaries, and error diagnoses; added collapsible card header and `collapsedByDefault` setting.

## [0.9.0] - 2026-11-24
- Redesigned visual board to Apple / OpenAI minimalist style, introduced unified `~/.codesight/config.json` settings across Agent MCP, Sidecar, CLI, and macOS HUD, added Python support and browser preview.

## [0.8.3] - 2026-11-24
- Added directional dashed 1-hop SVG curves, separated info vs clickable controls in modals, and completed repository-wide `CodeSight` naming unification.

## [0.1.0 – 0.8.2] - 2026-11-23 to 2026-11-24
- Initial GraphRAG core, AST symbol call graph, pluggable external MCP Graph-RAG adapter, dual-transport MCP Apps server, project-adaptive architecture planner, and native SwiftUI macOS HUD.
