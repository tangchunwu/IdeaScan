
# 用户配额与示例报告系统实施计划

## 需求确认

根据你的要求，系统将做以下调整：

| API 类型 | 当前逻辑 | 修改后逻辑 |
|---------|---------|-----------|
| **TikHub** | 用户配置 → 系统 TIKHUB_TOKEN | 用户配置 → 系统 TIKHUB_TOKEN（**限制 1 次**） |
| **LLM** | 用户配置 → Lovable AI Gateway | **始终使用系统 LLM**（需配置你自己的 API） |
| **搜索** | 仅用户配置时使用 | **始终使用系统配置**（需配置 Tavily/Bocha） |

同时，所有用户登录后都能看到最新的 2 个示例报告。

---

## 第一部分：需要配置的新 Secrets

在实施前需要添加以下 secrets：

| Secret 名称 | 用途 | 当前状态 |
|------------|------|---------|
| `TIKHUB_TOKEN` | 小红书/抖音数据抓取 | ✅ 已配置 |
| `LOVABLE_API_KEY` | 系统 LLM（Lovable AI） | ✅ 已配置（但需换成你自己的） |
| `LLM_API_KEY` | 你自己的 LLM API Key | ❌ 需新增 |
| `LLM_BASE_URL` | 你自己的 LLM Base URL | ❌ 需新增 |
| `LLM_MODEL` | 你自己的 LLM 模型名 | ❌ 需新增 |
| `TAVILY_API_KEY` | 搜索 API（推荐） | ❌ 需新增 |

---

## 第二部分：数据库设计

### 2.1 用户配额表 `user_quotas`

```sql
CREATE TABLE public.user_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  free_tikhub_used INTEGER NOT NULL DEFAULT 0,
  free_tikhub_limit INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- `free_tikhub_used`: 已使用的免费 TikHub 次数
- `free_tikhub_limit`: 免费次数上限（默认 1）

### 2.2 示例报告表 `sample_reports`

```sql
CREATE TABLE public.sample_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_id UUID NOT NULL REFERENCES validations(id) ON DELETE CASCADE,
  title TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 插入最新的 2 个报告作为示例
INSERT INTO sample_reports (validation_id, title, display_order) VALUES
  ('6ea1894d-3197-42de-affd-905a4d305a25', 'API 合规 SaaS 工具', 1),
  ('7310d708-8727-4591-a20b-d1687f8cc2ef', '投资组合收益计算器', 2);
```

### 2.3 数据库函数

```sql
-- 检查 TikHub 免费配额
CREATE FUNCTION check_tikhub_quota(p_user_id UUID)
RETURNS TABLE(can_use BOOLEAN, used INTEGER, total INTEGER);

-- 消耗一次免费配额
CREATE FUNCTION use_tikhub_quota(p_user_id UUID)
RETURNS VOID;
```

---

## 第三部分：后端 Edge Function 修改

### 3.1 修改 `validate-idea-stream/index.ts`

**核心逻辑变更：**

```
用户点击"开始验证"
        │
        ▼
┌───────────────────────────────────────────────────────┐
│ 1. LLM：使用系统 LLM_API_KEY（不再使用 Lovable AI）    │
│ 2. 搜索：使用系统 TAVILY_API_KEY                       │
│ 3. TikHub：检查配额                                   │
└───────────────────────────────────────────────────────┘
        │
        ├── 用户有自己的 TikHub Token ──▶ 使用用户的 Token
        │
        ▼ 没有
┌───────────────────┐
│ 检查免费配额       │
│ free_used < 1     │
└───────────────────┘
        │
        ├── 有剩余 ──▶ 使用系统 Token ──▶ 消耗配额 +1
        │
        ▼ 已用完
┌───────────────────────────────────────────────────────┐
│ 返回 402 错误：                                       │
│ "免费验证次数已用完。请在设置中配置 TikHub Token。"     │
└───────────────────────────────────────────────────────┘
```

**代码修改要点：**

```typescript
// 1. LLM 始终使用系统配置
const llmApiKey = Deno.env.get("LLM_API_KEY");
const llmBaseUrl = Deno.env.get("LLM_BASE_URL") || "https://api.openai.com/v1";
const llmModel = Deno.env.get("LLM_MODEL") || "gpt-4o";

// 2. 搜索始终使用系统配置
const tavilyKey = Deno.env.get("TAVILY_API_KEY");

// 3. TikHub 检查用户配置，没有则检查配额
const userTikhub = config?.tikhubToken;
if (!userTikhub) {
  const { data: quota } = await supabase.rpc('check_tikhub_quota', { p_user_id: user.id });
  if (!quota?.[0]?.can_use) {
    throw new ValidationError('FREE_QUOTA_EXCEEDED:免费验证次数已用完，请配置 TikHub Token');
  }
  // 使用系统 Token
  tikhubToken = Deno.env.get("TIKHUB_TOKEN");
}

