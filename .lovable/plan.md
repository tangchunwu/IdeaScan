

## Problem Analysis

The counter shows "9" because **the app cannot build at all** — the dependency environment is corrupted. The page you see is a stale cached version. Two problems need fixing:

1. **Build completely broken**: `rollup` and `vite` were accidentally added to `dependencies`, conflicting with the platform's pre-installed versions. `@types/react` version `18.3.12` in dependencies conflicts with recharts/framer-motion JSX types.

2. **Minor code issue**: `supabase.auth.getSession()` no longer exists in the current Supabase SDK version used.

The RPC `get_completed_validation_count` is correct and returns the real global count. Once the build works, the counter will show the true number.

---

## Fix Plan

### Step 1: Clean up package.json
- **Remove** `rollup`, `vite`, and `@types/react` from `dependencies` (they belong in devDependencies or are provided by the platform)
- Pin `@tanstack/react-query` to `^5.56.2` (caret instead of exact) to allow compatible resolution

### Step 2: Fix IdeaComparison.tsx
- Replace `supabase.auth.getSession()` with `supabase.auth.getUser()` (the current SDK method)

### Step 3: Verify sample report link
- Confirm the sample report link uses `window.location.origin` so it works on the custom domain

---

## Technical Details

The recharts JSX errors (`XAxis`, `YAxis`, `Tooltip`, `Bar` cannot be used as JSX component) are caused by `@types/react@18.3.12` in dependencies conflicting with the platform's type definitions. Removing it from dependencies resolves all ~30 recharts/framer-motion type errors at once.

The `ERR_MODULE_NOT_FOUND: Cannot find package 'rollup'` runtime error is caused by `rollup@4.24.0` in dependencies interfering with vite's internal rollup resolution. Removing both `rollup` and `vite` from dependencies fixes the startup crash.

