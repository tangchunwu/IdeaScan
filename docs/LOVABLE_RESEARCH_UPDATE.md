# Lovable 更新说明：需求验证与商机雷达

本次 GitHub `main` 包含前端、数据库迁移、三个后台函数及其共享模块。代码同步不代表数据库和函数已经部署，请按以下顺序更新。

## 可复制到 Lovable 的任务

```text
请同步 IdeaScan GitHub 仓库 main 分支的最新代码，并发布本次需求验证与商机雷达优化。

按顺序执行：

1. 核对已执行的 Supabase migration 版本，仅应用尚未执行的这两份迁移，保持原文件内容和顺序：
   supabase/migrations/20261104090000_add_research_sessions.sql
   supabase/migrations/20261104091000_validation_run_writes.sql

2. 核对数据库中 research_sessions 表已启用 RLS，并且普通账号只能访问自己的研究；
   validations.active_run_id 字段、write_validation_run_report 函数存在；
   写报告函数仅允许 service_role 执行，不向普通用户或匿名用户开放。

3. 重新部署以下三个 Supabase Edge Functions，并携带仓库中的最新 _shared 模块：
   validate-idea-stream
   cancel-validation
   opportunity-discover

4. 重新部署以下旧出口函数，避免它们继续把 incomplete/legacy 报告当成可排名分数：
   get-shared-report
   re-analyze-validation
   discover-topics
   generate-discussion
   weekly-digest

5. 构建并发布已同步的前端，不使用旧构建产物。

6. 使用登录账号做最小验收：
   - 商机雷达能选择机会类型、目标国家和研究语言。
   - 能保存研究，刷新后重新打开，查看原文与候选对比。
   - 能从保存的候选进入验证，保留市场、平台和研究引用，不自动开始计费研究。
   - 需求报告展示支持、反证、未知和下一步实验；模型失败不生成默认评分、情感或趋势。
   - 取消后可以保留原文并继续分析，旧任务不能覆盖新一轮结果。
   - 第二个账号无法读取第一个账号的研究记录。

现有生产密钥继续通过服务端配置和用户设置使用，不把密钥写入仓库、聊天、URL 或研究档案。
完成后报告两份迁移的执行状态、三个函数的部署状态及前端发布结果；未完成项请明确指出。
```

## 参考证据

代码交付前已完成 312 项自动化测试、24 项隔离数据库检查、应用 TypeScript、三个目标函数 Deno 检查和生产构建。上述本地检查不替代 Lovable/Supabase 生产环境验收。

详细改动与边界见：[研究质量优化实施记录](研究质量优化实施记录-20261104.md)。
