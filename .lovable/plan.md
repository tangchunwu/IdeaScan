
# 验证流程优化计划：Jina Reader + 分层摘要 + 竞品提取 + 热门缓存

## 目标概览

本次优化将显著提升验证质量并降低成本：

| 优化项 | 预期效果 |
|-------|---------|
| Jina Reader 清洗 | Token 消耗降低 ~70%，噪音减少 |
| 分层摘要 | 分析质量提升，成本降低 ~50% |
| 竞品名提取 | 二次深度搜索，信息更精准 |
| 热门话题缓存 | 响应速度提升，重复验证免爬取 |

---

## 第一部分：架构设计

### 1.1 当前流程

```text
用户输入想法
      │
      ▼
┌─────────────────┐
│ 关键词扩展       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ 小红书/抖音爬取  │────▶│ 竞品搜索(3平台)  │
└────────┬────────┘     └────────┬────────┘
         │                        │
         └────────────┬───────────┘
                      ▼
              ┌───────────────┐
              │ 直接AI分析     │  ← 原始数据过大，token浪费
              └───────────────┘
```

### 1.2 优化后流程

```text
用户输入想法
      │
      ▼
┌─────────────────┐
│ 关键词扩展       │
└────────┬────────┘
         │
         ├── [缓存命中?] ──▶ 跳过爬取，直接使用缓存数据
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ 小红书/抖音爬取  │     │ 竞品搜索(3平台)  │
└────────┬────────┘     └────────┬────────┘
         │                        │
         │                        ▼
         │              ┌─────────────────────┐
         │              │ Jina Reader 清洗    │  ← 新增
         │              │ HTML → Markdown     │
         │              └────────┬────────────┘
         │                        │
         │                        ▼
         │              ┌─────────────────────┐
         │              │ 提取竞品名称        │  ← 新增
         │              │ (LLM轻量调用)       │
         │              └────────┬────────────┘
         │                        │
         │                        ▼
         │              ┌─────────────────────┐
         │              │ 二次深度搜索        │  ← 新增
         │              │ (针对具体竞品)      │
         │              └────────┬────────────┘
         │                        │
         └────────────┬───────────┘
                      ▼
          ┌───────────────────────┐
          │ 分层摘要 Layer 1      │  ← 新增
          │ 每条数据 150 词摘要   │
          └───────────┬───────────┘
                      ▼
          ┌───────────────────────┐
          │ 分层摘要 Layer 2      │  ← 新增
          │ 聚合摘要 (社媒+竞品)  │
          └───────────┬───────────┘
                      ▼
          ┌───────────────────────┐
          │ AI 深度分析           │
          │ (基于精炼数据)        │
          └───────────────────────┘
```

---

## 第二部分：Jina Reader 集成

### 2.1 技术说明

Jina Reader 是一个免费的网页转 Markdown 服务，能将复杂 HTML 转换为干净的 Markdown 格式。

**API 调用方式**：
- 端点: `https://r.jina.ai/{URL}`
- 无需 API Key（免费使用）
- 自动移除广告、导航栏、脚本等噪音

### 2.2 新增共享模块

**文件**: `supabase/functions/_shared/jina-reader.ts`

```typescript
// Jina Reader - 将网页转换为干净的 Markdown
export interface JinaResult {
  url: string;
  markdown: string;
  title: string;
  success: boolean;
}

export async function cleanWithJina(url: string): Promise<JinaResult> {
  try {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/markdown' }
    });
    
    if (!response.ok) return { url, markdown: '', title: '', success: false };
    
    const markdown = await response.text();
    const titleMatch = markdown.match(/^#\s+(.+)$/m);
    
    return {
      url,
      markdown: markdown.slice(0, 5000), // 限制长度
      title: titleMatch?.[1] || '',
      success: true
    };
  } catch (e) {
    console.error('[Jina] Error:', e);
    return { url, markdown: '', title: '', success: false };
  }
}

// 批量清洗竞品网页
export async function cleanCompetitorPages(
  urls: string[], 
  maxConcurrent = 3
): Promise<JinaResult[]> {
  const results: JinaResult[] = [];
  
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    const batch = urls.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(batch.map(cleanWithJina));
    results.push(...batchResults);
    
    // 速率限制
    if (i + maxConcurrent < urls.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  return results;
}
```

