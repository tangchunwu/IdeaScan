

## 计划：改进支撑信号匹配与展示

### 问题分析

1. **匹配命中率低**：`getSignalsByKeyword` 使用 `.contains("topic_tags", [keyword])` 精确数组匹配。如果商机 keyword 是"AI电商"但信号标签是"AI"或"电商工具"，则无法匹配。
2. **信号卡片不可交互**：内容被截断到 120 字符，无法展开查看完整内容。
3. **来源链接缺失**：Perplexity 的引用 URL 存储在 `source_citation` 类型的子记录中（通过 `parent_signal_id` 关联），但 `RelatedSignals` 组件没有查询这些子记录。

### 改动方案

#### 1. 改进匹配逻辑 (`hunterService.ts`)

将 `getSignalsByKeyword` 改为模糊匹配策略：
- 先用 `ilike` 在 `content` 中搜索 keyword
- 同时用 `or` 条件在 `topic_tags` 中匹配
- 增加 limit 到 5 条，提高命中率

```typescript
// 用 or + ilike 替代 contains 精确匹配
.or(`content.ilike.%${keyword}%,topic_tags.cs.{${keyword}}`)
```

新增 `getCitationsForSignal(parentId)` 方法，查询 `content_type = 'source_citation'` 且 `parent_signal_id = parentId` 的记录，获取引用 URL。

#### 2. 信号卡片可展开 (`HunterSection.tsx` - `RelatedSignals`)

- 每条信号卡片添加展开/收起功能
- 收起时显示前 120 字，展开时显示完整内容
- 无 `source_url` 的信号，展开时显示更多上下文文本（最多 800 字）

#### 3. 显示引用来源链接

- 对每条 Perplexity 来源的信号，自动加载其关联的 `source_citation` 子记录
- 在信号卡片底部展示引用链接列表（域名 + 可点击外链）

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/services/hunterService.ts` | 改 `getSignalsByKeyword` 为模糊匹配；新增 `getCitationsForSignal` |
| `src/components/discover/HunterSection.tsx` | 重写 `RelatedSignals`：可展开信号卡片、加载引用链接 |

