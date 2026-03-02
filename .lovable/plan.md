

## Problem Analysis

After thorough investigation of the TikHub API docs and codebase, I identified **two root causes**:

### Root Cause 1: Using the wrong XHS API endpoint

The code uses `/api/v1/xiaohongshu/web/search_notes` (Xiaohongshu **Web** API), but TikHub documentation marks **`Xiaohongshu App V2 API` as ⭐推荐 (Recommended)**. The Web API's scraping is unstable and consistently returns HTTP 400 ("Request failed, please retry") — this is TikHub's internal scraping failure, not a parameter issue.

The 400 errors explain why the dashboard shows zero usage: TikHub likely doesn't count failed scrape attempts as billable API calls.

### Root Cause 2: No token pre-validation

There is no pre-flight check to verify the token is valid before attempting expensive search calls. We should call `/api/v1/tikhub/user/get_user_info` first to confirm the token works and the account has balance.

### Root Cause 3: Missing token debug logging

The edge functions don't log which token is actually being used, making it impossible to verify the frontend-configured token matches what the backend receives.

---

## Plan

### Task 1: Add token pre-validation and debug logging

In both `validate-idea-stream` and `recrawl-social`:
- Log the first 8 and last 4 characters of the token being used (e.g., `Token: ABCDabcd...wxyz`)
- Before any XHS search, call `GET /api/v1/tikhub/user/get_user_info` with the token to verify it's valid and the account is active. If this returns 401, immediately surface "Token invalid" error instead of trying searches that will fail silently.

### Task 2: Switch XHS search to App V2 API (Recommended by TikHub)

Replace all uses of the Web API endpoint:
- **Old**: `/api/v1/xiaohongshu/web/search_notes` → **New**: `/api/v1/xiaohongshu/app/v2/search_notes` (App V2, recommended)
- **Old**: `/api/v1/xiaohongshu/web/get_note_comments` → **New**: `/api/v1/xiaohongshu/app/v2/get_note_comments` (App V2)

Files to update:
- `supabase/functions/validate-idea-stream/index.ts` — `crawlXhsSimple` function (lines ~2416, ~2442, ~2492)
- `supabase/functions/recrawl-social/index.ts` — `crawlViaTikhub` function (lines ~151, ~183)
- `supabase/functions/verify-config/index.ts` — TikHub test URL (line ~197)
- `supabase/functions/validate-idea/tikhub.ts` — `searchNotes` and `getNoteComments` functions
- `supabase/functions/validate-idea/channels/xiaohongshu-adapter.ts` — search and comments URLs

### Task 3: Update verify-config to also call user info endpoint

In `verify-config`, when type is `tikhub`:
- First call `/api/v1/tikhub/user/get_user_info` to verify token validity
- Then call the App V2 search endpoint to test search functionality
- Return distinct error messages: "Token invalid" vs "Search service temporarily unavailable"

### Task 4: Improve error messaging for 400 errors

When XHS search returns 400, show "TikHub 小红书搜索服务暂时不可用，请稍后重试" instead of the current generic "请检查 Token" message, since the token is valid but TikHub's scraping backend is failing.

---

### Technical Detail: API Path Changes

```text
SEARCH NOTES:
  Old: /api/v1/xiaohongshu/web/search_notes?keyword=X&page=1&sort=general&note_type=0
  New: /api/v1/xiaohongshu/app/v2/search_notes?keyword=X&page=1&sort=general&note_type=0

GET COMMENTS:
  Old: /api/v1/xiaohongshu/web/get_note_comments?note_id=X
  New: /api/v1/xiaohongshu/app/v2/get_note_comments?note_id=X

TOKEN VALIDATION (new):
  GET /api/v1/tikhub/user/get_user_info
```

Parameters and response structure should remain the same between Web and App V2 — only the path prefix changes.

