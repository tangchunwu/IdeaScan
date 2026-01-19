# Product Design Spec: VC Circle (AI 创投圈)

## 1. 产品愿景 (Vision)
将枯燥的“商业验证报告”升级为一场**“沉浸式的创投模拟游戏”**。
用户不仅能看到冷冰冰的分数，还能直观感受到如果不改变策略，会被投资人如何“吊打”，或者被用户如何“吐槽”。
这是一种**情绪化的价值交付**，能显著提升用户的留存和分享意愿（因为对话内容往往很有趣/扎心）。

## 2. 核心功能 (Core Features)

### 2.1 混合模式 (Hybrid Experience)
保留现有的 **Dashboard (理性分析)**，作为“第一印象”。
在报告底部或新 Tab 增加 **VC Circle (感性互动)**，作为“深度体验”。

> **用户旅程**:
> 1. 提交 Idea -> 等待分析。
> 2. **看到 Dashboard**: 获得 85 分，看到雷达图，觉得很专业。
> 3. **下滑/切换**: 进入“创投圈”，发现几个 AI 大佬正在讨论自己的项目。
> 4. **参与互动**: 看到 AI 的质疑，忍不住点击“回复”进行辩论。

### 2.2 AI 角色矩阵 (Persona Matrix)
不仅仅是 "AI"，而是性格鲜明的具体角色：

| 角色名 (Name) | 身份 (Role) | 性格特征 (Personality) | 关注点 (Focus) | 口头禅 |
| :--- | :--- | :--- | :--- | :--- |
| **红杉老徐** | 顶级 VC 合伙人 | 犀利、看重赛道天花板、只投独角兽 | 市场规模、护城河 | "我看不到你的 10 倍增长逻辑。" |
| **产品阿强** | 资深 PM | 务实、细节控、关注落地 | MVP、用户体验、冷启动 | "需求是伪需求，场景太悬浮。" |
| **毒舌可可** | 只有 3 秒耐心的用户 | 挑剔、只在乎对自己有啥用、懒 | 易用性、价格、爽点 | "太麻烦了，虽然听起来不错但我不会下载。" |
| **行业分析师** | 懂王 | 喜欢引经据典、列数据、掉书袋 | 竞品对比、宏观趋势 | "这赛道已经是红海了，参考去年的..." |

### 2.3 互动机制 (Interaction)
*   **点赞/点踩**: 用户可以对 AI 的评论表态。
*   **回复对线**: 用户回复 AI 后，该 AI 必须根据用户的回复进行**上下文连续对话**。
    *   *User*: "其实我们有绝招..."
    *   *AI (红杉老徐)*: "哦？展开说说？如果真如你所说，那估值还能再谈。"
*   **围观**: AI 之间也会互相回复（例如产品经理反驳投资人的观点）。

## 3. 技术架构 (Technical Architecture)

### 3.1 数据库设计 (Supabase)
```sql
-- 角色表 (预置数据)
create table personas (
  id uuid primary key,
  name text,
  role text,
  avatar_url text,
  system_prompt text -- 核心：每个角色的独特人设 Prompt
);

-- 评论表 (支持无限层级回复)
create table comments (
  id uuid primary key,
  validation_id uuid references validations,
  persona_id uuid references personas, -- 如果是 AI 发的
  user_id uuid references users,       -- 如果是用户发的
  content text,
  parent_id uuid references comments,  -- 回复哪条评论
  likes_count int default 0,
  created_at timestamptz
);
```

### 3.2 AI 编排 (Orchestration)
不能只用一个 Prompt 生成所有内容。需要由 **Controller** 进行分发：
1.  **Initial Trigger**: 分析完成后，触发 `generate-discussion` Edge Function。
2.  **Role Selection**: 随机或固定选取 3-4 个角色。
3.  **Parallel Generation**: 并发调用 LLM，每个角色根据自己的 `system_prompt` 和 `report_data` 生成第一条评论。
4.  **Reply Trigger**: 当用户回复某条评论时，触发 `reply-discussion`，仅调用该角色的 LLM 进行多轮对话。

## 4. 界面设计 (UI/UX)
*   **参考对象**: 微信朋友圈、即刻 (Jike)、小红书评论区。
*   **视觉风格**: 
    *   即使是 AI，也要用真实的头像（可用 AI 生成的高质量人像）。
    *   点赞动画、回复气泡要流畅。
    *   **God Mode Badge**: 如果用户说服了毒舌 AI，获得“辩论鬼才”徽章。

## 5. 待确认事项 (Open Questions)
*   是否允许用户邀请真实朋友进来评论？（从单机游戏变成联机游戏）
*   AI 生成评论的 token 消耗控制（默认每人只发 1 条，还是自动盖楼？建议默认 1 条，用户触发后才继续）。
