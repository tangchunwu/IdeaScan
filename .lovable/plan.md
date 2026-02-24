

# Plan: Report Page Resume Validation + Score Sync + Incomplete State Handling

## Problem Summary

1. **No "Continue Validation" on Report page**: When a validation fails mid-way (like the current one), the user can only resume from the History page. They want to continue directly from the Report page to preserve already-collected data.

2. **Score inconsistency**: The top `ScoreHeroCard` uses `aiAnalysis.feasibilityScore` while the bottom `DemandDecisionCard` uses `validation.overall_score`. When both are 0/null, they happen to match, but when one gets updated and not the other, they desync.

3. **Incomplete display**: Fields like "核心痛点" show "-", persona is missing, dimensions are empty defaults -- the page doesn't clearly communicate that this is an incomplete/failed report that can be continued.

---

## Changes

### 1. Add "Continue Validation" Button on Report Page

**File: `src/pages/Report.tsx`**
- Detect when the validation is `failed` or `resumable` (already returned by the backend via `data.validation.resumable` and `data.validation.resume_hint`)
- Add a prominent banner/CTA at the top of the report (below ReportHeader) when the report is incomplete
- The button navigates to `/validate?idea=...&auto=true&resumeValidationId=...` (reusing the existing resume flow from History page)

**File: `src/components/report/ReportHeader.tsx`**
- Add a "Continue Validation" button alongside the existing "补充分析" button
- Show it when `validation.status === 'failed'` or `validation.resumable === true`

### 2. Sync Score Display

**File: `src/pages/Report.tsx`** (line 275)
- Unify score source: use a single computed `displayScore` that picks whichever is available: `aiAnalysis.feasibilityScore || validation.overall_score || 0`
- Pass this same `displayScore` to both `ScoreHeroCard` and ensure `DemandDecisionCard` also uses it

**File: `src/components/report/DemandDecisionCard.tsx`**
- Change from `validation.overall_score` to accept a `score` prop directly, so both cards always show the same number

### 3. Incomplete Report State Indicator

**File: `src/pages/Report.tsx`**
- Add an "Incomplete Report" banner when `validation.status === 'failed'` or `validation.status === 'processing'`
- Banner text: "This validation was interrupted. You can continue to complete the analysis." with a CTA button
- Visually distinct (amber/warning style) so user understands the data is partial

**File: `src/components/report/DemandDecisionCard.tsx`**
- When core data fields are empty/default, show "数据未完成采集" instead of "-" to make it clearer

---

## Technical Details

### Score Unification Logic
```text
const displayScore = aiAnalysis.feasibilityScore || validation.overall_score || 0;
```
This single value feeds into:
- ScoreHeroCard (top)
- DemandDecisionCard (bottom left)
- ReportHeader badges

### Resume Navigation
Reuses the existing `resumeValidationId` flow already implemented in `Validate.tsx` and `validate-idea-stream` edge function. No backend changes needed.

### Files Modified
1. `src/pages/Report.tsx` -- add incomplete banner, unify score, add resume navigation
2. `src/components/report/ReportHeader.tsx` -- add "Continue" button prop and display
3. `src/components/report/DemandDecisionCard.tsx` -- accept unified score prop, improve empty state text
4. `src/components/report/ScoreHeroCard.tsx` -- add incomplete state visual indicator

