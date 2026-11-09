# 每日市场情报日报部署

## 已加入仓库

- `supabase/functions/daily-digest/index.ts`：读取最近 24 小时信号、生成结论、发送 HTML 邮件。
- `supabase/migrations/20261109120000_daily_digest_runs.sql`：记录每日发送状态，防止重复发送。
- `supabase/config.toml`：注册 `daily-digest` Edge Function。

## Supabase Secrets

在 Supabase Dashboard 的 Edge Functions → Secrets 中配置以下值：

```text
RESEND_API_KEY=<Resend API key>
DAILY_DIGEST_TO_EMAIL=<接收日报的邮箱>
DIGEST_FROM_EMAIL=<已在 Resend 验证的发件地址>
DAILY_DIGEST_CRON_SECRET=<随机长字符串>
```

不要把这些值写进仓库、前端环境变量或 SQL 文件。`DIGEST_FROM_EMAIL` 必须属于已经在 Resend 验证的域名；收件地址可以使用你的个人邮箱。

## 部署顺序

```bash
supabase db push
supabase functions deploy daily-digest --no-verify-jwt
```

## 每日触发

在 Supabase SQL Editor 中执行一次下面的调度。执行前把 URL 中的项目 ID 换成当前 Supabase 项目，并把 `YOUR_CRON_SECRET` 换成与 Secret 完全相同的值。建议使用 UTC 01:00（北京时间 09:00）。

```sql
select cron.schedule(
  'ideascan-daily-digest',
  '0 1 * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/daily-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-digest-secret', '<YOUR_CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

如果不希望在 SQL 历史中出现 Secret，请改用 Supabase Vault 保存 Secret，再从 `vault.decrypted_secrets` 读取。不要把 service role key 放入 cron 请求。

## 手动验证

```bash
curl -X POST \
  "https://<project-ref>.supabase.co/functions/v1/daily-digest" \
  -H "Content-Type: application/json" \
  -H "x-digest-secret: <YOUR_CRON_SECRET>" \
  -d '{}'
```

返回 `success: true` 并且 `daily_digest_runs.status` 为 `sent`，才算完成真实邮件验证。若当天已经发送，函数会返回 `duplicate: true`，不会重复发信；要重试失败记录，先确认上一封没有送达，再将该日期记录状态改为 `failed` 后重新调用。
