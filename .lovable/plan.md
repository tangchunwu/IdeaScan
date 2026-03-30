

# 修复管理面板三个问题

## 问题分析

1. **加载卡住** — `supabase.functions.invoke` 的 GET 请求实际返回了 `{"groups":{}}` (200)，但页面可能因为 `authLoading` 状态延迟导致 BrandLoader 停留过久。需要增加超时保护。

2. **已配置的模型未显示** — GET 返回 `groups: {}` 因为 DB 表是空的。虽然环境变量里已配置了 LLM/Perplexity/Image/Search 等密钥，但 UI 不展示它们。需要在 GET 返回时将环境变量中已有的配置作为"虚拟条目"返回，供管理员确认并一键导入。

3. **保存后同步到系统** — `config-resolver.ts` 有 5 分钟缓存，保存后不会立即生效。需要添加缓存清除机制。

## 方案

### 1. 修复加载状态

在 `ModelManager.tsx` 中：
- 给 auth 检查加 timeout，超过 5 秒自动跳出 loading
- 确保 `fetchData` 的 error 路径也能 `setLoading(false)`

### 2. Edge Function GET 返回环境变量预填条目

修改 `admin-api-config/index.ts` 的 GET 处理：
- 当某个 group 在 DB 中没有记录时，读取对应环境变量，构造"虚拟条目"（带 `_source: "env"` 标记）返回给前端
- 前端显示这些条目，带"来自环境变量"标签
- 管理员可以直接点"保存"将其持久化到 DB

具体映射：
- `llm` 组 → `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`
- `search_llm` 组 → `PERPLEXITY_BASE_URL`, `PERPLEXITY_API_KEY`, `PERPLEXITY_MODEL`
- `image` 组 → `IMAGE_GEN_BASE_URL`, `IMAGE_GEN_API_KEY`, `IMAGE_GEN_MODEL`
- `search_api` 组 → 分别为 `TAVILY_API_KEY`, `BOCHA_API_KEY`, `YOU_API_KEY` 各生成一条

### 3. 保存后清除缓存

修改 `admin-api-config/index.ts` 的 save/delete 处理：
- 保存或删除成功后，调用 `clearConfigCache()` 清除 `config-resolver` 的内存缓存
- 由于 Edge Functions 实例可能多个，将缓存 TTL 从 5 分钟降至 1 分钟

### 4. 前端 UI 增强

在 `ModelManager.tsx` 中：
- 环境变量来源的条目显示"环境变量"小标签
- 添加"一键导入全部"按钮，批量将环境变量条目保存到 DB
- 保存成功后显示"配置已生效"提示

## 涉及文件

| 文件 | 变更 |
|------|------|
| `supabase/functions/admin-api-config/index.ts` | GET 返回 env 虚拟条目；save 后清缓存 |
| `supabase/functions/_shared/config-resolver.ts` | 缓存 TTL 降至 1 分钟 |
| `src/pages/Admin/ModelManager.tsx` | 加载超时保护；env 来源标签；一键导入按钮 |

