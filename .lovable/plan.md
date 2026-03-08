

# OpenClaw + 验证报告深度联动：丰富上下文方案

## 问题

之前提议的 prompt 只传了 idea + score + 简单洞察，上下文太少。实际上报告里有非常丰富的数据：

- **维度评分**（需求痛感、PMF潜力、市场规模等 6+ 维度，每个都有分数和分析原因）
- **用户画像**（年龄、收入、痛点、目标、消费能力等）
- **情感分析**（正/负/中性占比，正面/负面关键词）
- **市场分析**（目标受众、市场规模、竞争程度、趋势方向）
- **AI 分析**（优势、劣势、建议、风险、盈利策略、品牌名建议）
- **竞品数据**（竞品名称、摘要）
- **真实样本**（小红书笔记标题、用户评论原文）
- **数据摘要**（痛点聚类、市场信号、跨平台共振）

## 方案

### 1. 新建 `src/lib/buildOpenClawContext.ts` — 上下文构建器

将 `useReportData` 的结果序列化为一份结构化的 Markdown 上下文文档，包含：

```text
# 验证报告摘要

## 创意: {idea}
综合得分: {score}/100 | 证据等级: {grade} | 标签: {tags}

## AI 综合判断
{overallVerdict}

## 维度评分
- 需求痛感: 78/100 — {reason}
- PMF潜力: 65/100 — {reason}
...

## 用户画像
姓名: {name} | 角色: {role} | 年龄: {age} | 收入: {income}
痛点: ...
目标: ...

## 市场分析
目标受众: ... | 市场规模: ... | 竞争程度: ... | 趋势: ...

## 情感分析
正面 {positive}% | 中性 {neutral}% | 负面 {negative}%
正面关键词: ... | 负面关键词: ...

## 优势与劣势
优势: ...
劣势: ...
风险: ...

## 盈利策略建议
...

## 真实用户声音（样本）
笔记: {title} — {snippet}
评论: {content}

## 竞品信息
{competitor title} — {snippet}
```

### 2. 修改 `src/pages/Report.tsx` — 添加「让 AI 写文案」按钮

在 ReportHeader 的操作按钮区域旁，增加一个按钮。点击后：
- 调用 `buildOpenClawContext(reportData)` 生成完整上下文
- 将上下文编码到 URL query 或存入 sessionStorage
- 导航到 `/openclaw?from_validation=xxx`

### 3. 修改 `src/pages/OpenClaw.tsx` — 接收验证上下文

- 检测 URL 参数 `from_validation`
- 从 sessionStorage 读取预构建的上下文
- 作为 `initialMessage` 传给 `OpenClawChannel`

### 4. 修改 `src/components/openclaw/OpenClawChannel.tsx`

- 增加 `initialMessage?: string` prop
- mount 后如有初始消息且连接就绪，自动发送
- 空状态增加快捷 prompt 模板卡片（写小红书文案、分析竞品、头脑风暴）

共新建 1 个文件，修改 3 个文件。上下文通过 sessionStorage 传递（避免 URL 过长），数据全部来自前端已有的 `useReportData`，无后端变更。

