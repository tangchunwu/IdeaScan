# 平台演进规划: 从验证器到"商业雷达" (Idea Discovery Roadmap)

## 1. 核心愿景 (Vision)

打造一个**全链路创业操作系统 (Startup OS)**。

* **过去**: 用户带着 Idea 来，我们验证它 (Passive Validator)。
* **未来**: 用户带着迷茫来，我们**发现机会** (Active Hunter)，验证它，通过 Skill 流量闭环实现它。

---

## 2. 模块化架构设计 (Modular Architecture)

### 模块 A: 狩猎雷达 (The Hunter) [新增核心]
>
> *"全网扫描，挖掘未被满足的需求"*

* **功能**: 24小时不间断爬取特定圈层（如“宝妈”、“独立开发者”、“跨境电商”）的讨论。
* **目标**: 建立**"潜在需求库"**。

### 模块 B: 验证引擎 (The Validator) [现有基础]
>
> *"深度分析，去伪存真"*

* **功能**: MVP 生成器、深度报告。
* **升级**: 调用模块 A 的数据作为证据支撑，不再每次临时爬取。

### 模块 C: 增长飞轮 (The Growth Pilot) [未来规划]
>
> *"自动引流，完成闭环"*

* **功能**: 利用最新的 Skill 机制，自动分发内容到各平台，为 MVP 导流。

---

## 3. 数据资产规划：构建"需求金矿" (The Data Asset)

这是我们最大的壁垒。所有爬虫数据不再是"用完即扔"，而是沉淀为公司资产。

### 3.1 核心数据表设计 (Schema Design)

#### `raw_market_signals` (原始信号表)

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `id` | uuid | 主键 |
| `source` | text | 来源 (xiaohongshu, reddit, twitter) |
| `content` | text | 评论/帖子原文 |
| `sentiment_score` | float | 情感负分 (越痛苦越好) |
| `scanned_at` | timestamp | 抓取时间 |
| `topic_tags` | jsonb | 自动打标 (e.g. ["saas", "payment", "complaint"]) |
| **`opportunity_score`** | float | **挖掘潜力分 (AI 计算)** |

#### `niche_opportunities` (利基机会表)

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `title` | text | 机会标题 (如 "小红书博主急需批量修图工具") |
| `signal_count` | int | 关联到的原始吐槽数量 (证据链) |
| `status` | text | 状态 (New, Validating, Ignored) |
| `market_size_est` | text | 预估市场规模 |

---

## 4. 实施阶段 (Phases)

### Phase 7: 数据基建 (Data Infrastructure)

- [ ] **Supabase**: 创建 `raw_market_signals` 表，开启 pgvector (向量搜索)。
* [ ] **Edge Function**:
  * `crawler-scheduler`: 定时任务 (Cron Job)，每小时扫描指定关键词。
  * `signal-processor`: 实时清洗数据，调用 AI 识别"吐槽"和"求助"。

### Phase 8: 猎手控制台 (Hunter Console)

- [ ] **Discovery Dashboard**: 一个类似 "Google Trends" 但专看"痛点"的仪表盘。
* [ ] **搜索/订阅**: 用户订阅 "宠物" 话题，每天早上收到 "昨日宠物圈最大的抱怨是洗脚机难用"。

### Phase 9: 智能匹配 (Auto-Match)

- [ ] 自动将 Phase 8 发现的 Opportunity，一键导入 Phase 6 的 MVP Generator，直接生成落地页进行测试。

---

## 5. 关键技术栈

- **Server**: Supabase (Postgres + pgvector)
* **Crawler**: Firecrawl / Tikhub (Server-side)
* **AI**: DeepSeek-V3 (用于高性价海量数据清洗)
* **Search**: Meilisearch (可选，如果百万级数据需要全文检索)
