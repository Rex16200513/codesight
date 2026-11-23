import ts from 'typescript';

export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'const'
  | 'enum'
  | 'component';

export interface ParsedSymbol {
  /** Unique id: `<filePath>::<name>` */
  id: string;
  name: string;
  kind: SymbolKind;
  file: string;
  startLine: number;
  endLine: number;
  exported: boolean;
  /** Compact 1-line signature for low-token human/LLM reading */
  signature: string;
  /** Direct function/method identifiers invoked inside this symbol's body */
  calls: string[];
  /** Leading JSDoc summary if present */
  doc?: string;
}

export interface AstFileParseResult {
  imports: string[];
  exports: string[];
  symbols: ParsedSymbol[];
  leadingDoc?: string;
  parserUsed: 'typescript-ast' | 'fallback-regex';
}

const TS_JS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function getLineNumber(sf: ts.SourceFile, pos: number): number {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const mods = ts.getModifiers(node);
  return Boolean(mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

function extractJsDoc(node: ts.Node, sf: ts.SourceFile): string | undefined {
  const fullText = sf.getFullText();
  const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
  if (!ranges || ranges.length === 0) return undefined;
  const last = ranges[ranges.length - 1];
  const raw = fullText.slice(last.pos, last.end);
  if (!raw.startsWith('/**')) return undefined;
  const lines = raw
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').trim())
    .filter((l) => l.length > 0 && !l.startsWith('@'));
  return lines.length > 0 ? lines.slice(0, 2).join(' ') : undefined;
}

/** Walk a symbol's AST subtree to collect direct call targets (function & JSX component calls) */
function collectCallsInNode(root: ts.Node): string[] {
  const calls = new Set<string>();
  const IGNORED_BUILTINS = new Set([
    'log', 'warn', 'error', 'map', 'filter', 'forEach', 'reduce', 'push', 'slice',
    'join', 'split', 'trim', 'includes', 'startsWith', 'endsWith', 'replace', 'match',
    'test', 'exec', 'toString', 'toLowerCase', 'toUpperCase', 'keys', 'values', 'entries',
    'from', 'stringify', 'parse', 'now', 'min', 'max', 'floor', 'ceil', 'round', 'sqrt',
    'has', 'get', 'set', 'add', 'delete', 'sort', 'find', 'some', 'every', 'concat',
    'useState', 'useEffect', 'useMemo', 'useRef', 'useCallback',
  ]);

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr)) {
        if (!IGNORED_BUILTINS.has(expr.text)) calls.add(expr.text);
      } else if (ts.isPropertyAccessExpression(expr)) {
        const propName = expr.name.text;
        if (!IGNORED_BUILTINS.has(propName)) calls.add(propName);
      }
    } else if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText();
      // Only track PascalCase React components (skip html tags like div/span)
      if (/^[A-Z][A-Za-z0-9_]*$/.test(tag)) {
        calls.add(tag);
      }
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(root, visit);
  return Array.from(calls);
}

