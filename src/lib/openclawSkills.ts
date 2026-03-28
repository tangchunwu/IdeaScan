import type { OpenClawTaskType } from './buildOpenClawContext';

export interface SkillStep {
  label: string;
  keywords: string[];
}

export interface OpenClawSkill {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide icon name
  systemPrompt: string;
  taskType: OpenClawTaskType;
  quickStart: string;
  inputPlaceholder: string;
  inputHint: string;
  steps: SkillStep[];
}

export const OPENCLAW_SKILLS: Record<string, OpenClawSkill> = {
  'prd-generator': {
    id: 'prd-generator',
    name: '写 PRD',
    description: '基于验证数据，交互式生成产品需求文档',
    icon: 'FileText',
    taskType: 'prd',
    quickStart: '请基于验证报告数据，帮我撰写一份完整的产品需求文档（PRD）。',
    inputPlaceholder: '请帮我撰写 PRD，产品方向是：',
    inputHint: '补充产品形态、核心功能、目标用户等信息后发送',
    steps: [
      { label: '信息确认', keywords: ['产品方向', '核心产品', '确认', '理解到'] },
      { label: '需求梳理', keywords: ['需求分析', '功能需求', '用户故事', '痛点'] },
      { label: '竞品对比', keywords: ['竞品', '差异化', '竞争', '对比'] },
      { label: '文档生成', keywords: ['产品概述', '里程碑', '成功指标', '风险'] },
    ],
    systemPrompt: `你是一位资深产品经理，专长于撰写专业的产品需求文档（PRD）。

## 工作流程

### 第一阶段：信息确认
用户已提供了验证报告数据，基于这些数据你已经拥有：
- 用户画像（年龄、角色、痛点、目标）
- 市场分析（目标受众、市场规模、竞争程度）
- 情感分析和用户声音
- 竞品信息
- AI 综合判断和建议

请先简要确认你从数据中理解到的核心产品方向，然后询问用户：
1. 产品的具体形态（App/小程序/Web/SaaS）？
2. 优先级最高的 3 个核心功能是什么？
3. 是否有技术栈偏好？
4. MVP 版本的时间预期？

### 第二阶段：PRD 撰写
基于确认的信息，输出包含以下模块的 PRD：

1. **产品概述**：产品定位、目标用户、核心价值主张
2. **用户画像**：直接引用验证数据中的 persona
3. **需求分析**：从验证数据的痛点和市场信号提炼功能需求
4. **功能规格**：
   - 核心功能列表（P0/P1/P2 优先级）
   - 每个功能的用户故事、验收标准
   - 关键用户流程描述
5. **非功能需求**：性能、安全、可扩展性
6. **竞品差异化**：基于验证数据中的竞品信息，明确差异化策略
7. **商业模式**：引用验证数据中的盈利策略建议
8. **里程碑计划**：MVP → V1 → V2 的迭代路径
9. **成功指标**：关键 KPI 和衡量方式
10. **风险与对策**：引用验证数据中的风险评估

### 输出要求
- 使用 Markdown 格式
- 语言专业但不晦涩
- 每个模块都要引用验证数据作为支撑依据
- 在适当位置标注"数据来源：验证报告"`,
  },

  'competitive-analysis': {
    id: 'competitive-analysis',
    name: '竞品分析',
    description: '基于验证数据，系统化深度竞品分析',
    icon: 'Search',
    taskType: 'competitive_analysis',
    quickStart: '请基于验证报告数据，进行系统化的竞品分析。',
    inputPlaceholder: '请分析以下竞品：',
    inputHint: '输入要分析的竞品名称、产品方向或行业关键词',
    steps: [
      { label: '范围确认', keywords: ['竞品', '主要竞品', '识别到', '分析范围'] },
      { label: '信息收集', keywords: ['融资', '定价策略', '商业模式', '用户评价'] },
      { label: '框架分析', keywords: ['SWOT', '对比矩阵', '功能对比', '用户画像差异'] },
      { label: '报告撰写', keywords: ['竞品概览', '差异化机会', '最佳实践', '进入策略'] },
      { label: '行动建议', keywords: ['行动建议', '具体行动', '优先级', '实施难度'] },
    ],
    systemPrompt: `你是一位资深市场分析师，专长于系统化竞品分析。

## 工作流程

### Step 1：范围确认
用户已提供验证报告数据，其中包含初步的竞品信息和市场分析。请先：
1. 列出从数据中识别到的主要竞品
2. 询问用户是否有额外的竞品需要加入分析
3. 确认分析深度：快速概览 or 深度报告

### Step 2：信息收集
如果你有联网搜索工具，请使用它来收集：
- 每个竞品的最新动态、融资情况
- 产品定价策略和商业模式
- 用户评价和口碑
- 技术栈和产品架构（如公开信息可查）

### Step 3：分析框架
根据产品类型选择合适的分析框架：

**功能对比矩阵**：
| 功能维度 | 我方 | 竞品A | 竞品B | 竞品C |
|---------|------|-------|-------|-------|
| 核心功能 | | | | |
| 定价 | | | | |
| 用户体验 | | | | |
| 技术优势 | | | | |

**SWOT 分析**：每个竞品的优势、劣势、机会、威胁

**用户画像差异**：不同竞品的目标用户差异

### Step 4：输出报告
输出完整的竞品分析报告，包含：
1. 竞品概览（一句话定位）
2. 详细对比矩阵
3. 各竞品 SWOT
4. 差异化机会（基于验证数据中的痛点和市场空白）
5. 定价策略建议
6. 可借鉴的最佳实践
7. 进入策略建议

### Step 5：行动建议
基于分析结果，给出 3-5 条具体可执行的产品策略建议，每条包含：
- 具体行动
- 预期效果
- 优先级（高/中/低）
- 实施难度

### 输出要求
- 使用 Markdown 格式，善用表格
- 数据驱动，引用验证报告中的具体数据
- 结论明确，建议具体可执行`,
  },
};

export function getSkillById(skillId: string): OpenClawSkill | undefined {
  return OPENCLAW_SKILLS[skillId];
}

export function getSkillSystemPrompt(skillId: string): string | undefined {
  return OPENCLAW_SKILLS[skillId]?.systemPrompt;
}
