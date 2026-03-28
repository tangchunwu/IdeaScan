

# 一键配对连接方案

## 核心思路

将当前的多步骤设置流程（先在 web 创建连接 → 复制 ID/Token → 下载脚本 → 拼命令）简化为**设备配对模式**：

```text
用户本地                              Web 应用
─────────                            ──────────
运行一行命令 ──→ 生成 pairing code ──→ 用户粘贴 code
                                      ↓
                 ←── 服务端自动创建连接 ──┘
                 ←── 返回 connection_id + token
                 ↓
         bridge 自动开始工作
```

**用户体验**：
1. 本地执行：`curl -fsSL <url> | python3 - pair --supabase-url https://xxx.supabase.co`
2. 终端显示一个 6 位配对码，如 `A3F7K2`
3. 在 Web 的 OpenClaw 设置页输入这个码
4. 本地 bridge 自动获得凭证，开始工作

## 实现步骤

### 1. 新建 Edge Function `openclaw-pair`

处理两个动作：
- `request_pair`：bridge 调用，生成随机 pairing code，存入临时表（5 分钟过期），返回 code
- `confirm_pair`：web 端调用，用户输入 code 后，创建 `openclaw_connections` 记录，返回 connection_id + token，标记 code 已使用

### 2. 新建数据库表 `openclaw_pairing_codes`

```sql
CREATE TABLE openclaw_pairing_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  machine_name text DEFAULT 'default',
  backend text DEFAULT 'claude',
  work_dir text DEFAULT '.',
  claimed_by uuid,                    -- 领取的用户
  connection_id uuid,                 -- 创建的连接 ID
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE openclaw_pairing_codes ENABLE ROW LEVEL SECURITY;
-- Service role 全权管理
CREATE POLICY "Service role full access" ON openclaw_pairing_codes FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');
-- 认证用户可查询（用于确认配对）
CREATE POLICY "Auth users can select" ON openclaw_pairing_codes FOR SELECT
  TO authenticated USING (true);
```

### 3. 修改 `bridge.py` — 新增 `pair` 子命令

```text
python bridge.py pair \
  --supabase-url https://xxx.supabase.co \
  --backend claude \
  --work-dir ~/my-project

输出：
  ✅ 配对码: A3F7K2
  请在 IdeaScan OpenClaw 设置页输入此码（5 分钟内有效）
  等待确认中...

确认后自动输出：
  🎉 已配对！Connection ID: xxx, Token: yyy
  Bridge 正在启动...
```

流程：
1. bridge 调用 `openclaw-pair` 的 `request_pair`，带上 machine_name、backend、work_dir
2. 打印 code，然后每 2 秒轮询 `openclaw-pair` 的 `check_pair` 检查是否已确认
3. 确认后拿到 connection_id + token，自动切换到正常的 poll 模式

### 4. 修改 `OpenClawSettings.tsx` — 新增配对码输入

在设置页顶部添加：
- 一个"输入配对码"按钮，弹出输入框
- 用户输入 6 位码后调用 `openclaw-pair` 的 `confirm_pair`
- 确认成功后自动刷新连接列表
- 同时保留现有的手动添加方式作为高级选项

### 5. 支持一键启动命令（curl pipe）

提供更简化的入口：
```bash
curl -fsSL https://raw.githubusercontent.com/.../bridge.py | \
  python3 - pair --supabase-url https://xxx.supabase.co --backend claude --work-dir .
```

这样用户只需要复制一行命令，无需提前下载脚本。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `supabase/functions/openclaw-pair/index.ts` | 新建，处理配对请求/确认 |
| 数据库迁移 | 新增 `openclaw_pairing_codes` 表 |
| `scripts/agent-bridge/bridge.py` | 新增 `pair` 子命令 + 自动启动逻辑 |
| `src/components/openclaw/OpenClawSettings.tsx` | 新增配对码输入 UI |