### 2.3 修改竞品搜索逻辑

**文件**: `supabase/functions/validate-idea-stream/index.ts`

在 `searchCompetitorsSimple` 函数后添加 Jina 清洗步骤：

```typescript
// 搜索竞品后，用 Jina 清洗页面内容
if (hasAnySearchKey) {
  await sendProgress('SEARCH');
  const rawCompetitors = await searchCompetitorsSimple(idea, searchKeys);
  
  // 新增: Jina Reader 清洗
  await sendProgress('CLEAN'); // 新增进度阶段
  const competitorUrls = rawCompetitors
    .filter(c => c.url)
    .slice(0, 8) // 最多清洗8个页面
    .map(c => c.url);
  
  const cleanedPages = await cleanCompetitorPages(competitorUrls);
  
  // 合并清洗后的内容
  competitorData = rawCompetitors.map(comp => {
    const cleaned = cleanedPages.find(p => p.url === comp.url);
    return {
      ...comp,
      cleanedContent: cleaned?.markdown || comp.snippet,
      hasCleanedContent: cleaned?.success || false
    };
  });
}
```

---

## 第三部分：分层摘要系统

### 3.1 摘要策略设计

**Layer 1**: 每条原始数据生成 150 词摘要
- 社媒帖子 → 提取核心痛点和需求
- 竞品页面 → 提取产品定位和定价

**Layer 2**: 聚合多条摘要为分析输入
- 社媒摘要 → 市场需求总结
- 竞品摘要 → 竞争格局总结

### 3.2 新增摘要模块

**文件**: `supabase/functions/_shared/summarizer.ts`

```typescript
// 分层摘要系统
export interface SummaryConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

// Layer 1: 单条数据摘要
export async function summarizeSingle(
  content: string,
  contentType: 'social_post' | 'competitor_page',
  config: SummaryConfig
): Promise<string> {
  const prompts = {
    social_post: `提取以下社媒帖子的核心信息，150字以内:
1. 用户表达的痛点或需求
2. 情感倾向 (正面/负面/中性)
3. 付费意愿信号 (如有)

内容: "${content.slice(0, 1000)}"

仅输出摘要，不要其他内容。`,

    competitor_page: `提取以下竞品页面的核心信息，150字以内:
1. 产品定位和目标用户
2. 核心功能/卖点
3. 定价策略 (如可见)

内容: "${content.slice(0, 2000)}"

仅输出摘要，不要其他内容。`
  };
  
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompts[contentType] }],
      temperature: 0.3,
      max_tokens: 300
    })
  });
  
  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

// Layer 2: 聚合摘要
export async function aggregateSummaries(
  socialSummaries: string[],
  competitorSummaries: string[],
  config: SummaryConfig
): Promise<{ marketInsight: string; competitiveInsight: string }> {
  const prompt = `基于以下数据，分别总结市场需求和竞争格局，各200字以内。

**社媒用户声音摘要**:
${socialSummaries.slice(0, 10).join('\n---\n')}

**竞品信息摘要**:
${competitorSummaries.slice(0, 5).join('\n---\n')}

输出JSON格式:
{
  "marketInsight": "市场需求总结...",
  "competitiveInsight": "竞争格局总结..."
}`;

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })
  });
  
  const data = await response.json();
  const content = data.choices[0]?.message?.content || '{}';
  
  try {
    return JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || '{}');
  } catch {
    return { marketInsight: '', competitiveInsight: '' };
  }
}
```

---

## 第四部分：竞品名称提取 + 二次搜索

### 4.1 设计说明

从第一轮搜索结果中用 LLM 提取具体竞品名称，然后进行二次精准搜索。

### 4.2 竞品提取函数

**文件**: `supabase/functions/_shared/competitor-extractor.ts`

```typescript
// 从搜索结果中提取竞品名称
export async function extractCompetitorNames(
  searchResults: { title: string; snippet: string }[],
  ideaContext: string,
  config: { apiKey: string; baseUrl: string; model: string }
): Promise<string[]> {
  const context = searchResults
    .slice(0, 10)
    .map(r => `- ${r.title}: ${r.snippet.slice(0, 200)}`)
    .join('\n');
  
  const prompt = `基于以下搜索结果，提取与"${ideaContext}"相关的具体竞品/产品/服务名称。

