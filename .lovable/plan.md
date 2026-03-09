

# IdeaScan 持续优化计划

## 发现的优化点

通过代码审查，识别出以下可改进领域：

### 1. HunterSection 数据请求迁移到 React Query

**现状**: `HunterSection.tsx`（626 行）中所有数据加载使用手动 `useEffect` + `useState`，不支持自动缓存、后台刷新和加载状态管理。项目其他页面（Discover、History、Gallery）已统一使用 `@tanstack/react-query`。

**改动**:
- `AdminMonitorTab`: 将 `loadData()` 和 `loadSchedulerConfig()` 分别改为 `useQuery`，key 如 `['hunter-admin-stats']`、`['hunter-scheduler-config']`
- `HunterSection` 主组件: 将 `refreshData()` 改为 `useQuery`，key 如 `['hunter-opportunities']`、`['hunter-scan-jobs']`
- 操作（toggle、delete）改用 `useMutation` + `queryClient.invalidateQueries`

| 文件 | 改动 |
|------|------|
| `src/components/discover/HunterSection.tsx` | 全面迁移到 React Query（约 40 行改动） |

### 2. HunterSection 组件拆分

**现状**: 单文件 626 行，包含 `OpportunityCard`、`CreateJobDialog`、`AdminMonitorTab`、`HunterSection` 四个组件。

**改动**: 将 `AdminMonitorTab` 抽取为独立文件，减少主文件体积至约 400 行。

| 文件 | 改动 |
|------|------|
| `src/components/discover/AdminMonitorTab.tsx` | 新建，从 HunterSection 提取（约 240 行） |
| `src/components/discover/HunterSection.tsx` | 导入 AdminMonitorTab，删除内联定义 |

### 3. perplexity-scheduler 并发优化

**现状**: `keywordsToScan` 逐个串行调用 `processKeyword`，每个之间还有 1.5 秒延迟。`MAX_DEEP_SCAN_PER_RUN = 2`，总延迟约 3 秒。

**改动**: 将 2 个关键词改为 `Promise.allSettled` 并发执行，去掉中间的 `setTimeout(1500)`，整体耗时减半。

| 文件 | 改动 |
|------|------|
| `supabase/functions/perplexity-scheduler/index.ts` | 将串行 for 循环改为 `Promise.allSettled`（约 15 行） |

### 4. 更新 plan.md 路线图

记录 Phase 10: 工程优化 的完成状态。

---

**总改动**: 1 个新文件 + 3 个文件修改，无数据库变更。

