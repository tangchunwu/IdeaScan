

# 管理员 API 配置中心

## 背景

系统有 **5 组外部 API** 分散在 Edge Functions 中通过 `Deno.env.get()` 读取，管理员无法通过 UI 统一查看和修改：

| 组 | 用途 | 密钥 |
|---|---|---|
| 主 LLM | 验证/分析/润色/信号处理 | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` |
| 搜索 LLM | 狩猎雷达/趋势发现 | `PERPLEXITY_BASE_URL`, `PERPLEXITY_API_KEY`, `PERPLEXITY_MODEL` |
| 图片生成 | AI 绘图 | `IMAGE_GEN_BASE_URL`, `IMAGE_GEN_API_KEY`, `IMAGE_GEN_MODEL` |
| 搜索引擎 | 网页搜索（Tavily/Bocha/You） | `TAVILY_API_KEY`, `BOCHA_API_KEY`, `YOU_API_KEY` |
| 兜底 | Lovable AI | `LOVABLE_API_KEY`（自动，只读） |

目前只能通过后台密钥手动设置，没有管理 UI。

## 方案

### 1. 新建数据库表 `admin_api_configs`

存储所有外部 API 配置，edge functions 优先从此表读取，fallback 到环境变量。

```sql
CREATE TABLE public.admin_api_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key TEXT UNIQUE NOT NULL,   -- e.g. 'LLM_BASE_URL'
  config_value TEXT NOT NULL DEFAULT '',
  config_group TEXT NOT NULL DEFAULT 'llm', -- llm | search_llm | image | search_api
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
ALTER TABLE public.admin_api_configs ENABLE ROW LEVEL SECURITY;
-- 仅 admin 可读写
CREATE POLICY "admin_read" ON public.admin_api_configs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_write" ON public.admin_api_configs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
```

### 2. 新建 Edge Function `admin-api-config`

- **GET**: 读取所有配置，API Key 值掩码返回（`sk-****xxxx`）
- **POST**: 保存配置（验证调用者是 admin）
- **POST /test**: 对指定组进行连通性测试（复用 `verify-config` 逻辑）
- 安全：通过 `has_role` RPC 验证 admin 身份

### 3. 新建共享模块 `_shared/config-resolver.ts`

提供 `resolveConfig(key: string)` 函数：
1. 先从 `admin_api_configs` 表查询
2. 若无记录则 fallback 到 `Deno.env.get(key)`
3. 带 5 分钟内存缓存避免每次查表

### 4. 更新所有 Edge Functions 使用 config-resolver

涉及的函数：
- `validate-idea-stream` — 主 LLM + 搜索引擎
- `signal-processor` — 主 LLM
- `hunter-scan` — Perplexity
- `polish-idea` — 主 LLM
- `suggest-keywords` — 主 LLM
- `verify-config` — 验证连通性
- `generate-persona-image` — 图片生成
- 其他使用 `LLM_*` 环境变量的函数

每个函数将 `Deno.env.get("LLM_API_KEY")` 替换为 `await resolveConfig("LLM_API_KEY")`。

### 5. 新建管理页面 `src/pages/Admin/ModelManager.tsx`

分 4 个卡片组，每组包含 Base URL / API Key / Model 输入框 + 测试按钮 + 保存按钮：

```text
┌─────────────────────────────────┐
│ 🧠 主 LLM（验证/分析/润色）      │
│  Base URL: [_______________]    │
│  API Key:  [****xxxx      ]    │
│  Model:    [_______________]    │
│  [测试连通性]  [保存]            │
├─────────────────────────────────┤
│ 🔍 搜索 LLM（Perplexity）       │
│  ...同上...                     │
├─────────────────────────────────┤
│ 🎨 图片生成                     │
│  ...同上...                     │
├─────────────────────────────────┤
│ 🌐 搜索引擎 API Keys            │
│  Tavily:  [****xxxx]           │
│  Bocha:   [****xxxx]           │
│  You:     [****xxxx]           │
│  [保存]                         │
├─────────────────────────────────┤
│ 🛡️ 兜底（Lovable AI）           │
│  状态: ✅ 已就绪（只读）          │
└─────────────────────────────────┘
```

- 使用 `useAdminAuth` 鉴权，非管理员重定向首页
- API Key 掩码显示，点击编辑时可输入新值
- 保存后自动刷新，测试按钮实时反馈连通状态

### 6. 注册路由

- `src/App.tsx`: 添加 `/admin/models` 路由
- `src/components/shared/Navbar.tsx`: 管理员菜单添加"API 配置"入口

## 安全设计

- 数据库 RLS 仅 admin 可读写
- Edge Function 内用 `has_role` 二次验证
- API Key 在数据库中明文存储（因为 edge function 需要读取原始值），但通过 RLS 限制只有 admin 能访问
- 前端展示全部掩码，仅编辑时可输入

