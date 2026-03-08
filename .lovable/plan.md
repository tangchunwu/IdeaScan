

# 升级"立即扫描"为无关键词趋势发现

## 核心思路

用户点击按钮时，不传任何关键词，后端直接用 `sonar-reasoning` 做一次**纯趋势发现**——"现在全网最火的创业机会是什么"。

## 改动

### 1. 后端 `supabase/functions/hunter-scan/index.ts`

**a) 新增 `buildTrendDiscoveryPrompt()` 函数**

不依赖任何关键词输入，直接问 Perplexity：
- 过去一周全网最热的创业/产品话题
- 正在爆发的用户痛点
- 供需错配的新兴市场

要求返回 8-12 条信号，每条含 `summary`、`source_url`、`topic_tags`、`opportunity_score`、`pain_level`、`sentiment`、`trend_direction`（rising/emerging/declining）。

**b) 修改"无关键词"分支（第 163-179 行）**

当 `keywords.length === 0 && !hasDescription` 且无活跃 scan_jobs 时，不再返回空结果，而是调用 `searchWithPerplexity` 并使用趋势发现 prompt，模型切换为 `sonar-reasoning`。

**c) 处理 `<think>` 标签**

`sonar-reasoning` 返回内容含推理过程标签，JSON 解析前先剥离：
```
content.replace(/<think>[\s\S]*?<\/think>/g, "")
```

**d) 模型选择逻辑**

在 `searchWithPerplexity` 中增加 `model` 参数：
- 趋势发现模式 → `sonar-reasoning`
- 关键词/描述模式 → 保持 `sonar`（成本更低）

### 2. 前端 `src/components/discover/HunterSection.tsx`

- 按钮文案：`立即扫描` → `发现趋势`
- Toast 提示时间：`15-30秒` → `30-60秒`
- 结果为 0 时区分 quota exhausted vs 无新发现

### 3. 前端 `src/services/hunterService.ts`

`triggerHunterScan` 增加 `mode: "discover"` 参数传给后端，后端据此走趋势发现分支。

