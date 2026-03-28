

## 继续优化报告页 — 第二步

在已有的「左侧色条标题 + 百分比角标」基础上，继续温和借鉴参考图风格，提升报告页各子组件的视觉层次和一致性。

---

### 1. DataOverviewTab 内卡片标题统一使用 SectionHeading
- 将「内容类型分布」「关键指标」「数据质量评分」「跨平台强刚需」「用户痛点聚类」「市场信号」等标题替换为 `SectionHeading` 组件
- 统一 emoji + 色条风格，替代当前的 icon+文字标题

### 2. MarketInsightsTab 标题统一
- 将「目标用户画像」「情感分布」「正面评价要点」「负面评价要点」等标题替换为 `SectionHeading`
- 保持 emoji 语义：🎯目标用户、💬情感分布、👍正面、👎负面

### 3. AIAnalysisTab 标题统一
- 「核心投资亮点」→ SectionHeading(✅)、「关键风险与致命伤」→ SectionHeading(⚠️)、「战略路线图」→ SectionHeading(🗺️)
- 移除各卡片内部原有的 icon+text 标题，改为 SectionHeading 放在卡片内部或上方

### 4. RadarDimensionSection 添加 SectionHeading
- 在雷达图区域上方添加 `SectionHeading emoji="🕸️" title="维度评估"`
- 统一和其他 section 的视觉节奏

### 5. DemandDecisionCard 视觉微调
- 内部统计数字区块加上轻微的左侧色条装饰（复用 border-l-[3px] 风格）
- 「需求验证结论」标题改为 SectionHeading 风格

---

### 涉及文件（5个）

1. `src/components/report/DataOverviewTab.tsx` — 卡片标题替换为 SectionHeading
2. `src/components/report/MarketInsightsTab.tsx` — 标题统一
3. `src/components/report/AIAnalysisTab.tsx` — 标题统一
4. `src/components/report/RadarDimensionSection.tsx` — 添加 SectionHeading
5. `src/pages/Report.tsx` — RadarDimensionSection 上方加 SectionHeading

