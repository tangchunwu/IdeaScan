

# OpenClaw 三项优化：UI 精简 + 技能打磨 + 上下文管理

## 问题分析

### 1. UI 太杂乱
空状态展示了 3 个分类 × 8 个技能卡片，视觉噪音大。用户打开页面看到一堆按钮，不知道从哪开始。

### 2. 部分技能未打磨
Growth Strategy / GTM Plan / Tech Architecture 三个新技能的 prompt 虽已完整，但缺乏门控确认机制（不像竞品分析有硬性 Step 1）。此外 `buildOpenClawContext.ts` 中的 `taskInstructions` 与 `openclawSkills.ts` 的 `systemPrompt` 存在重复——两套指令可能互相冲突。

### 3. 上下文会爆炸
当前逻辑有两个问题：
- **首次发送**：system_prompt（500-700行）+ report_context（可能 3000+ 字）+ 20条历史 → 轻松超过 8K tokens 的 system prompt
- **后续发送**：`activeSkill` 在首次发送后被清空，后续消息不再带 `system_prompt` 和 `report_context`，Edge Function 回退到默认 2 句话 prompt → **技能上下文丢失**
- report_context 每次都完整发送，即使 Agent 已经看过

---

## 方案

### 改动 1：简化空状态 UI

**文件**：`src/components/openclaw/OpenClawChannel.tsx`

将 3×8 技能网格替换为更简洁的设计：
- 顶部保留 3-4 个最常用的快捷按钮（横向一排，带简短描述）：**写 PRD**、**竞品分析**、**增长策略**、**写小红书**
- 下方添加一个"更多技能"展开按钮，点击后用 Collapsible 展示剩余技能
- 移除分类标题的占位空间，整体高度缩减 ~50%

```text
┌─────────────────────────────────┐
│      🤖 AI Agent 已就绪         │
│   选择快捷指令或直接下达任务      │
│                                 │
│  [写PRD] [竞品分析] [增长策略]   │  ← 主推 3 个
│                                 │
│  ▸ 更多技能                     │  ← 折叠
│    [GTM] [架构] [小红书] [营销图] │
└─────────────────────────────────┘
```

### 改动 2：统一技能指令来源，去除 buildOpenClawContext 中的重复

**文件**：`src/lib/buildOpenClawContext.ts`

`buildOpenClawPrompt()` 中的 `taskInstructions` 与 `openclawSkills.ts` 的 `systemPrompt` 高度重复。改为：
- `buildOpenClawContext()` 只负责序列化报告数据为 Markdown（保持不变）
- `buildOpenClawPrompt()` 不再维护自己的指令模板，改为直接从 `openclawSkills.ts` 取 `quickStart` 作为用户消息
- 避免两套指令打架

### 改动 3：上下文分层管理（核心改动）

**文件**：`supabase/functions/openclaw-chat/index.ts` + `src/hooks/useOpenClawChat.ts`

#### 3a. 持久化 session 上下文

在 Edge Function 中，将首次发送的 `system_prompt` 和 `report_context` 存入数据库（新增 `openclaw_sessions` 表或利用现有 session 记录），后续消息自动读取：

```sql
-- 新增列或表存储 session 级别的上下文
ALTER TABLE openclaw_sessions ADD COLUMN IF NOT EXISTS
  system_prompt TEXT,
  report_context_summary TEXT;  -- 存摘要而非全文
```

Edge Function 逻辑：
1. 收到 `system_prompt` → 存入 session 记录
2. 后续消息无 `system_prompt` → 从 session 记录读取
3. 保证整个对话期间技能上下文不丢失

#### 3b. report_context 摘要化

完整的验证报告可能 3000-5000 字。改为：
- 首次发送时，在 Edge Function 中将 `report_context` 压缩为关键摘要（~500字）：只保留综合得分、核心痛点、用户画像概要、竞品列表、关键市场信号
- 存储摘要版本到 session，后续消息引用摘要
- 前端 `buildOpenClawContext` 增加 `buildOpenClawContextSummary()` 方法，在前端侧完成压缩

#### 3c. 历史消息窗口控制

当前 Edge Function 加载 20 条历史。改为滑动窗口策略：
- 默认加载最近 10 条（而非 20 条）
- 如果有 system_prompt，计算 system_prompt 预估 token 数，动态调整历史条数（prompt 越长，历史越少）

### 改动 4：为新技能添加门控确认

**文件**：`src/lib/openclawSkills.ts`

为 Growth Strategy / GTM Plan / Tech Architecture 的 prompt 开头添加与 Competitive Analysis 类似的门控规则：

> ⚠️ 门控规则：Step 1 中的确认项必须全部完成后，才能进入后续分析阶段。

当前这三个技能的 Step 1 虽然列了确认问题，但没有明确的"必须逐一确认后才继续"指令。补充后 Agent 会更严格地走流程。

---

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/components/openclaw/OpenClawChannel.tsx` | 简化空状态 UI，折叠次要技能 |
| `src/lib/buildOpenClawContext.ts` | 新增 `buildOpenClawContextSummary()`，去除重复指令 |
| `src/lib/openclawSkills.ts` | 为 3 个新技能添加门控指令 |
| `src/hooks/useOpenClawChat.ts` | 发送 report_context 摘要而非全文 |
| `supabase/functions/openclaw-chat/index.ts` | 持久化 session 上下文，滑动窗口历史 |
| 数据库迁移 | `openclaw_sessions` 表新增 `system_prompt` + `report_context_summary` 列 |

