

# 技能触发流程优化：输入引导 + 可视化进度 + 中断支持

## 问题

1. **无输入引导**：点击"竞品分析"直接发送预设 prompt，用户没机会指定分析什么竞品
2. **无可视化进度**：Agent 在后台工作时，用户只看到一个 spinner，不知道分析到哪一步了
3. **无法中断**：虽然有 `abort` 按钮（StopCircle），但没有"保留部分结果"的能力，也不够明显

## 方案

### 改动 1：技能触发改为"预填输入框 + 引导提示"

**文件** `src/components/openclaw/OpenClawChannel.tsx`

点击"写 PRD"或"竞品分析"不再直接 `sendMessage`，而是：
- 将技能 quickStart prompt 预填到输入框
- 在输入框上方显示一个技能引导条（skill banner），提示用户补充信息后再发送
- 例如点击"竞品分析"后，输入框预填：`请分析以下竞品：`，光标定位在末尾，用户补充竞品名称后按发送

`handleQuickPrompt` 逻辑改为：
```
// 对有 skillId 的技能，预填而非直接发送
if (skillId) {
  setActiveSkill(skillId);
  setInput(placeholder); // "请分析以下竞品："
  inputRef.focus();
  return;
}
```

新增状态 `activeSkill`，发送时自动带上 `skillId`。

### 改动 2：新增技能进度面板组件

**新文件** `src/components/openclaw/SkillProgressPanel.tsx`

当 `activeSkill` 存在且 `sending` 为 true 时，在聊天区域显示一个步骤进度面板（复用 `ValidationProgress` 的视觉风格）：

- PRD Generator 步骤：`信息确认 → 需求梳理 → 竞品对比 → 文档生成`
- 竞品分析步骤：`范围确认 → 信息收集 → 框架分析 → 报告撰写 → 行动建议`

进度通过解析 streaming 内容中的关键词/标记来推进（例如检测到"SWOT"出现就标记到"框架分析"阶段）。

组件包含取消按钮，调用 `abort()` 中断。

### 改动 3：技能定义新增步骤和输入引导

**文件** `src/lib/openclawSkills.ts`

每个技能新增：
- `inputPlaceholder`：预填到输入框的引导文字
- `inputHint`：引导条上的提示语（如"请输入要分析的竞品名称或产品方向"）
- `steps`：分析步骤列表，用于进度面板
- `stepKeywords`：每一步的关键词触发词，用于从 streaming 内容推断进度

### 改动 4：中断增强

**文件** `src/components/openclaw/OpenClawChannel.tsx`

技能模式下发送中，在输入区域上方显示明显的中断条：
- 显示当前步骤名
- "停止并保留当前内容"按钮
- 点击后调用 `abort()`，已接收的 streaming 内容保留为 assistant 消息

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/lib/openclawSkills.ts` | 新增 `inputPlaceholder`、`inputHint`、`steps`、`stepKeywords` |
| `src/components/openclaw/SkillProgressPanel.tsx` | **新建**，技能执行步骤进度面板 |
| `src/components/openclaw/OpenClawChannel.tsx` | 技能触发改预填、新增 `activeSkill` 状态、集成进度面板和中断条 |

