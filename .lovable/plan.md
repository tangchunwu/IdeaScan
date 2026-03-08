

# 狩猎雷达功能优化

## 当前问题

1. **监控任务空状态太简陋** — 只有一行文字 "未配置监控任务"，缺乏引导
2. **监控任务列表功能不全** — 无法删除任务、无法暂停/恢复，缺乏操作性
3. **商机卡片信息重复** — 底部统计行和展开后的信息有重复（市场规模出现两次）
4. **整体交互偏弱** — 没有骨架屏加载、没有任务状态切换确认

## 改动计划

### 1. 监控任务空状态升级
将空白文字替换为引导型空状态卡片，包含图标、说明文案和一个直接打开 "新建监控" 对话框的按钮。

### 2. 监控任务列表增强
- 为每个任务添加 **暂停/恢复** 切换按钮（调用已有的 `toggleScanJob`）
- 添加 **删除** 功能（新增 `hunterService.deleteScanJob`）
- 显示 `last_run_at` 时间（如 "3小时前"）
- 改善卡片布局，移动端响应式优化

### 3. 商机卡片去重优化
- 移除底部统计行中与展开区域重复的 "市场规模" 信息
- 合并 `signal_count` 展示到一处

### 4. hunterService 新增删除方法

```typescript
async deleteScanJob(id: string): Promise<void> {
  const { error } = await fromTable("scan_jobs").delete().eq("id", id);
  if (error) throw error;
}
```

| 文件 | 改动 |
|------|------|
| `src/services/hunterService.ts` | 新增 `deleteScanJob` 方法 |
| `src/components/discover/HunterSection.tsx` | 空状态升级、任务列表增强、卡片去重 |

2 个文件改动，纯前端优化。

