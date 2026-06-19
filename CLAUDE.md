# HVP Compliance Project — Current State

## Project Location
`C:\Users\CarlDosSantos-(OUTER\Projects\hvps-compliance`

## NEXT (2026-06-16, not started): Reporting for funding applications
Build reporting on the **Spend / funding applications** module (`lib/spendData.ts`, `app/api/spend/*`, `app/(portal)/spend/*`). Spend apps have: submittedBy, status (submitted/approved/etc.), quotes, approve/complete/select-quote flows, CAPEX year, source of funds. Likely wants: totals by status, by year, by source of funds, approved-vs-pending spend, per-applicant breakdown, maybe export. Confirm exact metrics with Carl. Mirror the compliance-checks dashboard pattern (lean list API → client grid + summary cards). Dashboard "Spend Pending" card is still hardcoded `0` — wire it as part of this.

## Status workflow on compliance issues (2026-06-16, DONE + deployed)
Each risk in a saved check can be tagged: `not_an_issue` / `needs_addressing` / `in_progress` / `addressed` (click active again to clear). Types + `updateRiskStatus()` + `countStatuses()` in `lib/complianceCheckData.ts`. PATCH `/api/compliance/checks/[id]` `{riskIndex,status}`. List API returns per-check `statusCounts`. Compliance page: buttons under each risk (optimistic update + revert) + 4 summary cards (in the RIGHT results panel, not under the left upload block). Dashboard: "Issues by Status" aggregate cards + per-row **Status** column (compact pills) in the grid. Status controls only show for upload-based checks (they carry an `id`); "Select Existing" policy mode uses the separate policy-check store and has no status UI.

## AI engine hardening (2026-06-16, DONE)
`lib/complianceEngine.ts`: model `claude-opus-4-8`; **structured outputs** (`output_config.format` json_schema, `RESULT_SCHEMA`) guarantee valid JSON → killed the intermittent "Unable to parse results / score 0" (was `max_tokens:4096` truncating + free-form wrap). `max_tokens:8192`; `stop_reason==="max_tokens"` → actionable "analysis too long" message. Prompt instructs **grouping** of related findings (consolidate same gap/section/requirement into ONE risk) to cut run-to-run count variance (±1 still normal — LLM nondeterminism; Opus 4.8 has no temperature). PDFs sent as native `document` blocks; txt/docx via `lib/pdfParser.ts` (jszip). `pdf-parse` removed.

## Feature 2026-06-16: Persisted compliance checks + dashboard grid
Upload-based checks (`/api/compliance/check`) were stateless — nothing saved, dashboard cards hardcoded to `0`, results vanished on navigation. Now:
- `lib/complianceCheckData.ts` — Blob-backed store (`compliance/checks.json` index + `compliance/<id>/<filename>` for the original file).
- POST `/api/compliance/check` persists each check + file (save is **non-fatal** — wrapped in its own try/catch so a Blob failure never loses the analysis result; returns `{...result, id}`).
- GET `/api/compliance/checks` (lean list, `view_dashboard`), `/checks/[id]` (full result, `check_compliance`), `/checks/[id]/file` (download original, `check_compliance`).
- Dashboard (`app/(portal)/dashboard/page.tsx`): "Compliance Checks" + "Non-Compliant" cards now fetch real counts; new grid (Document→link `/compliance?check=<id>`, Score, Issues, Checked by, Date). Other two cards (Total Policies, Spend Pending) still hardcoded `0` — not yet wired.
- Compliance page re-loads a saved check from `?check=<id>` (reads `window.location.search`, no `useSearchParams` → avoids Suspense build req) and shows a **Download** button. Download uses `authFetch`→blob (header auth `x-user-id` means a bare `<a download>` would 401 — known project gotcha).
- **Caveat:** only checks run AFTER this deploy are saved; pre-existing runs won't appear.