// 验证成功后消耗配额
if (!userTikhub) {
  await supabase.rpc('use_tikhub_quota', { p_user_id: user.id });
}
```

### 3.2 新增 `get-sample-reports/index.ts`

获取示例报告的公开 API：

```typescript
// 获取所有激活的示例报告（无需登录）
const { data: samples } = await supabase
  .from('sample_reports')
  .select(`
    id, title, display_order,
    validations!inner (id, idea, overall_score, tags, created_at),
    validation_reports!inner (
      market_analysis, ai_analysis, dimensions, persona, sentiment_analysis
    )
  `)
  .eq('is_active', true)
  .order('display_order');
```

---

## 第四部分：前端修改

### 4.1 新增 `useUserQuota` Hook

```typescript
// src/hooks/useUserQuota.ts
export function useUserQuota() {
  const { user } = useAuth();
  const settings = useSettings();
  
  const { data: quota } = useQuery({
    queryKey: ['user-quota', user?.id],
    queryFn: () => supabase.rpc('check_tikhub_quota', { p_user_id: user!.id })
  });
  
  const hasOwnTikhub = !!settings.tikhubToken;
  
  return {
    freeRemaining: hasOwnTikhub ? Infinity : Math.max(0, 1 - (quota?.used || 0)),
    canValidate: hasOwnTikhub || (quota?.can_use ?? true),
    hasOwnTikhub
  };
}
```

### 4.2 修改 `Validate.tsx`

- 移除用户配置中的 `llmApiKey`、`searchKeys` 传递（后端不再使用）
- 添加配额用尽提示弹窗
- 显示剩余免费次数

### 4.3 新增示例报告组件

```typescript
// src/components/shared/SampleReports.tsx
// 在 History 页面顶部展示
<SampleReports />

// 卡片展示：
// - API 合规 SaaS 工具 (72分)
// - 投资组合收益计算器 (35分)
// 点击可查看完整报告
```

### 4.4 修改 `History.tsx`

在用户历史记录上方添加示例报告区域，区分"示例报告"和"我的报告"。

---

## 第五部分：文件变更清单

| 类型 | 文件路径 | 变更内容 |
|-----|---------|---------|
| **新增** | `src/hooks/useUserQuota.ts` | 配额查询 Hook |
| **新增** | `src/components/shared/SampleReports.tsx` | 示例报告展示 |
| **新增** | `src/components/shared/QuotaExhaustedDialog.tsx` | 配额用尽提示 |
| **新增** | `supabase/functions/get-sample-reports/index.ts` | 示例报告 API |
| **修改** | `supabase/functions/validate-idea-stream/index.ts` | 配额检查 + 使用系统 API |
| **修改** | `supabase/functions/validate-idea/index.ts` | 同上（非流式版本） |
| **修改** | `src/pages/Validate.tsx` | 配额 UI + 简化配置传递 |
| **修改** | `src/pages/History.tsx` | 添加示例报告区域 |
| **修改** | `src/hooks/useSettings.ts` | 可选：移除不再需要的字段 |

---

## 第六部分：实施顺序

```text
┌──────────────────────────────────────────────────────────────────┐
│  Phase 0: 配置 Secrets                                           │
│  - 添加 LLM_API_KEY, LLM_BASE_URL, LLM_MODEL                     │
│  - 添加 TAVILY_API_KEY（或 BOCHA_API_KEY）                        │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Phase 1: 数据库迁移                                              │
│  - 创建 user_quotas 表 + RLS                                      │
│  - 创建 sample_reports 表 + RLS                                   │
│  - 创建配额检查函数                                                │
│  - 插入示例报告数据                                                │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Phase 2: 后端 Edge Functions                                     │
│  - 修改 validate-idea-stream：使用系统 API + 配额检查              │
│  - 修改 validate-idea：同上                                       │
│  - 新增 get-sample-reports                                        │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Phase 3: 前端                                                    │
│  - useUserQuota Hook                                              │
│  - SampleReports 组件                                             │
│  - 修改 Validate.tsx（配额 UI）                                    │
│  - 修改 History.tsx（示例区域）                                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 第七部分：需要你确认的事项

1. **LLM API 配置**：你想用哪个 LLM 服务？
   - OpenAI（需要 API Key）
   - DeepSeek（需要 API Key）
   - 其他兼容 OpenAI 格式的服务

2. **搜索 API 配置**：你想用哪个搜索服务？
   - Tavily（推荐，中文结果较好）
   - Bocha AI
   - You.com

3. **示例报告选择**：当前选择的是最新的两个：
   - API 合规 SaaS 工具 (72分)
   - 投资组合收益计算器 (35分)
   
   你想用其他报告吗？

确认后我将开始实施。
