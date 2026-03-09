

## Plan: Merge Gallery into Discover & Simplify Navigation

The Gallery (精选报告) shows high-scoring public reports, which overlaps with the Discover (热点雷达) page's purpose of surfacing opportunities. We'll merge Gallery as a new tab inside Discover and remove it from the navbar.

### Changes

**1. Add "精选报告" Tab to Discover Page (`src/pages/Discover.tsx`)**
- Add a third tab alongside "热点雷达" and "狩猎雷达": "精选报告"
- Move the Gallery report-fetching logic and card rendering inline as a `TabsContent`
- Keep the same visual style (score badges, report cards, CTA)

**2. Remove Gallery from Navigation (`src/components/shared/Navbar.tsx`)**
- Remove the "精选报告" nav item, reducing nav to 4 items: 创意验证, 热点雷达, 历史记录, OpenClaw

**3. Route Redirect (`src/App.tsx`)**
- Keep `/gallery` route but redirect to `/discover?tab=gallery` for backwards compatibility
- Remove the lazy Gallery import if fully inlined, or keep it as a redirect

**4. Update Discover Page Header**
- Broaden the page title/subtitle to encompass both trending topics and curated reports (e.g., "发现商业机会" as umbrella)

### Files to Edit
- `src/pages/Discover.tsx` — Add gallery tab with report fetching and display
- `src/components/shared/Navbar.tsx` — Remove Gallery nav item
- `src/App.tsx` — Redirect `/gallery` to `/discover?tab=gallery`