function compactSignature(node: ts.Node, sf: ts.SourceFile): string {
  const text = node.getText(sf);
  const firstLine = text.split('\n')[0]?.trim() ?? '';
  return firstLine.replace(/\{[\s\S]*$/, '').trim().slice(0, 110);
}

function parseWithTypeScriptAST(relPath: string, content: string): AstFileParseResult {
  const scriptKind = relPath.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : relPath.endsWith('.jsx')
    ? ts.ScriptKind.JSX
    : relPath.endsWith('.ts')
    ? ts.ScriptKind.TS
    : ts.ScriptKind.JS;

  const sf = ts.createSourceFile(relPath, content, ts.ScriptTarget.Latest, true, scriptKind);

  const imports = new Set<string>();
  const exports = new Set<string>();
  const symbols: ParsedSymbol[] = [];

  // Extract file-level leading JSDoc comment
  let leadingDoc: string | undefined;
  const topRanges = ts.getLeadingCommentRanges(content, 0);
  if (topRanges && topRanges.length > 0) {
    const raw = content.slice(topRanges[0].pos, topRanges[0].end);
    if (raw.startsWith('/**')) {
      const cleaned = raw
        .replace(/^\/\*\*/, '')
        .replace(/\*\/$/, '')
        .split('\n')
        .map((l) => l.replace(/^\s*\*\s?/, '').trim())
        .filter((l) => l.length > 0 && !l.startsWith('@'));
      if (cleaned.length > 0) leadingDoc = cleaned.slice(0, 2).join(' ');
    }
  }

  const visitTopLevel = (node: ts.Node) => {
    // 1. Imports & Re-exports
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.add(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.add(node.moduleSpecifier.text);
    }

    // 2. Functions
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      const exported = hasExportModifier(node);
      if (exported) exports.add(name);
      const isComponent = relPath.endsWith('.tsx') && /^[A-Z]/.test(name);
      symbols.push({
        id: `${relPath}::${name}`,
        name,
        kind: isComponent ? 'component' : 'function',
        file: relPath,
        startLine: getLineNumber(sf, node.getStart(sf)),
        endLine: getLineNumber(sf, node.getEnd()),
        exported,
        signature: compactSignature(node, sf),
        calls: collectCallsInNode(node),
        doc: extractJsDoc(node, sf),
      });
      return;
    }

    // 3. Classes
    if (ts.isClassDeclaration(node) && node.name) {
      const name = node.name.text;
      const exported = hasExportModifier(node);
      if (exported) exports.add(name);
      symbols.push({
        id: `${relPath}::${name}`,
        name,
        kind: 'class',
        file: relPath,
        startLine: getLineNumber(sf, node.getStart(sf)),
        endLine: getLineNumber(sf, node.getEnd()),
        exported,
        signature: compactSignature(node, sf),
        calls: collectCallsInNode(node),
        doc: extractJsDoc(node, sf),
      });
      return;
    }

    // 4. Interfaces / Type Aliases / Enums
    if (ts.isInterfaceDeclaration(node)) {
      const name = node.name.text;
      const exported = hasExportModifier(node);
      if (exported) exports.add(name);
      symbols.push({
        id: `${relPath}::${name}`,
        name,
        kind: 'interface',
        file: relPath,
        startLine: getLineNumber(sf, node.getStart(sf)),
        endLine: getLineNumber(sf, node.getEnd()),
        exported,
        signature: compactSignature(node, sf),
        calls: [],
        doc: extractJsDoc(node, sf),
      });
      return;
    }

    if (ts.isTypeAliasDeclaration(node)) {
      const name = node.name.text;
      const exported = hasExportModifier(node);
      if (exported) exports.add(name);
      symbols.push({
        id: `${relPath}::${name}`,
        name,
        kind: 'type',
        file: relPath,
        startLine: getLineNumber(sf, node.getStart(sf)),
        endLine: getLineNumber(sf, node.getEnd()),
        exported,
        signature: compactSignature(node, sf),
        calls: [],
        doc: extractJsDoc(node, sf),
      });
      return;
    }

    if (ts.isEnumDeclaration(node)) {
      const name = node.name.text;
      const exported = hasExportModifier(node);
      if (exported) exports.add(name);
      symbols.push({
        id: `${relPath}::${name}`,
        name,
        kind: 'enum',
        file: relPath,
        startLine: getLineNumber(sf, node.getStart(sf)),
        endLine: getLineNumber(sf, node.getEnd()),
        exported,
        signature: compactSignature(node, sf),
        calls: [],
        doc: extractJsDoc(node, sf),
      });
      return;
    }

    // 5. Variable statements (exported constants or top-level arrow functions)
    if (ts.isVariableStatement(node)) {
      const exported = hasExportModifier(node);
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const name = decl.name.text;
        const init = decl.initializer;
        const isFn = Boolean(init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)));
        if (exported) exports.add(name);
        if (exported || isFn) {
          const isComponent = relPath.endsWith('.tsx') && /^[A-Z]/.test(name) && isFn;
          symbols.push({
            id: `${relPath}::${name}`,
            name,
            kind: isComponent ? 'component' : isFn ? 'function' : 'const',
            file: relPath,
            startLine: getLineNumber(sf, decl.getStart(sf)),
            endLine: getLineNumber(sf, decl.getEnd()),
            exported,
            signature: compactSignature(node, sf),
            calls: init ? collectCallsInNode(init) : [],
            doc: extractJsDoc(node, sf),
          });
        }
      }
      return;
    }

    // Also capture dynamic import('...') or require('...') inside statements
    const walkDynamic = (inner: ts.Node) => {
      if (
        ts.isCallExpression(inner) &&
        inner.arguments.length === 1 &&
        ts.isStringLiteral(inner.arguments[0])
      ) {
        if (
          inner.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(inner.expression) && inner.expression.text === 'require')
        ) {
          imports.add(inner.arguments[0].text);
        }
      }
      ts.forEachChild(inner, walkDynamic);
    };
    walkDynamic(node);
  };

  ts.forEachChild(sf, visitTopLevel);

  return {
    imports: Array.from(imports),
    exports: Array.from(exports),
    symbols,
    leadingDoc,
    parserUsed: 'typescript-ast',
  };
}

