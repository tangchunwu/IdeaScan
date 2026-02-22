

# 优化四个 AI Agent 的能力

## 当前问题

1. **System Prompt 太笼统**：每个角色只有简单的性格描述，缺乏具体的评估框架和行为指令
2. **上下文信息不足**：只传了 idea、tags、overall_score 和截断的 market/ai_analysis（各 500 字符），大量有价值的报告数据（dimensions 维度分数、sentiment 情绪分析、competitor 竞品、strengths/weaknesses/risks 等）完全没有利用
3. **max_tokens 太小**：初始评论 200 tokens、回复 150 tokens，导致角色无法充分展开观点
4. **回复缺乏深度**：reply-to-comment 的 prompt 过于简单，没有要求角色基于报告数据进行有针对性的反驳或认可

## 修改方案

### 1. 升级数据库中的 System Prompt（4 条 UPDATE）

为每个角色设计更丰富的人设 prompt，包含：评估框架、语言风格指令、口头禅、具体行为规则。

**红杉老徐（VC 合伙人）**：
- 增加评估框架：TAM/SAM/SOM、护城河分析、10 倍增长逻辑
- 要求引用具体维度分数来支撑观点
- 加入口头禅和语气词（"说实话"、"坦率讲"）
- 增加条件逻辑：高分项目要挑刺、低分项目要说为什么不投

**产品阿强（产品经理）**：
- 增加 MVP 落地框架：冷启动策略、核心功能拆解、用户路径
- 要求给出具体的产品建议而非泛泛而谈
- 引用竞品数据进行对比
- 加入产品思维的专业术语

**毒舌可可（用户代表）**：
- 增加用户视角的具体场景模拟：第一次打开、付费决策、分享动机
- 要求用生活化的比喻和吐槽
- 加入情绪化表达和网络用语
- 根据情感分析数据（positive/negative）调整吐槽力度

**行业老王（分析师）**：
- 增加数据引用框架：要求引用维度分数、竞争格局、趋势方向
- 加入行业类比和案例引用的指令
- 要求给出量化的市场判断
- 引用 sentiment 数据作为论据

### 2. 升级 generate-discussion 的 Context Prompt

当前只传了 idea + tags + score + 截断的 market/ai analysis。改为：

- 传入完整的 **dimensions**（6 个维度分数）
- 传入 **ai_analysis** 的 strengths/weaknesses/risks/suggestions
- 传入 **sentiment_analysis** 的正面/负面/中性比例及 topPositive/topNegative
- 传入 **competitor_data** 摘要
- 传入 **market_analysis** 的完整字段（targetAudience、competitionLevel、trendDirection）

为每个角色定制不同的 context prompt 侧重点：
- 红杉老徐：重点看 dimensions（市场需求、盈利潜力）+ risks + competitionLevel
- 产品阿强：重点看 suggestions + strengths/weaknesses + targetAudience
- 毒舌可可：重点看 sentiment（topPositive/topNegative）+ dimensions（可行性）
- 行业老王：重点看 competitor_data + market_analysis + dimensions 全貌

### 3. 升级 reply-to-comment 的回复质量

当前回复 prompt 太简单（"如果用户提出好观点就认可，否则追问"）。改为：

- 要求角色引用具体报告数据来反驳或支持用户观点
- 根据角色特性给出不同的回复策略
- 增加"态度转变"机制：如果用户连续 3 轮都提出有力论据，角色可以被"说服"
- 增加跨角色互动提示：AI 回复时可以提及其他角色的观点

### 4. 调整 Token 限制

- 初始评论：200 -> 400 tokens（让角色能充分展开）
- 回复：150 -> 250 tokens（让对话更有深度）

---

## 技术实施细节

### 文件 1: 数据库 Migration - 更新 personas 表的 system_prompt

4 条 UPDATE 语句，每个角色一条，更新 `system_prompt` 字段为更详细的人设。

### 文件 2: `supabase/functions/generate-discussion/index.ts`

1. 修改 `ValidationData` interface，增加更多字段：
```typescript
interface ValidationData {
  idea: string;
  tags: string[];
  overall_score: number;
  dimensions?: Array<{ dimension: string; score: number }>;
  report?: {
    market_analysis?: {
      targetAudience?: string;
      competitionLevel?: string;
      trendDirection?: string;
      marketSize?: string;
      keywords?: string[];
    };
    ai_analysis?: {
      strengths?: string[];
      weaknesses?: string[];
      risks?: string[];
      suggestions?: string[];
      feasibilityScore?: number;
    };
    sentiment_analysis?: {
      positive?: number;
      negative?: number;
      neutral?: number;
      topPositive?: string[];
      topNegative?: string[];
    };
    competitor_data?: Array<{ title: string; snippet: string }>;
  };
}
```

2. 修改 `generatePersonaComment` 函数，根据 persona.role 构建不同侧重点的 context prompt

3. 将 `max_tokens` 从 200 提升到 400

4. 在 `validationData` 组装时，加入 dimensions 和更完整的 report 数据

### 文件 3: `supabase/functions/reply-to-comment/index.ts`

1. 在生成 AI 回复时，也查询 validation_reports 获取报告数据
2. 升级 prompt，要求引用数据、保持角色深度
3. 将 `max_tokens` 从 150 提升到 250
4. 增加对话轮次感知（通过 conversationHistory 长度判断是否应该态度软化）

