

# 项目优化计划：用户体验 & 功能完善

## 一、用户体验优化

### 1. History 页面：删除确认对话框
当前单条/批量删除没有二次确认，容易误操作。添加 AlertDialog 确认弹窗。

| 文件 | 改动 |
|------|------|
| `src/pages/History.tsx` | 删除操作前弹出 AlertDialog 确认，支持单条和批量两种场景 |

### 2. Report 页面：Tab 切换记忆
当前切换 Tab 后刷新页面会重置为 overview。将 activeTab 同步到 URL hash（如 `#market`），刷新后保留上次查看的 Tab。

| 文件 | 改动 |
|------|------|
| `src/pages/Report.tsx` | 从 `location.hash` 初始化 activeTab，切换时更新 hash |

### 3. Validate 页面：提交按钮防抖 & 键盘提交
- 空表单时 Enter 键无法提交（已有），但 Textarea 的 Enter 是换行。添加 `Ctrl/Cmd + Enter` 快捷键触发验证。
- 提交后清除 localStorage 草稿。

| 文件 | 改动 |
|------|------|
| `src/pages/Validate.tsx` | 添加 `Ctrl+Enter` 提交、验证开始后清除草稿 |

### 4. Gallery 页面：加载骨架屏优化
当前 Gallery 加载时显示 LoadingSpinner，改为与 History 一致的骨架屏卡片，减少布局跳动。

| 文件 | 改动 |
|------|------|
| `src/pages/Gallery.tsx` | 替换 LoadingSpinner 为骨架屏卡片网格 |

## 二、功能完善

### 5. Report 分享链接：复制成功后显示预览
当前复制链接后只有 toast 提示。改为短暂显示分享链接预览，方便用户确认。

| 文件 | 改动 |
|------|------|
| `src/pages/Report.tsx` | 分享 toast 中展示可点击的分享链接 |

### 6. History 页面：状态筛选
当前只有评分筛选，缺少按验证状态（已完成/分析中/失败）筛选。在现有筛选下拉旁添加状态筛选。

| 文件 | 改动 |
|------|------|
| `src/pages/History.tsx` | 添加 status filter select，支持 all/completed/processing/failed |

---

**涉及文件**: 4 个前端文件，无数据库改动。全部为 UI/交互层优化。

