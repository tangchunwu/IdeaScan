

# OpenClaw 图文混排适配优化

## 问题分析

当前 `renderMessageContent` 使用 `ReactMarkdown` 渲染，但存在以下不足：

1. **图片样式受限**：`prose-img:max-h-60` 固定高度，无法点击放大查看
2. **图片 URL 格式多样**：Agent 可能返回裸 URL（如 `https://...png`）、markdown 图片（`![](url)`）、或 base64 data URI，裸 URL 不会被 ReactMarkdown 渲染为图片
3. **图文间距不协调**：连续多张图片之间没有 gallery 布局，文字与图片之间的视觉节奏生硬
4. **流式渲染中图片闪烁**：streaming 阶段图片 URL 逐字符拼接，导致 `<img>` 反复加载失败

## 改动计划

### 1. 增强 `renderMessageContent`（主改动）

在 `OpenClawChannel.tsx` 中：

- **预处理裸图片 URL**：用正则将独立行的图片 URL（`.png/.jpg/.webp/.gif` 或 data:image）转为 markdown `![](url)` 格式，让 ReactMarkdown 正确渲染
- **自定义 ReactMarkdown `components.img`**：覆盖默认 `<img>` 渲染，添加：
  - 点击放大（Dialog 全屏查看）
  - 加载状态占位符（skeleton）
  - 加载失败 fallback
  - 多图时 grid 布局（检测连续 img 节点）
- **优化 prose 样式**：调整图片圆角、阴影、间距

### 2. 流式渲染防闪烁

在 streaming 阶段的 ReactMarkdown 中：
- 对不完整的图片 URL（未闭合的 `![](` 标记）进行过滤，避免渲染半截 URL 产生的 broken image
- 用简单正则检测未闭合的 markdown image 语法并截断

### 3. 图片预览弹窗

新增轻量的图片预览组件（使用已有的 Dialog），点击 assistant 消息中的图片可全屏查看。

| 文件 | 改动 |
|------|------|
| `src/components/openclaw/OpenClawChannel.tsx` | 增强 `renderMessageContent`：裸 URL 预处理、自定义 img 组件、流式防闪烁、图片预览弹窗（约 80 行新增/修改） |

**总计**：1 个文件修改，无数据库变更。

