

# 「微型 AI 公司」闭环实现状态分析

## 当前已实现的部分

| 闭环步骤 | 状态 | 说明 |
|---------|------|------|
| 1. 用户输入主题和品牌 voice | 部分实现 | 用户可在验证页输入创业想法，报告数据会自动打包为上下文发送给 OpenClaw，但**没有独立的"品牌 voice"输入字段** |
| 2. OpenClaw 搜资料、抓引用、整理角度 | 已实现 | OpenClaw 可调用 `web_search` 工具联网搜索，`file_write` 保存调研结果 |
| 3. 产出长文并拆分多平台版本 | 未实现 | 当前只有小红书单平台文案生成，**没有"拆分为推特版、公众号版"的多平台产出流程** |
| 4. 用户审核、修改、批准 | 未实现 | Agent 输出后用户只能继续对话，**没有审核/修改/批准 UI**（如草稿编辑器、批准按钮） |
| 5. OpenClaw 分发或生成待发布草稿 | 部分实现 | 有 `xiaohongshu_publish` 工具调用能力，但**没有草稿管理系统、没有多渠道分发** |

## 需要新建的功能

### A. 内容工作流页面（核心缺失）
新建 `src/pages/ContentStudio.tsx`，包含：
- **输入面板**：主题 + 品牌 voice（语气、人设、关键词）表单
- **草稿列表**：展示 OpenClaw 生成的各平台版本草稿
- **编辑/审核面板**：用户可修改文案内容，点击"批准"或"重新生成"
- **分发状态**：显示各渠道发布状态

### B. 数据库：内容草稿表
新建 `content_drafts` 表：
- `id`, `user_id`, `topic`, `brand_voice`, `platform` (xiaohongshu/twitter/wechat), `title`, `body`, `images`, `status` (draft/approved/published), `openclaw_session_id`, `created_at`, `published_at`

### C. 多平台拆分 Prompt
在 `buildOpenClawContext.ts` 中新增 `content_pipeline` 任务类型，指令 Agent 一次性产出三个平台版本并通过 `file_write` 分别保存。

### D. 新增 Edge Function：保存草稿回调
`save-content-draft`：OpenClaw 产出结果后，前端解析并存入 `content_drafts` 表。

## 实施计划

| 文件 | 改动 |
|------|------|
| `src/pages/ContentStudio.tsx` | 新建，内容工作流页面（输入→生成→审核→分发） |
| `src/components/content/DraftEditor.tsx` | 新建，草稿编辑/审核组件 |
| `src/components/content/PlatformTabs.tsx` | 新建，多平台切换展示 |
| `src/hooks/useContentDrafts.ts` | 新建，草稿 CRUD hook |
| `src/lib/buildOpenClawContext.ts` | 新增 `content_pipeline` 任务 prompt |
| `src/App.tsx` | 添加 `/content-studio` 路由 |
| DB migration | 新建 `content_drafts` 表 + RLS |

**总计**：4 个新文件 + 2 个文件修改 + 1 个数据库迁移。

