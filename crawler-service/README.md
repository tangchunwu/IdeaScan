# crawler-service

独立爬虫服务（Python 3.11 + FastAPI + Redis）。

## 能力

- `POST /internal/v1/crawl/jobs`：提交抓取任务
- `GET /internal/v1/crawl/jobs/{job_id}`：查询任务状态
- `POST /internal/v1/crawl/cancel/{job_id}`：取消任务
- `POST /internal/v1/auth/sessions/start`：启动扫码登录会话，返回二维码截图
- `GET /internal/v1/auth/sessions/{flow_id}`：查询扫码状态（成功后自动保存用户会话）
- `POST /internal/v1/auth/sessions/cancel/{flow_id}`：取消扫码会话
- `POST /internal/v1/auth/sessions/import`：手动导入 cookies（可替代扫码）
- `GET /internal/v1/auth/sessions/user/{user_id}`：查询用户已授权会话列表
- `POST /internal/v1/auth/sessions/revoke`：吊销指定平台会话
- Worker 异步执行抓取并回调 IdeaScan `crawler-callback`

## 快速启动

```bash
cd crawler-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8100
```

安装浏览器内核（首次必需）：

```bash
playwright install chromium
```

另开终端启动 worker：

```bash
cd crawler-service
source .venv/bin/activate
python run_worker.py
```

## 环境变量

- `CRAWLER_API_TOKEN`：内部 API 鉴权 token（可选）
- `CRAWLER_REDIS_URL`：Redis 连接串（默认 `redis://localhost:6379/0`）
- `CRAWLER_INLINE_MODE`：`true` 时 API 进程内直接执行任务（开发调试）
- `TIKHUB_TOKEN`：可选，抓取小红书/抖音时使用
- `CRAWLER_HTTP_TIMEOUT_S`：外部请求超时，默认 12
- `CRAWLER_CALLBACK_TIMEOUT_S`：回调超时，默认 8
- `CRAWLER_JOB_QUEUE_KEY`：队列 key，默认 `crawler:jobs`
- `CRAWLER_AUTH_FLOW_TTL_S`：扫码会话有效期（秒），默认 180
- `CRAWLER_ENABLE_DAILY_BUDGET`：是否启用每用户每日抓取预算，默认 `false`（建议调试阶段关闭）
- `CRAWLER_DAILY_BUDGET_UNITS`：每日预算总量，默认 `6000`
- `CRAWLER_SESSION_ENCRYPTION_KEY`：会话加密密钥（建议设置；留空则明文存储）
- `CRAWLER_SESSION_MAX_IDLE_HOURS`：会话最大空闲时长（小时），默认 `168`
- `CRAWLER_SESSION_FAIL_THRESHOLD`：会话连续失败熔断阈值，默认 `3`
- `CRAWLER_QUICK_DELAY_MS_MIN`：quick 模式抓取间隔最小值（ms），默认 `900`
- `CRAWLER_QUICK_DELAY_MS_MAX`：quick 模式抓取间隔最大值（ms），默认 `1800`
- `CRAWLER_DEEP_DELAY_MS_MIN`：deep 模式抓取间隔最小值（ms），默认 `600`
- `CRAWLER_DEEP_DELAY_MS_MAX`：deep 模式抓取间隔最大值（ms），默认 `1200`
- `CRAWLER_PLAYWRIGHT_HEADLESS`：浏览器是否无头，默认 `true`
- `CRAWLER_DEFAULT_PROXY_SERVER`：可选，浏览器代理地址（例如 `http://host:port`）
- `CRAWLER_DEFAULT_PROXY_USERNAME`：可选，代理用户名
- `CRAWLER_DEFAULT_PROXY_PASSWORD`：可选，代理密码

## 扫码登录流程

1. 调用 `POST /internal/v1/auth/sessions/start`，body 传 `platform`、`user_id`。  
2. 返回 `qr_image_base64`，前端展示二维码图片供用户扫码。  
3. 轮询 `GET /internal/v1/auth/sessions/{flow_id}`。  
4. 返回 `status=authorized` 即表示 cookies 已写入会话池；后续抓取会优先使用该用户会话。  

### 后端直连扫码探针（不依赖前端）

可直接执行脚本，在本地弹出二维码并轮询授权状态，授权成功后会输出：
- 会话摘要（status/source/failures）
- Cookie 可用性报告（必需 cookie 是否到位）
- 一次 quick smoke crawl 结果（notes/comments/sample）

```bash
cd /Users/tangchunwu/Desktop/project-89f68ee7-e671-4516-b0ba-dc623c1dc4c6
source crawler-service/.venv/bin/activate
python scripts/crawler/qr_session_probe.py \
  --platform xiaohongshu \
  --user-id <你的用户UUID> \
  --open
```

## 采样建议

- `quick`：默认 `8` 帖 / 每帖 `10` 评论（更可信但仍可控）。
- `deep`：默认 `14` 帖 / 每帖 `30` 评论（用于高置信验证，必要时配合 TikHub 兜底）。

## 真实性策略（当前）

- 评论提取优先读取页面网络接口响应（API JSON），并在评论接口存在游标时尝试翻页补齐；DOM 仅作为补充兜底。
- 会话抓取失败会累计失败计数，连续失败达到阈值后自动降级会话状态，防止反复触发风控。
- 会话健康检查包含空闲时长、cookie 过期、连续失败阈值；命中自动剔除规则时会从会话池删除。

## 回调协议

服务会向 `callback_url` POST 报文，并使用 `callback_secret` 计算 `X-Crawler-Signature`：

```text
HMAC_SHA256_HEX(secret, raw_body)
```

报文体遵循 `supabase/functions/_shared/crawler-contract.ts` 定义。
