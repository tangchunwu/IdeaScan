

# 将 PRD 生成器 + 竞品分析技能集成到 OpenClaw，自动注入验证报告数据

## 核心思路

用户已经通过 IdeaScan 完成了需求验证（用户画像、市场分析、情感分析、竞品数据、痛点聚类等），这些数据应当自动作为 PRD 和竞品分析的**输入上下文**，避免 Agent 从零开始收集信息。

## 改动概览

### 1. 新建技能定义文件 `src/lib/openclawSkills.ts`

定义两个技能，每个包含：
- `id`、`name`、`icon`、`description`
- `systemPrompt`：从 GitHub SKILL.md 提炼，去掉 Claude Code 文件操作部分，保留分析框架和输出模板
- `contextRequired: true`：标记需要注入验证报告数据

**PRD Generator** 的 system prompt 核心：交互式 PRD 编写流程（信息收集→竞品研究→流程图→模块 review→输出文档），但预填验证报告中的用户画像、痛点、市场分析、竞品数据。

**Competitive Analysis** 的 system prompt 核心：Step 1 范围确认→Step 2 信息收集→Step 3 分析框架（PEST/KANO/SWOT）→Step 4 报告撰写→Step 5 行动建议，但预填已有的竞品数据和市场信号。

### 2. 更新快捷按钮 `OpenClawChannel.tsx`

在 `QUICK_PROMPTS` 中新增两个技能入口：
- **写 PRD** — 图标 `FileText`，发送时自动拼接验证报告上下文 + PRD 开场引导
- **竞品分析** — 图标 `Search`，发送时自动拼接验证报告上下文 + 竞品分析引导

需要新增 prop `reportContext?: string` 传入 `buildOpenClawContext` 的结果。如果当前页面没有关联的验证报告，则提示用户先选择一个报告。

### 3. 更新 `useOpenClawChat.ts`

`sendMessage` 新增可选参数 `skillId?: string`，在请求体中传递 `skill_id`。

### 4. 更新 Edge Function `openclaw-chat/index.ts`

- 接收 `skill_id` 字段
- 当 `skill_id` 存在时，用对应技能的 system prompt 替换默认的 `你是用户的 AI Agent 助手`
- 技能 prompt 中包含 `{{REPORT_CONTEXT}}` 占位符，由前端在 message 中自动拼接（与现有 `buildOpenClawPrompt` 模式一致）

### 5. 连接报告数据

在 `OpenClawChannel.tsx` 中，通过 URL 参数 `?validation_id=xxx` 或 OpenClaw 页面的 session 关联，加载对应的 `useReportData`，调用 `buildOpenClawContext` 生成上下文文本，在技能触发时自动拼接到用户消息中。

## 数据流

```text
用户点击"写 PRD"
  → buildOpenClawContext(reportData) 生成 Markdown 上下文
  → 拼接技能引导 prompt：
      "以下是我的产品验证数据：\n{context}\n---\n请基于以上数据开始 PRD 编写流程..."
  → sendMessage(prompt, undefined, undefined, 'prd-generator')
  → Edge Function 收到 skill_id='prd-generator'
  → 注入 PRD 专家 system prompt
  → Agent 已有完整数据，跳过大部分信息收集，直接开始结构化输出
```

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/lib/openclawSkills.ts` | **新建**，定义 PRD 和竞品分析的技能 prompt |
| `src/components/openclaw/OpenClawChannel.tsx` | 新增两个快捷按钮，支持加载验证报告上下文 |
| `src/hooks/useOpenClawChat.ts` | `sendMessage` 支持 `skillId` 参数 |
| `supabase/functions/openclaw-chat/index.ts` | 接收 `skill_id`，注入对应 system prompt |
| `src/lib/buildOpenClawContext.ts` | 新增 `prd` 和 `competitive_analysis` 两个 task type 的 prompt 模板 |

