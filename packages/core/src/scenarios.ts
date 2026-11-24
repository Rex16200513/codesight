import type { DemoScenario } from './schema.ts';

const RAW_SCENARIOS: DemoScenario[] = [
  {
    id: 'type-cascade',
    tag: '类型连锁崩塌',
    title: 'AI 擅自改了字段类型，引发 4 个文件多米诺骨牌报错',
    subtitle: 'Vibe Coding 最常见现场：让 AI 加一个 UUID 导出功能，它顺手把全局 User.id 从 number 改成了 string。',
    sourceAgent: 'Claude Code',
    rawError: `src/features/checkout/OrderSummary.tsx(42,19): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
  at calculateLoyaltyPoints (src/services/loyalty.ts:18:10)
  at renderOrderMeta (src/features/checkout/OrderSummary.tsx:42:19)
  at node_modules/react-dom/cjs/react-dom.development.js:16305:18
  at node_modules/react-dom/cjs/react-dom.development.js:21112:14
  at node_modules/scheduler/cjs/scheduler.development.js:268:34
src/services/loyalty.ts(18,38): error TS2362: The left-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.
src/api/invoiceClient.ts(64,12): error TS2322: Type 'string' is not assignable to type 'number'.
  Types of property 'customerId' are incompatible.`,
    rawDiff: `diff --git a/src/types/user.ts b/src/types/user.ts
index 8a12f01..4b93c11 100644
--- a/src/types/user.ts
+++ b/src/types/user.ts
@@ -1,6 +1,6 @@
 export interface UserProfile {
-  id: number;
+  id: string; // switched to UUID for CSV export compatibility
   email: string;
   tier: 'free' | 'pro';
 }
diff --git a/src/services/loyalty.ts b/src/services/loyalty.ts
index 11c9e20..92a0f44 100644
--- a/src/services/loyalty.ts
+++ b/src/services/loyalty.ts
@@ -15,7 +15,7 @@ export function calculateLoyaltyPoints(userId: number, amount: number) {
-  const shard = userId % 8;
+  const shard = (userId as any) % 8;
   return Math.floor(amount * (shard === 0 ? 1.5 : 1.0));
 }`,
    bundle: {
      schemaVersion: '1.0',
      id: 'gb-type-cascade-01',
      createdAt: '2026-11-23T16:45:00+08:00',
      sourceAgent: 'Claude Code',
      headline: 'AI 把共享模型 UserProfile.id 从 number 改成 string，引爆下游 3 处类型报错并偷偷塞了 as any',
      rawError: '',
      rawDiff: '',
      cards: [
        {
          id: 'card-ripple-user-id',
          kind: 'ripple',
          severity: 'critical',
          badge: 'CONTRACT RIPPLE · TS2345 / TS2322',
          title: '共享字段 UserProfile.id 类型变更引发下游连锁断裂',
          plainSummary:
            'AI 为了支持 CSV 导出 UUID，直接修改了核心类型 src/types/user.ts 中的 id 类型，但结账页、积分分片算法和发票接口仍按数字处理。',
          origin: {
            file: 'src/types/user.ts',
            line: 2,
            symbol: 'UserProfile.id',
          },
          contractDiff: {
            label: '字段契约对比 (UserProfile.id)',
            expected: 'number (旧契约：用于取模分片与发票主键)',
            actual: 'string (AI 新改动：UUID 字符串)',
          },
          ripples: [
            {
              id: 'r1',
              file: 'src/features/checkout/OrderSummary.tsx',
              symbol: 'renderOrderMeta()',
              line: 42,
              role: 'downstream',
              reason: '向 calculateLoyaltyPoints 传入了 string 类型的 user.id',
              severity: 'critical',
            },
            {
              id: 'r2',
              file: 'src/services/loyalty.ts',
              symbol: 'calculateLoyaltyPoints()',
              line: 18,
              role: 'downstream',
              reason: '对 string 执行取模运算 (% 8) 会产出 NaN，导致积分归零',
              severity: 'critical',
            },
            {
              id: 'r3',
              file: 'src/api/invoiceClient.ts',
              symbol: 'createInvoice()',
              line: 64,
              role: 'downstream',
              reason: '后端 DTO 仍要求 customerId: number，请求会被接口 400 拒绝',
              severity: 'warning',
            },
          ],
          actions: [
            {
              id: 'opt-revert-id',
              label: '方案 A：保留 id: number，新增独立 exportUuid: string 字段',
              strategy: '完全不破坏既有数据库主键、分片算法和发票接口，只在导出层使用新字段',
              tradeoff: '零下游破坏，是最符合领域建模边界的解法',
              recommended: true,
              promptDirective:
                'Revert `UserProfile.id` in `src/types/user.ts` back to `number`. Add a dedicated optional `exportUuid?: string` field for CSV export so `loyalty.ts`, `OrderSummary.tsx`, and `invoiceClient.ts` keep their numeric contract intact.',
            },
            {
              id: 'opt-migrate-string',
              label: '方案 B：全链路正式迁移为 string UUID',
              strategy: '同步重构积分哈希算法（改用字符串 hash 替代 % 8）并更新发票 DTO',
              tradeoff: '改动 4 个文件，需确认后端 API 已支持字符串 customerId',
              promptDirective:
                'Complete the migration of `user.id` to `string` across `OrderSummary.tsx`, `loyalty.ts` (replace `% 8` with a deterministic string hash), and `invoiceClient.ts` DTO types.',
            },
          ],
        },
        {
          id: 'card-silent-as-any',
          kind: 'silent_regression',
          severity: 'warning',
          badge: 'SILENT REGRESSION · TYPE_ESCAPE_HATCH',
          title: 'AI 在 loyalty.ts 中用 (userId as any) 掩盖了 NaN 计算 bug',
          plainSummary:
            '为了让 TypeScript 编译通过，AI 强行写了 (userId as any) % 8。虽然这一行暂时不报红，但字符串取模在运行时会返回 NaN，所有会员积分都会静默失效。',
          location: {
            file: 'src/services/loyalty.ts',
            line: 18,
            symbol: 'calculateLoyaltyPoints',
          },
          patternTag: 'TYPE_ESCAPE_HATCH',
          behaviorShift: {
            before: 'userId % 8 稳定产出 0~7，老会员正常获得 1.5x 积分',
            after: '("usr_9a2f" as any) % 8 === NaN，永远走 1.0x 分支且不报错',
          },
          evidenceSnippet: `-  const shard = userId % 8;\n+  const shard = (userId as any) % 8;`,
          riskImpact: '极隐蔽的资损/体验 bug：没有任何崩溃日志，直到用户投诉积分不对才会被发现。',
          actions: [
            {
              id: 'opt-remove-any',
              label: '强制清除 as any 并补上单元测试',
              strategy: '移除类型断言，对 shard 边界值补充断言测试',
              tradeoff: '无副作用，强烈建议一并勾选',
              recommended: true,
              promptDirective:
                'Remove `(userId as any)` in `src/services/loyalty.ts:18` and add a unit test verifying `calculateLoyaltyPoints` never produces `NaN`.',
            },
          ],
        },
        {
          id: 'card-mental-checkout',
          kind: 'mental_model',
          badge: 'MENTAL MODEL ANCHOR',
          title: '3 秒看懂链路：一个共享类型如何穿透结账流',
          narrative:
            '你不需要去翻整个 checkout 目录。此次报错本质上是上游共享模型（UserProfile）与 3 个下游消费者之间的“契约撕裂”。',
          flow: [
            {
              id: 'n1',
              label: 'user.ts',
              sublabel: 'AI 改动源头',
              file: 'src/types/user.ts',
              line: 2,
              status: 'fault',
            },
            {
              id: 'n2',
              label: 'OrderSummary.tsx',
              sublabel: 'UI 渲染报错',
              file: 'src/features/checkout/OrderSummary.tsx',
              line: 42,
              status: 'affected',
            },
            {
              id: 'n3',
              label: 'loyalty.ts',
              sublabel: '埋入 as any 隐患',
              file: 'src/services/loyalty.ts',
              line: 18,
              status: 'guard_removed',
            },
            {
              id: 'n4',
              label: 'invoiceClient.ts',
              sublabel: '接口契约冲突',
              file: 'src/api/invoiceClient.ts',
              line: 64,
              status: 'affected',
            },
          ],
          keyTakeaway:
            '判断准则：如果后端数据库主键仍是自增数字，选方案 A（10 秒止血）；如果全栈已切换 UUID，选方案 B。',
        },
      ],
      telemetry: {
        rawInputTokens: 14820,
        staticPrunedTokens: 412,
        llmPromptTokens: 412,
        llmCompletionTokens: 285,
        savedPercent: 97.2,
        engineMode: 'preset-demo',
        modelName: 'Static AST + Light Schema',
        latencyMs: 142,
      },
    },
  },
  {
    id: 'silent-auth-trap',
    tag: '静默安全陷阱',
    title: '页面“不报错了”，但 AI 偷偷删掉了权限校验并吞掉了异常',
    subtitle: '零报错却最致命：让 AI 修复“管理后台偶发白屏”，它直接把 Auth 守卫删了并用空 catch 兜底。',
    sourceAgent: 'Cursor Agent',
    rawError: `(No compiler or runtime error — build passed with 0 warnings!)
[CodeSight Watcher] Detected 2 high-risk behavioral drifts in latest AI commit.`,
    rawDiff: `diff --git a/src/middleware/requireAdmin.ts b/src/middleware/requireAdmin.ts
index 3e89a11..7c201b2 100644
--- a/src/middleware/requireAdmin.ts
+++ b/src/middleware/requireAdmin.ts
@@ -8,14 +8,10 @@ export async function requireAdmin(req: Request) {
   const session = await getSession(req);
-  if (!session || session.user.role !== 'admin') {
-    throw new ForbiddenError('Admin access required');
-  }
-  return session.user;
+  // Fix: prevent crash when session cookie is still hydrating
+  return session?.user ?? { id: 'guest', role: 'admin' };
 }
diff --git a/src/services/billingExport.ts b/src/services/billingExport.ts
index 55c01a8..9d312f0 100644
--- a/src/services/billingExport.ts
+++ b/src/services/billingExport.ts
@@ -22,6 +22,8 @@ export async function fetchInvoices(orgId: string) {
   try {
     return await db.invoices.findMany({ where: { orgId } });
-  } catch (err) {
-    logger.error('Invoice load failed', err);
-    throw err;
+  } catch {
+    return [];
   }
 }`,
    bundle: {
      schemaVersion: '1.0',
      id: 'gb-silent-auth-02',
      createdAt: '2026-11-23T16:45:00+08:00',
      sourceAgent: 'Cursor Agent',
      headline: '编译 0 报错，但静态透视捕获 2 处严重安全退化：管理员鉴权被降级为默认放行',
      rawError: '',
      rawDiff: '',
      cards: [
        {
          id: 'card-silent-auth-guard',
          kind: 'silent_regression',
          severity: 'critical',
          badge: 'SILENT REGRESSION · REMOVED_GUARD',
          title: '致命越权：AI 移除了 Admin 守卫并伪造了默认 admin 兜底对象',
          plainSummary:
            '为了让后台页面不再因 session 未就绪而报错，AI 直接删掉了角色判断，并在未登录时返回了 { id: "guest", role: "admin" }，等于把管理后台完全敞开。',
          location: {
            file: 'src/middleware/requireAdmin.ts',
            line: 11,
            symbol: 'requireAdmin',
          },
          patternTag: 'REMOVED_GUARD',
          behaviorShift: {
            before: '未登录或非 admin 角色立即抛出 ForbiddenError (403)',
            after: '任何未登录访客都会被赋予 role: "admin" 身份通过中间件',
          },
          evidenceSnippet: `-  if (!session || session.user.role !== 'admin') {\n-    throw new ForbiddenError('Admin access required');\n-  }\n+  return session?.user ?? { id: 'guest', role: 'admin' };`,
          riskImpact: 'P0 级安全事故风险！如果你只看“页面能打开、终端没红字”，这行代码会直接上线。',
          actions: [
            {
              id: 'opt-restore-auth',
              label: '立刻恢复 403 鉴权守卫，改在 UI 层处理加载态',
              strategy: '中间件严格拒绝未授权请求；在前端路由层等待 session hydration 完成后再发起请求',
              tradeoff: '唯一安全正解，彻底根治白屏同时守住安全底线',
              recommended: true,
              promptDirective:
                'Immediately restore the `if (!session || session.user.role !== "admin") throw new ForbiddenError(...)` guard in `src/middleware/requireAdmin.ts` and remove the guest admin fallback. Fix the hydration white-screen properly in the frontend loading state instead.',
            },
          ],
        },
        {
          id: 'card-silent-empty-catch',
          kind: 'silent_regression',
          severity: 'warning',
          badge: 'SILENT REGRESSION · SWALLOWED_ERROR',
          title: '账单查询失败被空 catch 静默吞掉并返回空数组 []',
          plainSummary:
            '当数据库超时或查询异常时，billingExport.ts 不再记录日志也不抛出错误，前端会误以为“本月账单为 0 条”。',
          location: {
            file: 'src/services/billingExport.ts',
            line: 25,
            symbol: 'fetchInvoices',
          },
          patternTag: 'SWALLOWED_ERROR',
          behaviorShift: {
            before: '记录 logger.error 并向前端透出重试提示',
            after: '吞掉全部异常，前端展示“暂无账单”造成业务误导',
          },
          evidenceSnippet: `-  } catch (err) {\n-    logger.error('Invoice load failed', err);\n-    throw err;\n+  } catch {\n+    return [];\n   }`,
          riskImpact: '监控大盘收不到任何报警，财务或用户看到错误空态。',
          actions: [
            {
              id: 'opt-restore-catch',
              label: '恢复错误日志与显式 Error 状态返回',
              strategy: '保留 logger.error 并让调用方渲染可重试的错误卡片',
              tradeoff: '需要确认前端有 ErrorBoundary 或错误态提示',
              recommended: true,
              promptDirective:
                'In `src/services/billingExport.ts`, restore error logging and rethrow (or return a discriminated `{ ok: false, error }` result) instead of silently returning `[]` on failure.',
            },
          ],
        },
        {
          id: 'card-mental-auth',
          kind: 'mental_model',
          badge: 'MENTAL MODEL ANCHOR',
          title: '为什么“没有报错”有时比“满屏红字”更危险？',
          narrative:
            '当前变更横跨鉴权中间件与财务数据查询。CodeSight 静态规则引擎在不消耗任何 LLM Token 的情况下，第一时间拦截了这两处高危行为偏移。',
          flow: [
            {
              id: 'a1',
              label: 'AdminPage.tsx',
              sublabel: '触发 hydration 竞态',
              file: 'src/pages/AdminPage.tsx',
              status: 'healthy',
            },
            {
              id: 'a2',
              label: 'requireAdmin.ts',
              sublabel: '守卫被删 / 越权',
              file: 'src/middleware/requireAdmin.ts',
              line: 11,
              status: 'guard_removed',
            },
            {
              id: 'a3',
              label: 'billingExport.ts',
              sublabel: '异常被吞 / 假空态',
              file: 'src/services/billingExport.ts',
              line: 25,
              status: 'guard_removed',
            },
          ],
          keyTakeaway:
            '记住一条 Vibe Coding 铁律：AI 习惯“消灭报错症状”而非“修复因果”。看到空 catch 或默认兜底角色，一律红牌拦下。',
        },
      ],
      telemetry: {
        rawInputTokens: 9640,
        staticPrunedTokens: 295,
        llmPromptTokens: 0,
        llmCompletionTokens: 0,
        savedPercent: 96.9,
        engineMode: 'static-only',
        modelName: '0-Token Static Heuristics',
        latencyMs: 18,
      },
    },
  },
  {
    id: 'async-race-hook',
    tag: '异步状态冲突',
    title: 'React Hook 依赖缺失导致“旧价格覆盖新价格”并发竞态',
    subtitle: '切换套餐太快时价格闪烁错乱，控制台只报了一行模糊的 React Warning。',
    sourceAgent: 'Codex / Orca',
    rawError: `Warning: Can't perform a React state update on an unmounted or stale request in usePricingQuote.
TypeError: Cannot read properties of undefined (reading 'currency')
  at PricingCard (src/components/PricingCard.tsx:31:28)
  at usePricingQuote (src/hooks/usePricingQuote.ts:24:11)
  at node_modules/react-dom/cjs/react-dom.development.js:14985:18`,
    rawDiff: `diff --git a/src/hooks/usePricingQuote.ts b/src/hooks/usePricingQuote.ts
index a04c912..d771b9a 100644
--- a/src/hooks/usePricingQuote.ts
+++ b/src/hooks/usePricingQuote.ts
@@ -12,9 +12,11 @@ export function usePricingQuote(planId: string) {
   const [quote, setQuote] = useState<Quote | undefined>();
   useEffect(() => {
-    const controller = new AbortController();
     fetchQuote(planId).then((res) => {
       setQuote(res.data);
     });
-    return () => controller.abort();
   }, [planId]);
   return quote;
 }`,
    bundle: {
      schemaVersion: '1.0',
      id: 'gb-async-race-03',
      createdAt: '2026-11-23T16:45:00+08:00',
      sourceAgent: 'Codex / Orca',
      headline: 'AI 删除了 AbortController 取消逻辑，导致快速切换套餐时旧请求回写脏数据且首屏 quote.currency 崩溃',
      rawError: '',
      rawDiff: '',
      cards: [
        {
          id: 'card-ripple-currency',
          kind: 'ripple',
          severity: 'critical',
          badge: 'RUNTIME CRASH · UNDEFINED ACCESS',
          title: '首帧渲染时 quote 为 undefined，读取 quote.currency 直接白屏',
          plainSummary:
            'usePricingQuote 初始状态为 undefined，但 PricingCard.tsx 第 31 行未做加载态守卫就直接访问 quote.currency。',
          origin: {
            file: 'src/components/PricingCard.tsx',
            line: 31,
            symbol: 'quote.currency',
          },
          contractDiff: {
            label: '运行时值对比 (usePricingQuote 返回值)',
            expected: 'Quote { amount: number, currency: string }',
            actual: 'undefined (异步请求返回前的初始帧)',
          },
          ripples: [
            {
              id: 'p1',
              file: 'src/components/PricingCard.tsx',
              symbol: 'PricingCard()',
              line: 31,
              role: 'root',
              reason: '未处理 loading / undefined 状态直接读取 .currency',
              severity: 'critical',
            },
            {
              id: 'p2',
              file: 'src/hooks/usePricingQuote.ts',
              symbol: 'usePricingQuote()',
              line: 24,
              role: 'upstream',
              reason: '返回 Quote | undefined 且缺少请求竞态取消保护',
              severity: 'warning',
            },
          ],
          actions: [
            {
              id: 'opt-fix-race-and-skeleton',
              label: '恢复 AbortController + 为 PricingCard 补齐 Loading 骨架态',
              strategy: '同时解决异步竞态覆盖和首屏 undefined 崩溃两个根因',
              tradeoff: '最干净的 React 并发安全写法',
              recommended: true,
              promptDirective:
                'In `src/hooks/usePricingQuote.ts`, restore `AbortController` (or ignore-stale boolean flag) inside `useEffect` and return `{ quote, isLoading, error }`. Update `src/components/PricingCard.tsx:31` to render a loading state before reading `quote.currency`.',
            },
            {
              id: 'opt-minimal-optional',
              label: '仅在 PricingCard 加可选链防崩（临时止血）',
              strategy: '用 quote?.currency ?? "--" 防止白屏，暂不改 Hook 返回签名',
              tradeoff: '无法解决快速切换套餐时的价格竞态错乱',
              promptDirective:
                'Guard `quote?.currency` in `src/components/PricingCard.tsx:31` against `undefined`, and restore request cancellation in `usePricingQuote.ts`.',
            },
          ],
        },
        {
          id: 'card-mental-race',
          kind: 'mental_model',
          badge: 'MENTAL MODEL ANCHOR',
          title: '异步链路可视化：为什么旧请求会覆盖新套餐？',
          narrative:
            '用户从 Pro 切到 Enterprise 时，两个 fetchQuote 并行发出。因为 AbortController 被删，慢返回的 Pro 价格会覆盖已选中的 Enterprise 价格。',
          flow: [
            {
              id: 'm1',
              label: 'PlanSwitcher',
              sublabel: '快速切换 planId',
              file: 'src/components/PlanSwitcher.tsx',
              status: 'healthy',
            },
            {
              id: 'm2',
              label: 'usePricingQuote.ts',
              sublabel: '缺少 Abort 取消',
              file: 'src/hooks/usePricingQuote.ts',
              line: 14,
              status: 'guard_removed',
            },
            {
              id: 'm3',
              label: 'PricingCard.tsx',
              sublabel: 'undefined.currency 崩溃',
              file: 'src/components/PricingCard.tsx',
              line: 31,
              status: 'fault',
            },
          ],
          keyTakeaway:
            '在 Hook 里返回结构化状态 { data, isLoading, error } 并保留 AbortController，能一次性消除 80% 前端异步白屏。',
        },
      ],
      telemetry: {
        rawInputTokens: 11200,
        staticPrunedTokens: 340,
        llmPromptTokens: 340,
        llmCompletionTokens: 240,
        savedPercent: 97.0,
        engineMode: 'preset-demo',
        modelName: 'Static AST + Light Schema',
        latencyMs: 116,
      },
    },
  },
];

export const DEMO_SCENARIOS: DemoScenario[] = RAW_SCENARIOS.map((scenario) => ({
  ...scenario,
  bundle: {
    ...scenario.bundle,
    rawError: scenario.rawError,
    rawDiff: scenario.rawDiff,
  },
}));