/** Fallback lightweight parser for non-TS languages (Python, Go, Rust, CSS, etc.) */
function parseFallback(relPath: string, content: string): AstFileParseResult {
  const imports = new Set<string>();
  const exports = new Set<string>();
  const symbols: ParsedSymbol[] = [];
  const lines = content.split('\n');

  if (relPath.endsWith('.py')) {
    lines.forEach((line, idx) => {
      const imp = line.match(/^\s*(?:from\s+([a-zA-Z0-9_.]+)\s+import|import\s+([a-zA-Z0-9_.]+))/);
      if (imp) imports.add(imp[1] || imp[2]);
      const fn = line.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(/);
      if (fn) {
        const name = fn[1];
        const exported = !name.startsWith('_');
        if (exported) exports.add(name);
        symbols.push({
          id: `${relPath}::${name}`,
          name,
          kind: 'function',
          file: relPath,
          startLine: idx + 1,
          endLine: idx + 1,
          exported,
          signature: line.trim().slice(0, 100),
          calls: [],
        });
      }
      const cls = line.match(/^class\s+([a-zA-Z0-9_]+)/);
      if (cls) {
        exports.add(cls[1]);
        symbols.push({
          id: `${relPath}::${cls[1]}`,
          name: cls[1],
          kind: 'class',
          file: relPath,
          startLine: idx + 1,
          endLine: idx + 1,
          exported: true,
          signature: line.trim().slice(0, 100),
          calls: [],
        });
      }
    });
  } else if (relPath.endsWith('.go')) {
    lines.forEach((line, idx) => {
      const fn = line.match(/^func\s+(?:\([^)]+\)\s*)?([A-Za-z0-9_]+)\s*\(/);
      if (fn) {
        const name = fn[1];
        const exported = /^[A-Z]/.test(name);
        if (exported) exports.add(name);
        symbols.push({
          id: `${relPath}::${name}`,
          name,
          kind: 'function',
          file: relPath,
          startLine: idx + 1,
          endLine: idx + 1,
          exported,
          signature: line.trim().slice(0, 100),
          calls: [],
        });
      }
    });
  } else if (relPath.endsWith('.rs')) {
    lines.forEach((line, idx) => {
      const fn = line.match(/^\s*(pub\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)/);
      if (fn) {
        const exported = Boolean(fn[1]);
        const name = fn[2];
        if (exported) exports.add(name);
        symbols.push({
          id: `${relPath}::${name}`,
          name,
          kind: 'function',
          file: relPath,
          startLine: idx + 1,
          endLine: idx + 1,
          exported,
          signature: line.trim().slice(0, 100),
          calls: [],
        });
      }
    });
  }

  return {
    imports: Array.from(imports),
    exports: Array.from(exports),
    symbols,
    parserUsed: 'fallback-regex',
  };
}

/**
 * Parse any source file into accurate imports, exports, and symbol-level call metadata.
 * Uses the real TypeScript Compiler AST for TS/JS/TSX/JSX (zero regex false positives!).
 */
export function parseSourceFileAST(relPath: string, ext: string, content: string): AstFileParseResult {
  if (TS_JS_EXTS.has(ext.toLowerCase())) {
    return parseWithTypeScriptAST(relPath, content);
  }
  return parseFallback(relPath, content);
}
