

# 当前状态总结 & Perplexity 语义搜索优化

## 已完成的部分

| 组件 | 状态 | 说明 |
|------|------|------|
| `hunter-scan` | ✅ | 手动扫描，写入 `raw_market_signals`，前端信号流可展示 |
| `perplexity-scheduler` | ✅ | 定时调度，写入 `raw_market_signals` + `trending_topics` |
| 前端 HunterSection | ✅ | 信号流、监控任务、仪表盘三个 Tab 均可展示数据 |
| 前端 HotTrends | ✅ | 从 `trending_topics` 读取，首页可展示热点 |
| 配额保护 + 去重 | ✅ | 每日 100 条上限，24h 关键词去重 |
| pg_cron 定时任务 | ✅ | 每 4h 运行 scheduler，每 12h 运行 trending 扫描 |

## 待优化：利用 Perplexity 的语义搜索能力

你说得对——Perplexity 不是关键词搜索引擎，它是**语义理解 + 实时网络检索**的大模型。目前的 prompt 还是在用"搜索关于 X 的痛点"这种简单模式，没有发挥它的真正优势。

### 优化方向

**1. 语义化查询升级**

当前 prompt 只是简单地把关键词塞进去："搜索关于`AI副业`的用户痛点"。应该改为**场景化、多角度的语义查询**：

- 不再只发一个"搜索 X 的痛点"，而是根据关键词动态生成**2-3 个不同角度的语义问题**
- 例如关键词"宠物洗澡"，生成：
  - "养宠物的人最近在社交媒体上抱怨什么？有什么产品让他们不满意？"
  - "宠物护理行业有哪些新兴的创业机会？用户愿意为什么付费？"
- 这样一个关键词可以挖掘出更丰富、更有深度的信号

**2. 监控任务也支持语义描述**

当前"新建监控"只支持输入关键词（如"宠物洗澡, 独立开发"）。应该同时支持**自然语言描述**：
- 用户可以输入："帮我关注 Z 世代消费者对美妆工具的不满"
- 或者："跟踪远程办公工具的用户流失原因"
- Perplexity 天然能理解这些语义查询

**3. signal-processor 自动触发**

当前 `niche_opportunities`（仪表盘的"潜力机会"）依赖手动触发 `signal-processor`。应该在 `perplexity-scheduler` 完成信号写入后自动调用，让机会发现也自动化。

### 涉及的文件变更

| 文件 | 变更 |
|------|------|
| `supabase/functions/perplexity-scheduler/index.ts` | Prompt 升级为多角度语义查询；完成后自动调用 signal-processor |
| `supabase/functions/hunter-scan/index.ts` | 同步升级 prompt；支持接收语义描述（不只是关键词） |
| `src/components/discover/HunterSection.tsx` | "新建监控"对话框增加语义描述输入框；信号卡片优化展示 |
| `src/services/hunterService.ts` | `createScanJob` 支持传入 description 字段 |
| `supabase/functions/signal-processor/index.ts` | 无需改动，被自动调用即可 |

### 不变的部分

- 验证流程（validate-idea）— 继续用 TikHub
- 数据库表结构 — 复用现有表
- 配额保护和去重逻辑 — 保持不变
- pg_cron 定时任务 — 保持不变

