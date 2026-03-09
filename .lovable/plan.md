

## Plan: Polish History Page — From MVP to Production Quality

Looking at the screenshot, the page has several issues that make it feel unfinished:

1. **Redundant data sections**: Stats bar at top AND stats summary at bottom show the same metrics (total, avg score, etc.)
2. **Sample Reports doesn't belong here**: It's already available in the Discover page's "精选报告" tab — showing it on History is noise
3. **Too many stacked GlassCards**: Stats → Weekly Summary → Sample Reports → List creates visual overload with no hierarchy
4. **Raw `<select>` elements**: The filter dropdowns use unstyled native selects instead of the design system's `Select` component

### Changes

**1. Remove redundant sections from `src/pages/History.tsx`**
- Remove the bottom stats summary (lines 493-529) — duplicates HistoryStatsBar
- Remove `<SampleReports />` — already accessible via Discover page
- Remove the `SampleReports` and `WeeklySummaryCard` imports if no longer used

**2. Merge Weekly Summary into Stats Bar (`src/components/history/HistoryStatsBar.tsx`)**
- Integrate the "本周摘要" data (this week count, week-over-week change, best idea) directly into the stats bar as additional metrics
- This eliminates one entire card layer while preserving the information

**3. Upgrade filter dropdowns to use Shadcn `Select` component**
- Replace the three native `<select>` elements with `Select` / `SelectTrigger` / `SelectContent` from the UI library
- Consistent rounded-xl styling matching the rest of the design system

**4. Tighten visual hierarchy**
- Combine the search/filter bar and stats into a cleaner layout
- Give the validation list items slightly more refined spacing and typography
- Remove excessive `animate-slide-up` delays that make it feel slow

### Files to Edit
- `src/pages/History.tsx` — Remove redundant sections, upgrade selects
- `src/components/history/HistoryStatsBar.tsx` — Absorb weekly summary data

