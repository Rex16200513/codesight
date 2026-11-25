<p align="center">
  <img src="./assets/codesight-social.png" alt="CodeSight — 看懂 AI 改了什么，在它改坏项目之前。" width="820" />
</p>

<p align="center">
  <a href="https://github.com/Rex16200513/codesight/actions/workflows/ci.yml"><img src="https://github.com/Rex16200513/codesight/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Rex16200513/codesight/releases"><img src="https://img.shields.io/github/v/release/Rex16200513/codesight?style=flat-square&color=111111" alt="Latest Release" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-111111?style=flat-square" alt="Node >= 18" />
  <img src="https://img.shields.io/badge/语言-TS%20%7C%20JS%20%7C%20Python-0071E3?style=flat-square" alt="TS, JS, Python" />
  <img src="https://img.shields.io/badge/协议-MCP%20%2B%20MCP%20Apps-0071E3?style=flat-square" alt="MCP + MCP Apps" />
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <strong>简体中文</strong> ·
  <a href="https://github.com/Rex16200513/codesight/releases/download/v1.0.1/codesight-bilibili.mp4">观看 B 站中文配音宣传片</a> ·
  <a href="./CHANGELOG.md">更新日志</a>
</p>

---

**CodeSight** 是一款本地优先（Local-first）的 **GraphRAG 代码理解与排错引擎**，专为 AI 编程（Cursor、Claude Code、Antigravity、Codex、ChatGPT 等）设计。

当 AI 跨几十个文件改代码时，最常见的两个痛点是 **“看不清整体架构”** 和 **“静默回归”**（AI 为了让报错消失，悄悄删除鉴权校验、写空 `catch {}` 或加 `as any`）。CodeSight 在本地毫秒级构建真实 AST 调用图与依赖图，以 **0 Token 成本** 拦截静默退化，并在 AI 对话内或原生 macOS 悬浮窗中呈现极简可交互架构图。

---

## 实机演示

<p align="center">
  <img src="./assets/codesight-demo.gif" alt="CodeSight 产品演示" width="820" />
</p>

<p align="center">
  <sub>1080p 高清中文配音宣传片：<a href="https://github.com/Rex16200513/codesight/releases/download/v1.0.1/codesight-bilibili.mp4">从 GitHub Release v1.0.1 观看/下载</a></sub>
</p>

---

## 适合谁用？

CodeSight 同时兼顾了**非技术创作者的直观理解**与**工程师的精准排错**：

- **产品经理 / 设计师 / 不太懂代码的 Vibe Coding 玩家**
  - 不用一行行读源码，也能一眼看清整个项目的目录结构与前后端分层；
  - 直观知道 **前端里哪些组件决定了什么界面显示**（点击任意组件即可看到对应的弹窗/页面/卡片原型示意与依赖关系）；
  - 一眼识别 **后端与底层哪些文件是核心（Core）共享模块**，改需求前清楚哪里可以放心微调、哪里动一发而牵全身。
- **研发工程师 / 全栈 / 独立开发者**
  - 把终端报错或 `git diff` 直接映射到 **具体的出问题代码块、AST 符号位置与跨文件调用链**，省去翻几十个文件定位的时间；
  - 修改共享类型或接口前，精准查看 **改动波及范围（直接/间接影响文件）与安全区文件数**；
  - 以 **0 Token 成本** 拦住 AI 偷偷塞进去的 `as any`、空 `catch {}` 和被删掉的校验守卫，并在“内部兼容修复”与“多文件联动升级”之间先做架构决策。

---

## 我们在 GraphRAG 基础上对代码做了什么处理？

CodeSight 不是把代码随便切块丢进向量库，而是在本地对代码执行了一套**确定性的 5 步 GraphRAG 处理管线**：

1. **增量真 AST 与多语言解析**（`astParser.ts`、`repoIndexer.ts`）
   对 TypeScript / JavaScript / TSX / JSX 直接调用 **TypeScript 编译器官方 AST**（杜绝正则误判），同时支持 **Python** 相对/点号 import 与函数调用抽取；结合 SHA-256 哈希缓存（`.codesight/index.json`），未改动文件毫秒级跳过。
2. **文件级 + 符号级双层图谱构建**（`codeGraph.ts`、`graphProvider.ts`、`mcpGraphProvider.ts`）
   同时构建 **文件依赖图**（计算入度、出度、传递下游波及面与 Core 核心枢纽）和 **跨文件函数/组件调用图**（精确到函数、类与 React JSX 组件的调用行号），并支持通过 stdio 挂载外部开源 Graph-RAG MCP 增强图谱。
