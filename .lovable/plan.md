

# 代码质量检查与清理计划

## 发现的问题

### 1. 重复路由 (App.tsx)
- 第69-70行有两个相同的 `<Route path="*">` 通配符路由，应删除其中一个

### 2. 未使用的导入

| 文件 | 未使用导入 |
|------|-----------|
| `src/components/report/CompetitorTab.tsx` | `ArrowLeft` (line 1) — 从未在组件中使用 |
| `src/pages/Report.tsx` | `TrendingUp` (line 9) — 未在 JSX 中直接使用 |
| `src/pages/Report.tsx` | `Activity` (line 10) — 未在 JSX 中直接使用 |
| `src/pages/Gallery.tsx` | `TrendingUp` (line 8) — 未在 JSX 中使用 |
| `src/components/report/WeeklySummaryCard.tsx` | `BarChart3` (line 6) — 未在 JSX 中使用 |
| `src/pages/History.tsx` | `Filter`, `SortDesc` (line 21-22) — 未在 JSX 中使用 |

### 3. 冗余代码模式

| 文件 | 问题 |
|------|------|
| `src/pages/History.tsx` | 第327-330行有一个永远不会执行的 `isLoading` 条件分支（因为 line 158 已经处理了 loading 状态并提前 return） |
| `src/components/ui/toaster.tsx` | 空组件 no-op，可以移除整个文件（如果没有其他地方引用） |

### 4. 类型安全改进
- `CollaboratorPanel.tsx`, `ReportNotes.tsx` 大量使用 `as any` 类型断言访问数据库表（因为表未在 types.ts 中），这是 Phase 9 新建表的预期行为，暂不处理

### 5. 代码风格一致性
- `CompetitorMatrix.tsx` 中 `Math.random()` 用于散点图数据计算（line 41, 51），导致每次渲染位置不同，虽然有 `useMemo` 缓存但 deps 变化时会重新随机

---

## 清理计划

### Task 1: 删除重复路由
- `src/App.tsx` line 70: 删除重复的 `<Route path="*">` 

### Task 2: 清理未使用导入 (6 个文件)
- `CompetitorTab.tsx`: 移除 `ArrowLeft`
- `Report.tsx`: 移除 `TrendingUp`, `Activity`（如确认未用）
- `Gallery.tsx`: 移除 `TrendingUp`
- `WeeklySummaryCard.tsx`: 移除 `BarChart3`
- `History.tsx`: 移除 `Filter`, `SortDesc`

### Task 3: 移除冗余代码
- `History.tsx`: 删除 line 327-330 的无效 loading 分支
- 检查 `toaster.tsx` 的引用情况，如无引用则删除

### Task 4: 稳定散点图数据
- `CompetitorMatrix.tsx`: 将 `Math.random()` 替换为基于竞品名称的确定性哈希，避免重渲染时位置跳动

---

## 技术要点
- 所有更改均为纯清理，不影响功能
- 预计涉及 6-7 个文件的小幅编辑