### Dedup + resilience (later same day)
- **Duplicate detection:** route computes `sha256` of the upload (`hash` on the record); `findComplianceCheckByHash` short-circuits an identical re-upload and returns the saved result with `duplicate:true` (no AI re-run). Catches renamed-identical files; an edited file hashes differently → new check. Frontend shows "already checked — showing the saved result" + loads it. **Caveat:** checks saved before this deploy have no `hash`, so they won't dedup until re-run.
- **Transient Anthropic 5xx:** the AI call uses `maxRetries:4`; a persistent `api_error`/overloaded (HTTP ≥500, has `request_id`) is translated to a friendly "AI service temporarily unavailable, please try again" message (raw JSON no longer shown). This is an Anthropic-side error, not ours — usually transient; retry succeeds.

## RESOLVED 2026-06-16: Compliance Check failures (TWO root causes, both fixed)

**Bug 1 — "fast timeout" / instant 404 (retired model).** `lib/complianceEngine.ts` pinned model `claude-sonnet-4-20250514`, which **retired June 15, 2026**. From June 16 on, the Anthropic API returns an immediate 404 `not_found_error` — surfaces in the UI as a fast failure / "timed out very quickly". Fixed by switching to `claude-opus-4-8`. (The old fallback note suggesting `claude-3-5-sonnet-20241022` is even more retired — Oct 2025 — do NOT use it. Current valid IDs: `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5`. Verify IDs against the live catalog; never pin dated snapshots.)

**Bug 2 — platform 500 on uploaded PDFs (fragile PDF parser).** After Bug 1, uploads still 500'd with a *non-JSON* response (the generic "Server error (500)… try a smaller document" in `compliance/page.tsx`). Non-JSON = the function was killed at the platform level (OOM / native-module load failure) **before** the route's try/catch could return JSON. Root cause: `pdf-parse@2` pulls in `pdfjs-dist` 5.x + `@napi-rs/canvas` (native) — too heavy/fragile for Vercel serverless.
**Fix:** stopped parsing PDFs server-side entirely. New `runComplianceCheckOnFile(buffer, ext, name, mode)` in `complianceEngine.ts` sends PDFs to Claude as a **native base64 `document` block** (GA, no beta header); txt/docx still text-extract via `lib/pdfParser.ts` (no native deps). All three check routes (`compliance/check`, `policies/[id]/check`, `documents/[id]/check`) share this one entry point. `pdf-parse` + `@types/pdf-parse` removed.
**Pattern:** prefer Claude's native PDF support (`document` content block) over server-side PDF libraries on serverless — avoids OOM/native-binary crashes that bypass try/catch.

### If it still fails after the model fix, debug here
1. **Check `ANTHROPIC_API_KEY`** is set in the Vercel env vars (and the key has access to the chosen model).
2. **Check `pdf-parse`** isn't crashing — `lib/pdfParser.ts` already wraps it in try/catch and returns a placeholder string, so a parse failure degrades gracefully rather than 500ing.
3. **Vercel function logs** — dashboard > Project > Deployments > Functions tab > the compliance/check function.
4. **Test locally** with `npm run dev`.

### What was being added when this broke
- Web search (Anthropic `web_search_20250305` tool) for checking latest BELA Act, SASA, GDE regulations online
- Guideline text truncation (large PDFs were OOMing the serverless function)
- Sources display in the compliance results UI

### Once the 500 is fixed, restore these features in `lib/complianceEngine.ts`:
- Load guidelines (skip files > 2MB, truncate text to 40k chars each)
- Add web search tool: `tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }]`
- Parse web search response (multiple content blocks, citations)
- Return `sources` array from citations
- UI already has the "ONLINE SOURCES CONSULTED" section in `app/(portal)/compliance/page.tsx`

## Recent Completed Work (this session)
- Added BELA Act to compliance engine prompt and guideline source options
- Fixed blob storage race condition (in-memory write cache in `controlData.ts`)
- Added "Already Approved" admin button on spend detail page (force-approve via API)
- Changed CAPEX year input to dropdown selector (current year -2 to +4)
- Source of Funds section already exists in Spend Settings page
- Improved error handling on compliance check (shows actual error, handles non-JSON responses)
- `maxDuration = 120` on both compliance check routes

## Tech Stack
- Next.js 16.2.5, React 19, Tailwind v4, Vercel Blob storage, Anthropic SDK 0.95.0
- Deployed on Vercel Pro
- Uses Resend for email, jsPDF for PDF generation

---