3. **BM25 + 双语向量 + 1-Hop 图传播 RRF 混合检索**（`embeddingIndex.ts`）
   融合 **Okapi BM25 词法匹配**、**中英双语语义向量** 与 **1 跳依赖图关联增强**（并对 `index.ts` 汇总导出文件做降权防噪声），针对任意自然语言提问或报错，精准提取约 **3% 的最小核心代码切片**（平均节省 ~97% Token）。
4. **面向人类理解的架构分层与原型抽象**（`architecturePlanner.ts`、`visualMap.ts`）
   把底层枯燥的图节点翻译成 **前端 / 服务 / 核心基础** 竖排架构视图、大白话文件职责，并根据组件与导出特征自动推断 **UI 线框原型或服务流转示意**（默认 0-Token 本地启发式识别，也支持宿主 Agent 注入 `architectureOverride` 或可选 BYOK 小模型缓存）。
5. **确定性报错投影与 0-Token 静默回归守卫**（`staticAnalyzer.ts`、`comprehensionEngine.ts`）
   自动剥离 `node_modules` 噪声栈，将报错和 `git diff` 精确投影到 AST 符号与爆炸半径上，0 Token 检测 `REMOVED_GUARD`（删守卫）、`SWALLOWED_ERROR`（空 catch）、`TYPE_ESCAPE_HATCH`（`as any`），最终生成带架构权衡的可选修复指令。

---

## 为什么选择 CodeSight

| 能力 | 直接问普通 AI Agent | 接入 CodeSight 后 |
| --- | --- | --- |
| **看懂陌生项目结构** | 逐个读文件，动辄消耗 2.5w–6w Token | 本地增量 AST + 依赖图约 25ms 完成（**0 Token**） |
| **查清改一个共用文件会影响谁** | 靠文本搜索，容易漏掉 re-export 或 JSX 组件调用 | 确定性跨文件 AST 函数/组件调用图（`codesight_trace`） |
| **定位复杂多文件报错** | 容易陷入“改 A 坏 B”死循环 | 将报错栈投影到依赖图，精准切片（**节省约 97% Token**） |
| **拦截 AI 静默回归** | 经常靠 `as any` 或空 `catch` 强行糊弄过编译 | 0-Token 静态守卫即时拦截 `REMOVED_GUARD`、`SWALLOWED_ERROR`、`TYPE_ESCAPE_HATCH` |
| **聊天流中的可读性** | 满屏冗长 Markdown 文本 | 极简可折叠交互卡：竖排分层、虚线流向、原型线框、中英即时切换 |

---

## 核心界面一览

### 1. 竖排前后端分层 + 带箭头虚线流向
自动识别 TypeScript、JavaScript 与 Python 项目的 **前端 / 后端 / 共享核心** 分层。悬停任意文件，仅拉出该文件的 **1 跳直接关联虚线**（蓝虚线为「依赖」，橙/红虚线为「影响」），清晰不缠绕。

<p align="center">
  <img src="./assets/screenshots/01-architecture-map.png" alt="竖排架构图" width="800" />
</p>

### 2. UI 线框原型、非 UI 关系小图与 0-Token 拆分预警
点击前端 UI 模块，直接预览**控件级 UI 线框原型**（支持顶栏与弹窗内 `✦ AI 原型` 一键刷新）；点击后端 / 核心逻辑模块，自动展示真实的 **AST 局部依赖关系小图**。体量过大或高耦合文件会以底部图例 `● 建议拆分` 标记，并提供一键**安全拆分指令**（改完后自动提示 AI 再次调用 CodeSight 复验）。

<p align="center">
  <img src="./assets/screenshots/02-prototype-modal.png" alt="原型弹窗" width="800" />
</p>

### 3. 报错影响范围 + 双选修复决策
遇到编译或运行时报错时，自动标红报错源头、拉出受影响下游虚线，并在修改高频共享文件前给出清晰的 **双选修复方向**（例如“只修内部保持接口兼容” vs “同步升级所有调用方”），把架构决策权还给开发者。

<p align="center">
  <img src="./assets/screenshots/03-error-diagnosis.png" alt="报错诊断与修复决策" width="800" />
</p>

### 4. 一键折叠 44px 单行条 + 全端统一设置
针对长对话连续排错场景设计：点击顶栏或 `⌄` 可将任意卡片收起为 **44px 极简单行条**（报错卡保留红点文件名）；点击 **`⚙`** 打开设置抽屉，所有偏好统一持久化到 `~/.codesight/config.json`，在 Agent 插件、浏览器与 macOS 悬浮 HUD 之间实时同步。

