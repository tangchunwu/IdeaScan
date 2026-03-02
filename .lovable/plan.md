

## Problem Root Cause

The current code uses `/api/v1/xiaohongshu/app/search_notes` which is the **Xiaohongshu App API (V1)**. This endpoint is returning HTTP 400 errors ("请求失败，请重试"), meaning the underlying scraping is failing.

TikHub's documentation marks **Xiaohongshu App V2 API** as `⭐推荐 (Recommended)`. I verified the correct URL paths by directly testing them against TikHub's server:

- `/api/v1/xiaohongshu/app_v2/search_notes` -- returns **401** (endpoint exists, needs auth)  
- `/api/v1/xiaohongshu/app/v2/search_notes` -- returns **404** (does not exist)  
- `/api/v1/xiaohongshu/app/search_notes` -- currently used, returns **400** (scraping failure)

The V2 path uses an **underscore** (`app_v2`), not a slash (`app/v2`). This was the mistake in the previous fix.

## Fix

Replace all occurrences of `/api/v1/xiaohongshu/app/` with `/api/v1/xiaohongshu/app_v2/` across 5 files:

| File | Endpoints to fix |
|------|-----------------|
| `supabase/functions/validate-idea-stream/index.ts` | `search_notes`, `get_note_comments` |
| `supabase/functions/recrawl-social/index.ts` | `search_notes`, `get_note_comments` |
| `supabase/functions/verify-config/index.ts` | `search_notes` |
| `supabase/functions/validate-idea/tikhub.ts` | `search_notes`, `get_note_comments` |
| `supabase/functions/validate-idea/channels/xiaohongshu-adapter.ts` | `search_notes`, `get_note_comments` |

The change is purely a path prefix swap. Parameters and response structure remain identical.

After editing, deploy all 4 edge functions (`validate-idea-stream`, `recrawl-social`, `verify-config`, `validate-idea`).