搜索结果:
${context}

要求:
1. 只提取具体的产品或公司名称
2. 不要泛化的描述
3. 最多5个

仅输出JSON数组: ["竞品1", "竞品2", ...]`;

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2
    })
  });
  
  const data = await response.json();
  const content = data.choices[0]?.message?.content || '[]';
  
  try {
    const names = JSON.parse(content.match(/\[[\s\S]*\]/)?.[0] || '[]');
    return names.filter((n: any) => typeof n === 'string' && n.length > 0).slice(0, 5);
  } catch {
    return [];
  }
}

// 基于竞品名称进行二次搜索
export async function searchCompetitorDetails(
  competitorNames: string[],
  searchKeys: { tavily?: string; bocha?: string; you?: string }
): Promise<any[]> {
  const results: any[] = [];
  
  for (const name of competitorNames.slice(0, 3)) {
    const query = `${name} 产品 定价 评价`;
    
    // 使用 Tavily 搜索 (优先)
    if (searchKeys.tavily) {
      try {
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: searchKeys.tavily,
            query,
            search_depth: "basic",
            max_results: 3
          })
        });
        
        if (res.ok) {
          const data = await res.json();
          results.push(...(data.results || []).map((r: any) => ({
            competitorName: name,
            title: r.title,
            url: r.url,
            snippet: r.content || "",
            source: "Tavily-Deep"
          })));
        }
      } catch (e) {
        console.error(`[DeepSearch] Error for ${name}:`, e);
      }
    }
    
    // 速率限制
    await new Promise(r => setTimeout(r, 300));
  }
  
  return results;
}
```

---

## 第五部分：热门话题缓存

### 5.1 设计说明

将用户频繁验证的行业/话题的基础数据缓存到 `trending_topics` 表，后续验证时优先使用缓存数据。

### 5.2 数据库修改

**迁移 SQL**:

```sql
-- 添加缓存相关字段到 trending_topics
ALTER TABLE public.trending_topics
ADD COLUMN IF NOT EXISTS cached_social_data JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS cached_competitor_data JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS cache_expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours'),
ADD COLUMN IF NOT EXISTS cache_hit_count INTEGER DEFAULT 0;

-- 创建缓存查询函数
CREATE OR REPLACE FUNCTION get_cached_topic_data(p_keyword TEXT)
RETURNS TABLE(
  topic_id UUID,
  cached_social_data JSONB,
  cached_competitor_data JSONB,
  is_valid BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.cached_social_data,
    t.cached_competitor_data,
    (t.cache_expires_at > now()) AS is_valid
  FROM public.trending_topics t
  WHERE 
    t.keyword ILIKE '%' || p_keyword || '%'
    AND t.is_active = true
  ORDER BY t.heat_score DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 更新缓存命中计数
CREATE OR REPLACE FUNCTION increment_cache_hit(p_topic_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.trending_topics
  SET cache_hit_count = cache_hit_count + 1
  WHERE id = p_topic_id;
END;
$$ LANGUAGE plpgsql;
```

### 5.3 缓存查询逻辑

**修改**: `validate-idea-stream/index.ts`

```typescript
// 在关键词扩展后，先检查缓存
await sendProgress('KEYWORDS');
const xhsKeywords = await expandKeywordsSimple(idea, tags, config);
const xhsSearchTerm = xhsKeywords[0] || idea.slice(0, 20);

// 新增: 检查热门话题缓存
let usedCache = false;
let cachedData: any = null;

const { data: cacheResult } = await supabase.rpc('get_cached_topic_data', {
  p_keyword: xhsSearchTerm
});

if (cacheResult?.[0]?.is_valid) {
  console.log('[Cache] Hit for keyword:', xhsSearchTerm);
  cachedData = cacheResult[0];
  usedCache = true;
  
  // 更新命中计数
  await supabase.rpc('increment_cache_hit', { 
    p_topic_id: cachedData.topic_id 
  });
}

// 如果有有效缓存，使用缓存数据
if (usedCache && cachedData) {
  socialData = cachedData.cached_social_data || socialData;
  competitorData = cachedData.cached_competitor_data || [];
  await sendProgress('CRAWL_DONE'); // 跳过爬取阶段
} else {
  // 正常爬取流程...
}
```

