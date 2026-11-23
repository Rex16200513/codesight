import type { DiagnosticBundle } from '@glassbox/core';

/**
 * MCP Apps (io.modelcontextprotocol/ui) Adapter Blueprint
 *
 * Converts any GlassBox DiagnosticBundle into an MCP UI Resource envelope (`ui://`).
 * When migrating GlassBox into Codex, Orca, Claude Desktop, Cursor, or VS Code MCP Apps,
 * the host simply mounts `@glassbox/ui` inside the sandboxed UI frame and reads `bundle`
 * from `window.__GLASSBOX_BUNDLE__` or `postMessage`.
 */
export interface MCPUIResourceEnvelope {
  uri: string;
  mimeType: 'text/html+mcp';
  meta: {
    protocol: 'io.modelcontextprotocol/ui';
    schemaVersion: DiagnosticBundle['schemaVersion'];
    bundleId: string;
    cardCount: number;
  };
  bundle: DiagnosticBundle;
  textFallback: string;
}

export function toMCPAppResource(bundle: DiagnosticBundle): MCPUIResourceEnvelope {
  const summaryLines = bundle.cards.map((card, i) => {
    if (card.kind === 'ripple') {
      return `${i + 1}. [RIPPLE] ${card.title} (${card.origin.file}${card.origin.line ? `:${card.origin.line}` : ''})`;
    }
    if (card.kind === 'silent_regression') {
      return `${i + 1}. [SILENT REGRESSION · ${card.patternTag}] ${card.title} (${card.location.file})`;
    }
    return `${i + 1}. [MENTAL MODEL] ${card.title}`;
  });

  return {
    uri: `ui://glassbox/diagnostic/${bundle.id}`,
    mimeType: 'text/html+mcp',
    meta: {
      protocol: 'io.modelcontextprotocol/ui',
      schemaVersion: bundle.schemaVersion,
      bundleId: bundle.id,
      cardCount: bundle.cards.length,
    },
    bundle,
    textFallback: [
      `GlassBox X-Ray (${bundle.sourceAgent}): ${bundle.headline}`,
      ...summaryLines,
      `Token Budget: ${bundle.telemetry.rawInputTokens} -> ${bundle.telemetry.staticPrunedTokens} tok (-${bundle.telemetry.savedPercent}%)`,
    ].join('\n'),
  };
}
