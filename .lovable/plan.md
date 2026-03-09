

# 狩猎雷达 24 小时不间断扫描 + 管理员控制

## 现状
- `pg_cron` 和 `pg_net` 扩展已安装，但**没有创建 cron job**
- `perplexity-scheduler` edge function 已就绪，每次调用会自动选择领域、扫描关键词
- 前端文案写了"24小时不间断"但实际只有手动触发

## 方案

### 1. 创建调度控制表 `scheduler_config`

存储定时任务的开关状态，管理员可控制启停。

```sql
CREATE TABLE public.scheduler_config (
  id text PRIMARY KEY DEFAULT 'hunter_scheduler',
  enabled boolean NOT NULL DEFAULT false,
  interval_minutes integer NOT NULL DEFAULT 60,
  last_toggled_at timestamptz DEFAULT now(),
  toggled_by uuid REFERENCES auth.users(id)
);

-- RLS: 管理员可读写，普通用户可读
ALTER TABLE public.scheduler_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read" ON public.scheduler_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can update" ON public.scheduler_config
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.scheduler_config (id, enabled, interval_minutes)
VALUES ('hunter_scheduler', false, 60);
```

### 2. 注册 pg_cron 定时任务

使用 `supabase--read_query` 插入 cron job（每小时调用一次 `perplexity-scheduler`）：

```sql
SELECT cron.schedule(
  'hunter-perplexity-scan',
  '0 * * * *',  -- 每小时整点
  $$
  SELECT net.http_post(
    url := 'https://tayhqwtvsuurtwtpscai.supabase.co/functions/v1/perplexity-scheduler',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);
```

### 3. 修改 `perplexity-scheduler` edge function

在函数入口处检查 `scheduler_config.enabled`：
- 如果来源是 `cron` 且 `enabled = false`，直接返回跳过
- 手动触发（无 `source: cron`）不受影响

| 文件 | 改动 |
|------|------|
| `supabase/functions/perplexity-scheduler/index.ts` | 入口添加 `scheduler_config` 检查逻辑（约 10 行） |

### 4. 前端管理员控制面板

在 HunterSection 的管理员"数据监控"Tab 中添加调度控制区域：
- 显示当前状态（运行中/已停止）
- 开关 Switch 控制启停
- 显示扫描间隔（60 分钟）

| 文件 | 改动 |
|------|------|
| `src/components/discover/HunterSection.tsx` | 管理员 Tab 添加调度控制 Switch + 状态显示 |
| `src/services/hunterService.ts` | 新增 `getSchedulerConfig()` / `toggleScheduler()` 方法 |

### 5. 更新文案

将 L400 的描述改为准确反映 24 小时自动扫描能力（管理员启用后生效）。

---

**涉及改动**: 1 个新表 + 1 条 cron 注册 + 2 个前端文件 + 1 个 edge function 入口逻辑

