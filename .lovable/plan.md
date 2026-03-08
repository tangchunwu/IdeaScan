

# 重新定位 Perplexity 在狩猎雷达中的角色

## 核心认知

| 能力 | Perplexity | 真实爬虫（TikHub） |
|------|-----------|-------------------|
| 小红书具体帖子 + 互动数据 | ❌ 不行 | ✅ |
| 公开网络趋势/痛点汇总 | ✅ 擅长 | ❌ 不擅长 |
| Reddit/知乎/论坛公开讨论 | ✅ 能搜到 | 需要分平台适配 |
| 行业报告/新闻/竞品动态 | ✅ 擅长 | ❌ |
| 实时搜索 + 来源引用 | ✅ 自带 citations | ❌ |

## 方案：双层架构

将 Hunter 分为两个互补的数据层：

### 第一层：Perplexity 趋势情报（新建）
**定位**：宏观市场情报 + 痛点聚合器

Perplexity 负责回答「某个领域目前有什么痛点和机会」，而非抓取具体帖子。

```text
用户输入关键词 "宠物智能用品"
        │
        ▼
Perplexity 搜索（perplexity-search 模型）
  Prompt: "搜索关于 {keyword} 的用户痛点、抱怨、未被满足的需求。
           从社交媒体、论坛、知乎、Reddit 等渠道汇总。
           重点关注：用户在抱怨什么？愿意为什么付费？现有方案有什么不足？"
        │
        ▼
返回结构化结果（JSON）：
  - 痛点摘要（非原文，是 AI 汇总）
  - 来源 URL（Perplexity 的 citations）
  - 话题标签
  - 机会评估
```

写入 `raw_market_signals` 时：
- `content` = AI 汇总的痛点描述（非原始帖子）
- `source` = "perplexity"（区别于 "xiaohongshu"）
- `source_url` = Perplexity 返回的 citation URL
- `likes_count` / `comments_count` = 0（无法获取）
- 由 `signal-processor` 进一步评分

### 第二层：TikHub 社媒爬虫（保留现有）
**定位**：微观数据验证

当用户在验证（Validate）流程中需要具体的小红书帖子数据时，仍使用 TikHub API。这部分已有完整实现。

## 具体实现

### 1. 新建 `hunter-scan` Edge Function

- 接收 `keywords[]`
- 每个关键词调用 Perplexity（使用现有 `PERPLEXITY_BASE_URL` + `PERPLEXITY_API_KEY`）
- Prompt 设计侧重于「汇总公开信息中的痛点和机会」，而非「抓取帖子」
- 结构化输出 5-8 条市场信号，每条含：摘要、来源URL、分类标签、机会评分
- 去重写入 `raw_market_signals`

### 2. 改造 `crawler-scheduler`
- 定时任务改为调用 Perplexity 搜索
- 移除对 TikHub token 的依赖（Hunter 不需要）

### 3. UI 调整
- 信号流中的 Perplexity 来源显示为"网络情报"而非某个平台
- 来源 URL 链接到 Perplexity 的 citation（可点击跳转原文）
- 明确标注数据类型是「AI 汇总情报」而非「原始帖子」

### 4. Secrets 配置
需添加两个 Secret：
- `PERPLEXITY_BASE_URL` = `https://perplexity.us.ci/v1`
- `PERPLEXITY_API_KEY` = 你的 token

## 效果对比

```text
之前的 Hunter 期望：
  "小红书帖子：我家猫用了XX智能喂食器总是卡粮..."  ← 需要爬虫

重新定位后的 Hunter：
  "AI 情报：宠物智能喂食器领域，用户普遍反映卡粮、
   WiFi 断连、APP 难用三大痛点。来源：知乎/Reddit/
   小红书公开讨论汇总。机会评分：85/100"  ← Perplexity 可以做到
```

这样 Perplexity 扮演的是「市场情报分析师」角色，而非「数据爬虫」角色。

