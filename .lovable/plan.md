

## 诊断结果与改进计划

### 当前问题

数据库实际状态：
- `raw_market_signals`: 192 条信号，其中 **140 条 insight 未处理**（没有 `processed_at`）
- `niche_opportunities`: 仅 **1 条**（"适老化改造"）
- 原因：`signal-processor` 没有被自动触发，且聚合逻辑太粗糙（按第一个 tag 分组，要求 >=2 条才生成机会）

**核心瓶颈不是缺向量模型，而是管道断裂 + 聚合逻辑太弱。**

### 改进方案（分两步）

#### Step 1: 修复管道断裂 + 改进聚合

**`supabase/functions/hunter-scan/index.ts`**
- 扫描完成后自动调用 `signal-processor`，不再依赖手动触发

**`supabase/functions/signal-processor/index.ts`**
- 改进聚合逻辑：用 AI（Lovable AI）对高分信号做**语义聚类**，而非简单按 tag[0] 分组
- 流程：取最近 7 天高分信号 → 发给 AI 做主题聚类 → 生成/更新 `niche_opportunities`
- 这比 pgvector 轻量得多，效果立竿见影

#### Step 2（可选未来）: pgvector 向量检索

当信号量超过 1000+ 条时再考虑：
- 启用 pgvector 扩展，给 `raw_market_signals` 加 `embedding` 列
- 用 AI embedding API 生成向量
- 支持"语义相似搜索"（如：用户输入"宠物护理"能找到所有相关信号）

**当前阶段不需要，Step 1 就能解决"数据没用上"的问题。**

### 具体改动

| 文件 | 改动 |
|------|------|
| `signal-processor/index.ts` | 用 Lovable AI 做语义聚类生成机会，替代 tag 分组 |
| `hunter-scan/index.ts` | 扫描完成后自动 invoke `signal-processor` |

### 预期效果

- 140 条未处理信号将被 AI 评分 + 聚类
- `niche_opportunities` 预计从 1 条增长到 10-20 条高质量商机
- 每次 hunter-scan 后自动刷新商机列表