<table>
  <tr>
    <td width="52%" valign="top">
      <img src="./assets/screenshots/04-settings-drawer.png" alt="内置设置面板" width="100%" />
      <p align="center"><sub>卡片内置苹果风设置抽屉，同步至 <code>~/.codesight/config.json</code></sub></p>
    </td>
    <td width="48%" valign="middle">
      <img src="./assets/screenshots/05-collapsed-bar.png" alt="折叠后的 44px 单行条" width="100%" />
      <p align="center"><sub>一键折叠成 44px 单行条，长对话排错清爽不刷屏</sub></p>
      <br />
      <ul>
        <li><strong>Agent 插件设置</strong>：点击卡片 <code>⚙</code> 或对话调用 <code>codesight_settings</code></li>
        <li><strong>macOS HUD 设置</strong>：按 <code>⌘,</code> 调整语言、窗口置顶、透明度与守卫开关</li>
        <li><strong>命令行设置</strong>：<code>codesight config show | set | reset</code></li>
      </ul>
    </td>
  </tr>
</table>

---

## 全生态适配矩阵（覆盖 11 款主流 AI Agent + 原生 macOS HUD）

| 客户端 / 环境 | 插件接入方式 | 交互视图 | 一键安装命令 |
| --- | --- | --- | --- |
| **DeepSeek Harness (`dsh`)** | 原生 Cordis 插件包（`@codesight/dsh-plugin`）+ MCP Overlay | Web UI 原生插槽卡片 | `dsh plugin add ./packages/dsh-plugin` 或 `... install --target dsh` |
| **Antigravity** | 原生插件 + MCP Apps (`stdio`) | 对话内嵌交互卡 | `node packages/cli/dist/cli.js install --target antigravity` |
| **Claude Code** | MCP (`stdio`) | 对话 / 交互全图 | `node packages/cli/dist/cli.js install --target claude-code` |
| **Claude Desktop** | MCP Apps (`stdio`) | 对话内嵌交互卡 | `node packages/cli/dist/cli.js install --target claude-desktop` |
| **Cursor** | MCP (`stdio`) | 交互全图 + 文本 | `node packages/cli/dist/cli.js install --target cursor` |
| **Windsurf** | MCP (`stdio`) | 交互全图 + 文本 | `node packages/cli/dist/cli.js install --target windsurf` |
| **VS Code / Copilot** | MCP (`stdio`) | 交互全图 + macOS HUD | `node packages/cli/dist/cli.js install --target vscode` |
| **Cline / Roo Code** | MCP (`stdio`) | 交互全图 + 文本 | `node packages/cli/dist/cli.js install --target cline` |
| **OpenCode** | 本地 MCP (`opencode.json`) | 交互全图 + 文本 | `node packages/cli/dist/cli.js install --target opencode` |
| **OpenAI Codex CLI** | MCP (`stdio`) | 交互全图 + 文本 | `node packages/cli/dist/cli.js install --target codex` |
| **ChatGPT Apps / 远程** | Streamable HTTP (`/mcp`) | 对话内嵌 MCP Apps | `npm run mcp:http` |
| **macOS 悬浮 HUD** | 本地 Sidecar (`127.0.0.1:4317`) | 原生 SwiftUI 置顶浮窗 | `npm run hud:open` |

---

## 快速开始

```bash
git clone https://github.com/Rex16200513/codesight.git
cd codesight
npm install && npm run build
```

### 1. 一键安装到你的 AI Agent

```bash
node packages/cli/dist/cli.js install --target cursor
node packages/cli/dist/cli.js install --target claude-code
node packages/cli/dist/cli.js install --target antigravity
# 预览全部安装目标：
node packages/cli/dist/cli.js install --target all --dry-run
```

### 2. 在浏览器直接打开交互全图

```bash
# 单次静态预览
node packages/cli/dist/cli.js map --open

# 或启动本地 Sidecar（实时图谱 + 持久化设置，访问 http://127.0.0.1:4317）
npm run dev:sidecar
```

### 3. 可选：启动原生 macOS 悬浮 HUD（适合 VS Code / 传统 IDE 用户）

```bash
npm run hud:open
```

---

## 隐私与本地优先

- **默认 100% 本地运行**：AST 解析、依赖图谱、BM25/向量检索与静默回归检测均在本机完成，无需任何 API Key，不上传代码。
- **可选 BYOK 增强**：仅当你在设置中主动开启 OpenAI / DeepSeek / OpenRouter / 本地 Ollama 时，才会将剪枝后的核心切片发送给你的模型。

## 开源协议

[MIT](./LICENSE) © 2026 CodeSight Contributors
