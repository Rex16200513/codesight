import { useEffect, useState } from 'react';
import {
  DEMO_SCENARIOS,
  analyzeDiagnostic,
  type DiagnosticBundle,
  type LLMConfig,
} from '@glassbox/core';
import { GlassBoxHUD, type HUDTheme } from '@glassbox/ui';

const STORAGE_KEY = 'glassbox_byok_llm_config_v1';
const SIDECAR_URL = 'http://127.0.0.1:4317';

const DEFAULT_CUSTOM_ERROR = `src/services/payment.ts(54,12): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'number'.
  at chargeSubscription (src/services/payment.ts:54:12)
  at handleCheckoutSubmit (src/pages/Checkout.tsx:89:7)
  at node_modules/react-dom/cjs/react-dom.development.js:18421:11`;

const DEFAULT_CUSTOM_DIFF = `diff --git a/src/services/payment.ts b/src/services/payment.ts
--- a/src/services/payment.ts
+++ b/src/services/payment.ts
@@ -49,9 +49,7 @@ export async function chargeSubscription(user: User, cents: number) {
-  if (!user.verified) {
-    throw new Error('User must be verified before billing');
-  }
   try {
     return await stripe.charges.create({ amount: cents });
-  } catch (e) { throw e; }
+  } catch { return []; }
 }`;

function loadStoredConfig(): LLMConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LLMConfig;
  } catch {
    // ignore storage errors
  }
  return {
    enabled: false,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
  };
}

export function App() {
  const [theme, setTheme] = useState<HUDTheme>('light');
  const [activeScenarioId, setActiveScenarioId] = useState<string>(DEMO_SCENARIOS[0].id);
  const [customError, setCustomError] = useState(DEFAULT_CUSTOM_ERROR);
  const [customDiff, setCustomDiff] = useState(DEFAULT_CUSTOM_DIFF);
  const [bundle, setBundle] = useState<DiagnosticBundle>(DEMO_SCENARIOS[0].bundle);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [llmConfig, setLlmConfig] = useState<LLMConfig>(loadStoredConfig);
  const [sidecarConnected, setSidecarConnected] = useState(false);
  const [highlightedFile, setHighlightedFile] = useState<string | null>(null);

  const handleChangeLLMConfig = (next: LLMConfig) => {
    setLlmConfig(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let source: EventSource | null = null;
    try {
      source = new EventSource(`${SIDECAR_URL}/api/events`);
      source.addEventListener('connected', () => setSidecarConnected(true));
      source.addEventListener('diagnostic', (event) => {
        try {
          const incoming = JSON.parse((event as MessageEvent).data) as DiagnosticBundle;
          setActiveScenarioId('live-sidecar');
          setBundle(incoming);
        } catch {
          // ignore
        }
      });
      source.onerror = () => setSidecarConnected(false);
    } catch {
      setSidecarConnected(false);
    }
    return () => source?.close();
  }, []);

  const handleSelectScenario = (scenarioId: string) => {
    const found = DEMO_SCENARIOS.find((s) => s.id === scenarioId);
    if (!found) return;
    setActiveScenarioId(scenarioId);
    setBundle(found.bundle);
    setHighlightedFile(null);
  };

  const runLiveAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const nextBundle = await analyzeDiagnostic(
        {
          rawError: customError,
          rawDiff: customDiff,
          sourceAgent: llmConfig.enabled ? llmConfig.model : 'Static X-Ray',
        },
        llmConfig
      );
      setActiveScenarioId('custom');
      setBundle(nextBundle);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const highlightName = highlightedFile?.split('/').pop() ?? null;
  const matchesHighlight = (line: string) =>
    Boolean(highlightedFile && (line.includes(highlightedFile) || (highlightName && line.includes(highlightName))));

  return (
    <div className={`gb-demo-stage ${theme === 'dark' ? 'stage-dark' : ''}`}>
      {/* Subtle Demo Switcher Topbar (Simulates switching Vibe Coding incidents on your desktop) */}
      <nav className="gb-stage-nav">
        <div className="gb-stage-label">
          <span>模拟背景：你的 Vibe Coding 终端与编辑器</span>
        </div>

        <div className="gb-stage-pills">
          {DEMO_SCENARIOS.map((sc) => (
            <button
              key={sc.id}
              type="button"
              className={`gb-stage-pill ${activeScenarioId === sc.id ? 'active' : ''}`}
              onClick={() => handleSelectScenario(sc.id)}
            >
              {sc.tag}
            </button>
          ))}
        </div>
      </nav>

      {/* Calm Simulated Coding Environment Behind the Floating HUD */}
      <main className="gb-mock-desktop" aria-label="模拟编辑器与报错终端背景">
        <section className="gb-mock-window">
          <div className="gb-mock-titlebar">
            <div className="gb-traffic">
              <span />
              <span />
              <span />
            </div>
            <span>Terminal — {bundle.sourceAgent}</span>
          </div>
          <pre className="gb-mock-pre">
            {(bundle.rawError || '(无报错输出)').split('\n').map((line, i) => (
              <span
                key={i}
                className={`gb-mock-line ${/error|TypeError|Warning/i.test(line) ? 'is-err' : ''} ${
                  matchesHighlight(line) ? 'is-hl' : ''
                }`}
              >
                {line || ' '}
              </span>
            ))}
          </pre>
        </section>

        <section className="gb-mock-window">
          <div className="gb-mock-titlebar">
            <div className="gb-traffic">
              <span />
              <span />
              <span />
            </div>
            <span>git diff (AI 刚刚改动的代码)</span>
          </div>
          <pre className="gb-mock-pre">
            {(bundle.rawDiff || '(无 Diff 变更)').split('\n').map((line, i) => (
              <span
                key={i}
                className={`gb-mock-line ${matchesHighlight(line) ? 'is-hl' : ''}`}
              >
                {line || ' '}
              </span>
            ))}
          </pre>
        </section>
      </main>

      {/* The Actual Draggable, Collapsible Floating Screen HUD */}
      <GlassBoxHUD
        bundle={bundle}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        llmConfig={llmConfig}
        sidecarConnected={sidecarConnected}
        isAnalyzing={isAnalyzing}
        customError={customError}
        customDiff={customDiff}
        onChangeCustomError={setCustomError}
        onChangeCustomDiff={setCustomDiff}
        onRunCustomAnalyze={() => void runLiveAnalysis()}
        onChangeLLMConfig={handleChangeLLMConfig}
        onHighlightFile={setHighlightedFile}
      />
    </div>
  );
}
