

# 问题分析

从截图和控制台日志看，有两个问题：

## 1. 图片加载失败（主要问题）
Agent 返回的图片 URL 可能不以 `.png/.jpg` 等扩展名结尾（如 API 生成的图片 URL 格式为 `https://api.example.com/images/abc123`），当前的正则 `IMAGE_URL_RE` 只匹配以图片扩展名结尾的 URL，导致裸 URL 无法被转换为 markdown 图片语法。另外，即使 Agent 返回了 `![](url)` 格式，URL 本身可能需要特殊处理（如跨域、过期等），导致 `onError` 触发显示了 `ImageOff` fallback。

## 2. React ref 警告
`ReactMarkdown` 的 `components.img` 映射到 `ChatImage`，但 ReactMarkdown 可能会尝试传递 ref，而 `ChatImage` 是普通函数组件未用 `forwardRef` 包裹。

## 修复计划

| 文件 | 改动 |
|------|------|
| `src/components/openclaw/OpenClawChannel.tsx` | 3 处修复 |

### 具体改动：
1. **放宽图片 URL 正则**：除了匹配扩展名结尾的 URL，还匹配常见图片服务域名模式（如含 `image`、`img`、`pic` 路径的 URL），以及 Agent 输出中 markdown 图片语法内不带扩展名的 URL
2. **图片加载失败时显示原始 URL 链接**：不只显示 `ImageOff` 图标，还提供可点击的链接让用户在新标签页打开查看
3. **用 `forwardRef` 包裹 `ChatImage`**：消除 React ref 警告

