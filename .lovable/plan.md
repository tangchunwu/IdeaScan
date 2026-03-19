

## Plan: Use custom domain `ideascan.me` for all share/report links

### Problem
The sample report link on the homepage and the share link in Report.tsx both use `window.location.origin`, which resolves to the Lovable preview URL (e.g., `id-preview--xxx.lovable.app`) instead of the custom domain `ideascan.me`.

### Changes

**1. Create a domain constant** (`src/lib/constants.ts`)
- Define `SITE_DOMAIN = "https://ideascan.me"` as a single source of truth

**2. Update homepage sample report link** (`src/pages/Index.tsx`, line 141)
- Change `window.location.origin` to use the constant:
  ```
  href={`https://ideascan.me/share/bb05ee712f6340cb`}
  ```

**3. Update report share link** (`src/pages/Report.tsx`, line 279)
- Change share URL generation to use the constant instead of `window.location.origin`

**Note:** Auth callbacks (`Auth.tsx`, `AuthCallback.tsx`) and referral links (`useReferral.ts`) must keep using `window.location.origin` because OAuth redirects require the actual serving origin.

