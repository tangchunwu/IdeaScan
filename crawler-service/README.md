# crawler-service

独立爬虫服务（Python 3.11 + FastAPI + Redis）。

## 能力

- `POST /internal/v1/crawl/jobs`：提交抓取任务
- `GET /internal/v1/crawl/jobs/{job_id}`：查询任务状态
- `POST /internal/v1/crawl/cancel/{job_id}`：取消任务
- Worker 异步执行抓取并回调 IdeaScan `crawler-callback`

## 快速启动

```bash
cd crawler-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8100
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

## 回调协议

服务会向 `callback_url` POST 报文，并使用 `callback_secret` 计算 `X-Crawler-Signature`：

```text
HMAC_SHA256_HEX(secret, raw_body)
```

报文体遵循 `supabase/functions/_shared/crawler-contract.ts` 定义。
