

# 完整集成原版 Skill 提示词

## 现状差距

对比 GitHub 原版 SKILL.md，当前实现大幅简化了 system prompt：

| 技能 | 原版行数 | 当前 prompt | 遗漏的关键内容 |
|------|---------|------------|--------------|
| PRD Generator | ~678 行 | ~40 行 | 8步协作流程、模块反馈/review机制、Mermaid流程图生成、内容质量标准（500字+背景）、异常场景模板、PRD Review清单、多种工作流模式（新产品/迭代/快速） |
| Competitive Analysis | ~194 行 | ~50 行 | 硬性门控（Step 1 必须确认才能继续）、单品拆解 vs 多品对比模式、快速/深度分析选择、3阶段信息收集流程、PEST/KANO/商业模式画布框架、行业适配指南、Mermaid图表规范、P0/P1/P2优先级建议 |

此外，Edge Function 中的 `SKILL_PROMPTS` 又进一步压缩到 2-3 句话，与前端 `openclawSkills.ts` 不同步。

## 方案

### 改动 1：升级 `src/lib/openclawSkills.ts` 的 system prompt

将两个技能的 `systemPrompt` 替换为接近原版的完整版本，但做以下适配：
- **去掉文件系统操作**（mkdir、touch、保存到文件等 Claude Code 特有操作）
- **去掉 references/ 文件引用**（frameworks.md、diagrams.md 等本地文件读取）
- **保留所有分析框架和模板**（PRD大纲、竞品对比矩阵、SWOT、KANO、PEST、商业模式画布）
- **保留输出格式规范**（Markdown结构、Mermaid语法、表格模板）
- **保留门控逻辑**（竞品分析 Step 1 必须确认后才能搜索）
- **融合验证报告上下文**：在 prompt 开头说明用户已有 IdeaScan 数据，Agent 应自动引用

**PRD Generator** 完整 prompt 将包含：
1. 理解产品项目（6个澄清问题）
2. 协作式信息收集（PRD大纲 checklist）
3. 竞品研究模板
4. Mermaid 功能流程图生成指令
5. 模块反馈/review 模板（做得好/改进建议/思考问题）
6. 内容生成规范（产品背景500字+、用户场景模板、异常场景表格）
7. 最终文档结构（完整 PRD 模板）
8. Review 清单（完整性/质量/可读性）

**Competitive Analysis** 完整 prompt 将包含：
1. 硬性门控 Step 1（分析模式/行业/分析对象/深度/聚焦维度 逐一确认）
2. 单品拆解 vs 多品对比的确认模板
3. 信息收集三阶段原则
4. 快速/深度对比的框架表格（PEST、KANO、SWOT、商业模式画布）
5. 报告撰写原则（数据说话、标注来源、未公开标注）
6. Mermaid 可视化规范
7. 行业适配指南表格
8. P0/P1/P2 行动建议格式

### 改动 2：同步 Edge Function 的 `SKILL_PROMPTS`

**文件** `supabase/functions/openclaw-chat/index.ts`

当前 Edge Function 中硬编码了简化版 prompt。改为：
- 保持 Edge Function 中的 prompt 作为 fallback（精简版）
- 前端在发送消息时，将完整 system prompt 通过请求体传递给 Edge Function（新增 `system_prompt` 字段）
- Edge Function 优先使用前端传来的 `system_prompt`，如无则用本地 fallback

这样前端 `openclawSkills.ts` 成为 prompt 的唯一维护点。

### 改动 3：前端传递完整 system prompt

**文件** `src/hooks/useOpenClawChat.ts`

`sendMessage` 在有 `skillId` 时，从 `getSkillSystemPrompt(skillId)` 获取完整 prompt，通过请求体的 `system_prompt` 字段发送。

### 改动 4：更新进度步骤关键词

**文件** `src/lib/openclawSkills.ts`

根据完整 prompt 的实际输出内容，更新 `steps` 和 `keywords`：

**PRD Generator**：
- 信息确认 → 需求收集 → 竞品研究 → 流程图生成 → 模块Review → 文档生成

**Competitive Analysis**：
- 范围确认 → 信息收集 → 框架分析 → 报告撰写 → 行动建议（不变，但 keywords 更精确）

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/lib/openclawSkills.ts` | 替换为完整版 system prompt，更新 steps/keywords |
| `src/hooks/useOpenClawChat.ts` | 发送时附带完整 system_prompt |
| `supabase/functions/openclaw-chat/index.ts` | 接收 `system_prompt` 字段，优先使用 |

