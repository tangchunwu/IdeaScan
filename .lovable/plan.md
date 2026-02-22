

# 爬虫配置权限分离与 TikHub 自动降级

## 当前问题

1. **`CRAWLER_SERVICE_BASE_URL` 和 `CRAWLER_SERVICE_TOKEN` 未配置为 Edge Function 密钥**，导致所有爬虫相关功能（扫码、health check）返回 "Crawler service disabled"
2. **所有用户都能看到爬虫管理配置**（自爬开关、TikHub Token、采集策略等），普通用户会困惑
3. **验证流程在自爬不可用时报错**，而不是自动降级到 TikHub

## 修改方案

### 1. 配置爬虫服务密钥

需要添加两个 Edge Function 密钥：
- `CRAWLER_SERVICE_BASE_URL` -- 你的爬虫服务公网域名（例如 `https://cenima.us.ci`）
- `CRAWLER_SERVICE_TOKEN` -- 爬虫服务的认证 token（如果有的话）
- `CRAWLER_CALLBACK_SECRET` -- 回调签名密钥（如果有的话）

这些密钥配置后，所有 crawler 相关 Edge Function（health、auth-start、auth-status 等）就能正常连接你本地的爬虫服务。

### 2. SettingsDialog 按角色分区显示

在 `src/components/shared/SettingsDialog.tsx` 中引入 `useAdminAuth`：

**管理员可见（全部）：**
- LLM 配置、TikHub Token、爬虫健康状态、已授权会话、采集策略开关、平台选择、搜索引擎、图片生成、导入导出

**普通用户可见：**
- LLM 配置
- 扫码登录（小红书/抖音扫码按钮 + QR 码区域）-- 按钮不再依赖 `crawlerHealth?.healthy` 来禁用
- 平台选择（小红书/抖音开关）
- 搜索引擎配置
- 图片生成配置
- 导入导出

**普通用户隐藏：**
- TikHub Token 输入框
- 爬虫健康状态显示
- 已授权会话列表
- 采集执行策略开关（自爬/TikHub 兜底）

### 3. 后端验证逻辑：自爬不可用时自动降级

修改 `supabase/functions/validate-idea-stream/index.ts`：

- 检测 `CRAWLER_SERVICE_BASE_URL` 是否配置，判断自爬是否真正可用
- 自爬不可用时自动启用 TikHub 兜底，优先使用环境变量 `TIKHUB_TOKEN`
- 只有自爬和 TikHub 都不可用时才报错

---

## 技术实施细节

### 步骤 1：添加密钥

使用 `add_secret` 工具请求用户输入：
- `CRAWLER_SERVICE_BASE_URL`（爬虫服务的公网 HTTPS 域名）
- `CRAWLER_SERVICE_TOKEN`（可选，爬虫服务认证 token）
- `CRAWLER_CALLBACK_SECRET`（可选，回调签名密钥）

### 步骤 2：修改 `src/components/shared/SettingsDialog.tsx`

1. 添加 `import { useAdminAuth } from "@/hooks/useAdminAuth";`
2. 组件内获取 `const { isAdmin } = useAdminAuth();`
3. 用 `{isAdmin && (...)}` 包裹：
   - TikHub Token 区域（第 1123-1142 行）
   - 爬虫健康状态（第 1146-1158 行）
   - 已授权会话列表（第 1233-1274 行）
   - 采集执行策略开关区域（第 1277-1307 行）
4. 扫码按钮区域（第 1159-1232 行）保留给所有用户，移除 `disabled={!crawlerHealth?.healthy}` 限制（改为仅在 `isAuthStarting` 时 disabled）

### 步骤 3：修改 `supabase/functions/validate-idea-stream/index.ts`

修改第 868-882 行和第 931-933 行以及第 1108-1111 行：

```typescript
// 第 868-882 行区域，增加自动降级逻辑
const crawlerServiceUrl = (Deno.env.get("CRAWLER_SERVICE_BASE_URL") || "").trim();
const selfCrawlerAvailable = enableSelfCrawler && !!crawlerServiceUrl;
const effectiveEnableTikhubFallback = enableTikhubFallback || !selfCrawlerAvailable;

const userProvidedTikhub = effectiveEnableTikhubFallback && !!config?.tikhubToken;
let tikhubToken = config?.tikhubToken || undefined;

if (effectiveEnableTikhubFallback && !userProvidedTikhub && !usedCache) {
  tikhubToken = Deno.env.get("TIKHUB_TOKEN");
}
```

```typescript
// 第 931-933 行，移除硬性报错
if (!usedCache && (enableXhs || enableDy) && !selfCrawlerAvailable && !effectiveEnableTikhubFallback && !tikhubToken) {
  throw new ValidationError("DATA_SOURCE_DISABLED:...");
}
```

```typescript
// 第 942 行
const shouldAttemptSelfCrawler = selfCrawlerAvailable;
```

```typescript
// 第 1108-1111 行，改为使用 effectiveEnableTikhubFallback
if (!usedSelfCrawler && effectiveEnableTikhubFallback) {
  if (!tikhubToken) {
    // 自爬不可用且无 TikHub token，给出友好提示
    throw new ValidationError("DATA_SOURCE_UNAVAILABLE:自爬服务未连接且未配置 TikHub Token。请联系管理员或在设置中配置 Token。");
  }
  // ... 继续 TikHub 兜底流程
}
```

