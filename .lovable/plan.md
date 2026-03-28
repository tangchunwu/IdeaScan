

## 温和借鉴「奶茶探险日志」风格 — 第一步

参考图中的设计亮点：章节标题带左侧色条 + emoji 图标、用户分层卡片带百分比角标、干净的圆角边框卡片。不大改，先做 3 个小优化过渡。

---

### 1. 章节标题组件 — 左侧色条装饰 (`SectionHeading.tsx`)
- 新建轻量组件：左侧 3px 圆角色条（primary 色）+ emoji + 标题文字
- 参考图中「用户分层结构」的样式：`border-left: 3px solid primary`
- 用于报告页各 section 标题（用户画像、数据概览等），替代现在的纯文字标题

### 2. MultiPersonaCard 百分比角标
- 参考图中卡片右上角的「20%」「50%」「30%」绿色角标
- 在每个 persona type tab 和卡片头部加一个小型百分比 Badge
- 根据 persona type 分配权重：primary=50%、secondary=30%、tertiary=20%
- Badge 样式：小圆角 + 绿色背景 + 白色文字，定位在卡片右上角

### 3. 报告页 section 间距与分隔优化 (`Report.tsx`)
- 各 section 之间添加轻微的虚线分隔或更大间距
- Tab 内容区顶部统一留白，视觉更透气

---

### 涉及文件（3个）

1. `src/components/report/SectionHeading.tsx` — 新建，左侧色条章节标题
2. `src/components/report/MultiPersonaCard.tsx` — 添加百分比角标
3. `src/pages/Report.tsx` — 引入 SectionHeading，优化 section 间距

