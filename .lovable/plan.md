

# 项目问题修复计划

## 发现的问题

### 问题 1: CreateJobDialog React ref 警告
`CreateJobDialog` 组件在 `HunterSection.tsx` 第 231 行作为 JSX 直接渲染，但其内部根元素是 `<Dialog>`（来自 Radix UI），Radix 内部会尝试给子组件传递 ref。由于 `CreateJobDialog` 是普通函数组件，无法接收 ref，导致控制台警告。

**修复方案**: 不需要 forwardRef -- 实际上这个警告来自 Radix Dialog 内部机制，通常无害。但为了消除警告，可以用 `React.forwardRef` 包裹 `CreateJobDialog`。

### 问题 2: ScannerAuthDialog 硬编码 localhost 地址
`src/components/shared/ScannerAuthDialog.tsx` 中直接硬编码了 `http://127.0.0.1:8001`，在生产/预览环境中这些请求会直接失败（从网络日志中已可看到 `Failed to fetch` 错误）。

**修复方案**: 将 `ScannerAuthDialog` 改为使用 `invokeFunction` 统一调用层（该层已经包含了本地开发拦截和生产环境边缘函数调用逻辑）。

### 问题 3: invokeFunction.ts 本地拦截器误触发
`src/lib/invokeFunction.ts` 第 207 行的判断条件 `import.meta.env.DEV` 在 Lovable 预览环境中可能为 `true`，导致 crawler 相关请求被错误地路由到 `127.0.0.1:8001`，而该地址在云端不可达。

**修复方案**: 收紧本地开发判断条件，仅在 `window.location.hostname` 真正为 `localhost` 或 `127.0.0.1` 时才启用本地拦截，移除 `import.meta.env.DEV` 条件。

---

## 技术实施细节

### 文件 1: `src/lib/invokeFunction.ts` (第 207 行)

将:
```typescript
const isLocalDevelopment = import.meta.env.DEV || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
```
改为:
```typescript
const isLocalDevelopment = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
```

### 文件 2: `src/components/shared/ScannerAuthDialog.tsx`

将两处直接 `fetch("http://127.0.0.1:8001/...")` 替换为使用 `invokeFunction`：
- 第 40 行 `startAuthFlow` -> 调用 `invokeFunction("crawler-auth-start", { body: { platform: "xiaohongshu", user_id: userId } })`
- 第 69 行 轮询 -> 调用 `invokeFunction("crawler-auth-status", { body: { flow_id: flowId } })`

### 文件 3: `src/components/discover/HunterSection.tsx` (第 107 行)

用 `React.forwardRef` 包裹 `CreateJobDialog`，消除 Radix Dialog 的 ref 警告：
```typescript
const CreateJobDialog = React.forwardRef<HTMLDivElement, { onCreated: () => void }>(
  ({ onCreated }, ref) => {
    // ... existing logic
  }
);
CreateJobDialog.displayName = "CreateJobDialog";
```