---

## 第六部分：完整流程整合

### 6.1 新增进度阶段

```typescript
const STAGES = {
  INIT: { progress: 5, message: '初始化验证...' },
  KEYWORDS: { progress: 10, message: '智能扩展关键词...' },
  CACHE_CHECK: { progress: 15, message: '检查缓存数据...' },  // 新增
  CRAWL_START: { progress: 20, message: '开始抓取社媒数据...' },
  CRAWL_XHS: { progress: 30, message: '抓取小红书数据...' },
  CRAWL_DY: { progress: 35, message: '抓取抖音数据...' },
  CRAWL_DONE: { progress: 40, message: '社媒数据抓取完成' },
  SEARCH: { progress: 50, message: '搜索竞品信息...' },
  JINA_CLEAN: { progress: 55, message: 'Jina清洗网页内容...' },  // 新增
  EXTRACT_COMPETITORS: { progress: 60, message: '提取竞品名称...' },  // 新增
  DEEP_SEARCH: { progress: 65, message: '二次深度搜索...' },  // 新增
  SUMMARIZE_L1: { progress: 72, message: '生成单条摘要...' },  // 新增
  SUMMARIZE_L2: { progress: 78, message: '聚合分析摘要...' },  // 新增
  ANALYZE: { progress: 88, message: 'AI深度分析中...' },
  SAVE: { progress: 95, message: '保存验证报告...' },
  COMPLETE: { progress: 100, message: '验证完成' },
};
```

### 6.2 主流程修改

**修改**: `supabase/functions/validate-idea-stream/index.ts`

主要变更点：
1. 在搜索后调用 Jina Reader 清洗
2. 从清洗后内容提取竞品名称
3. 执行二次深度搜索
4. 对社媒和竞品数据分别执行 Layer 1 摘要
5. 执行 Layer 2 聚合摘要
6. 将精炼数据传递给 AI 分析

---

## 第七部分：文件变更清单

| 类型 | 文件路径 | 变更内容 |
|-----|---------|---------|
| **新增** | `supabase/functions/_shared/jina-reader.ts` | Jina Reader 清洗模块 |
| **新增** | `supabase/functions/_shared/summarizer.ts` | 分层摘要系统 |
| **新增** | `supabase/functions/_shared/competitor-extractor.ts` | 竞品名称提取 + 二次搜索 |
| **修改** | `supabase/functions/validate-idea-stream/index.ts` | 整合新模块，优化流程 |
| **修改** | `supabase/functions/validate-idea/index.ts` | 同步更新（非流式版本） |
| **修改** | `supabase/migrations/` | 添加缓存相关字段和函数 |
| **修改** | `supabase/functions/scan-trending-topics/index.ts` | 更新缓存写入逻辑 |

---

## 第八部分：实施顺序

```text
┌──────────────────────────────────────────────────────────────────┐
│  Phase 1: 基础模块                                               │
│  - 创建 jina-reader.ts                                          │
│  - 创建 summarizer.ts                                           │
│  - 创建 competitor-extractor.ts                                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Phase 2: 数据库迁移                                              │
│  - 添加 trending_topics 缓存字段                                  │
│  - 创建缓存查询函数                                               │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Phase 3: 主流程整合                                              │
│  - 修改 validate-idea-stream/index.ts                            │
│  - 添加新的进度阶段                                               │
│  - 整合 Jina + 摘要 + 竞品提取                                    │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Phase 4: 缓存系统                                                │
│  - 添加缓存查询逻辑                                               │
│  - 修改 scan-trending-topics 写入缓存                             │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Phase 5: 测试验证                                                │
│  - 端到端测试完整流程                                             │
│  - 验证缓存命中逻辑                                               │
│  - 确认 Token 消耗降低                                            │
└──────────────────────────────────────────────────────────────────┘
```

---

## 第九部分：预期效果

| 指标 | 优化前 | 优化后 | 改善 |
|-----|-------|-------|-----|
| 单次验证 Token 消耗 | ~8000 | ~3000 | -62% |
| 竞品分析准确度 | 中等 | 高 | +50% |
| 热门话题响应时间 | 15-20s | 3-5s (缓存命中) | -75% |
| AI 分析输入质量 | 原始噪音多 | 精炼摘要 | 显著提升 |
