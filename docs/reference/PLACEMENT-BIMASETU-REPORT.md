# BimaPlacement × BimaSetu — completion report

Spec: the "BimaPlacement prototype — change prompt" (Sections 0–2, Phases 1–14), run in Product Owner mode for Placement only.
Cadence: phase-by-phase, one local commit per phase (Phases 2, 3 and 5 share a commit because they rewrite the same insurer / thread api), not pushed.
`FUNCTIONAL-SPEC.md` covers BimaEndorse only and is unchanged; this report is the contract for the Placement change.

Every phase passed `npx esbuild prototype.jsx --loader:.jsx=jsx --jsx=automatic --outfile=/dev/null`.
Checks ran as node scripts against the bundled module (the pure `pl*` helpers and `makePlacementApi`), plus the browser at :5173 as Bhupendra (PM) and Himani (Placement Head).

---

## 1. Phases, symbols, checks

| # | Commit | Symbols changed | Checks |
|---|---|---|---|
| 1 | `6e28f12` | Deleted `PlBimaNetraCard`, `PlBimaNetraLightbox`, `PlBimaNetraDrawer`, `PlBimaNetraRejectModal`, `NETRA_T`, `NetraGauge` / `NetraChip` / `NetraScoreChip` / `NetraSourceLine` / `NetraBar` / `NetraRow` / `NetraGroup`. `PlRfqTab`: button is "Validate RFQ" → `api.validateRfq`. | ✅ `netra` appears 0 times. ✅ Validate moves a ready ticket to Insurer Selection. |
| 2 | `609f625` | `PL_INSURERS[*].status` (Oriental = Do Not Float). `PL_CONTACTS` → `PL_INSURER_BRANCHES`. New: `plGroupOf`, `plBranchesOf`, `plBranchRow`, `plPocsFor`, `plEntityLabel`, `plIncumbentId`, `plIncumbentBlocked`, `plEntityFor`, `plEntitiesFor`, `plPickedBranches`. Deleted: `plPocOf`, `plPocsOf`, `plPocsAt`, `plBranchOf`, `plBranchesAvailable`, `setPoc`, `setPocsAt`, `c.pocs`, `c.insurerBranches`. | ✅ Every Oriental entity locked. ✅ Blank branch labels as the insurer. |
| 3 | `609f625` | `PlInsurersTab` (read-only "POCs", lock-reason chips). Send modal. Locked panel. `PlAddInsurerModal` (insurer + branch). `plToggleBranch`, `plMakeThread`, `floatRfq`, `togglePanel` / `togglePanelBranch` refuse locked entities. `t.poc` → `t.pocs`. `plThreadLabel`. Mail Trail To. `plSeedThreadPocs`. | ✅ Two insurers, one at two branches → 3 threads with master POCs. ✅ Rollover incumbent without a mandate refused by the list, the add modal and the api. ✅ Two branches of one insurer count once. |
| 4 | `1b691a4` | `PL_FOLLOWUP_LADDER[2]` "Escalation". `plThreadNext` "Send escalation". Sweep and manual follow-up events read `… sent to {entity} · To: {pocs}`. | ✅ After 3 BD: Follow-up 1, Follow-up 2, Escalation, each to every POC. ✅ No "senior" left. |
| 5 | `609f625` | `PlMasterScreen` (one row per insurer + branch; columns INSURER / PRODUCTS / BRANCH / POCS / STATUS). `PlInsurerEditDrawer` (insurer status, branch name and status, POCs per group). `api.saveInsurerMaster`, `PL_MASTER_AUDIT`. | ✅ A Head edit shows on the next selection list. ✅ Before/after values audited. ✅ A PM can't edit (api refuses; no Edit buttons). |
| 6 | `1ce59ab` | `plQcrIsFileBased`, `plQcrSourceLabel`, `plSingleQuoteQcr`. `startDraftQcr` / `newQcrVersion` single-quote path. `releaseQcr`, `plCaseStatus`, `plSlaIdOf` (SLA-12), `plNextAction`, `PlQcrTab`, `PlQcrDocument`, `PlEarlyReleaseModal` copy. | ✅ Third usable quote → Copycat draft with no click. ✅ 1-quote early release: no Copycat, reaches Pending Placement Release. ✅ 2-quote early release queues Copycat. |
| 7 | `1842c6c` | `PL_CONFIG` (no `maxMb`; QCR accepts any type). `PlRfqUploadField` / `PlQcrUploadField` show "No size limit". `plMatchProductTypes`: PL Act and PI-engineering rules. | ✅ All 11 matcher rows pass. ✅ 25 MB `.pptx` manual QCR accepted. |
| 8 | `dd97bc0` | `PL_SLA_MASTER`: SLA-15 and SLA-16 removed; SLA-02 / 04 / 10 touchpoints; SLA-06 target text. `plSlaTargetMins`, `plReconcileSla`, `plSeedSla`, `plScenarioOf`. | ✅ New / EB / Non-preferred in quote collection shows a 7 BD clock (3,780 min). |
| 9 | `faf17cc` | `PlQuoteExcludeModal` is free text only. `decideQuote` guards. `plCanMarkUsable`. `PL_FIELDSETS` comment. Mandate flow checked. | ✅ Exclude with no text blocked. ✅ Usable blocked while a clarification is open. |
| 10 | `22b1e2b` | `c.channel`, `c.bimasetu[]`, `plBsLog`, `plBsSeen`, `plBsSummary`. `patch` desk stage feed. `PlMailTab` Mail \| BimaSetu sub-tab. `PlBimaSetuSimBlock`. | ✅ One log entry per message. ✅ Manual tickets log nothing and show no panel. |
| 11 | `784e458` | Removed `PL_RM_MAIL_PRESETS`, `plParseRfqMail`, `api.ingestRmMail`, `rfqMailLog`, the RFQ mails tab and the Email Bot actor. New: `PL_FLOAT_PRESETS`, `PL_REJECTED_FLOATS`, `api.receiveFloat`, `PlFloatSimModal`. `_doBatchCreate` → `_doCreate` (one ticket). Single-product `PlCreateCaseModal`. Removed `linkedTickets` / `PL_SEED_LINKED_PAIRS` / the "Linked:" header. `PC-` → `PLC-`. `Fresh` → `New`. Mandate header label. Unmapped-product callout and float card. | ✅ Preset → one PLC ticket plus `in:float` and `out:ticket_created`. ✅ No-RFQ preset creates nothing. ✅ Replay is a no-op. ✅ No "Fresh", "PC-" or sibling link remains. |
| 12 | `0d14764` | Gap → query copy (`PlRfqTab`, `PlAskRmModal`, next action, tasks). `requestRmInfo` floated path. New: `api.bsQueryAnswer`, `api.bsThreadAnswer`, `PlBsAnswerModal`. `holdForRm` logs `query_raised`. `validateRfq` guard. `plOpenRmQueries` for the Home "RM Response" count. Removed `cancelled_inactivity` and SLA-18. | ✅ Two queries → two `query_raised`. ✅ An answer returns the ticket to RFQ Review. ✅ Validate stays locked until both are resolved. ✅ No inactivity text. |
| 13 | `2657fd9` | New: `plQuoteRow`, `plQcrRowsFor`, `plQcrFileName`, `plRoundRequestedAt`, `c.round` / `qcr.round`, `qcr.rows` / `rowsChecked`. `api.setQcrRow`, `setQcrRowsChecked`, `bsRevision`, `bsClientConfirmation`, `bsLineLost`, `closeNoAppetite`, `logClientDecision`. `releaseQcr` → `qcr_round`. `PL_REVISION_ASKS`, `plOpenRevision`, `plHandleRevision`. Stage `revision_requested` (SLA-17). `PL_OUTCOME` trimmed. `PlQcrRowsCard`, `PlBsRoundModal`, and the `PlOutcomeModal` / `PlSendQcrModal` / `PlQcrTab` rework. Removed `rmRequestMoreQuotes`, `selectQuote`, `recordOutcome`, `PL_TAXONOMY`, `PlTaxonomyPicker`, the more-quotes cards and the "Simulate what the RM heard back" grid. | ✅ Send blocked until rows are checked. ✅ Single-quote release carries the reason. ✅ Payload holds only file, round, times, reason and rows. ✅ Revision → round 2 with no insurer events. ✅ Confirmation → Quote selected. ✅ Line lost → Lost. ✅ No appetite → zero-row round, then `closed_no_appetite`. ✅ Manual tickets show Log client decision and no panel. |
| 14 | this report | — | See below. |

### Phase 14 regressions

- **Floated ticket**, node end to end:
  - float → `query_raised` → `query_answer` → Validate → Send to insurers → 3 usable → auto Copycat → rows checked → `qcr_round` (round 1) → `revision_request` → re-rate → QCR V2 (round 2) → `qcr_round` → `client_confirmation` → Quote selected on QCR V2.
  - BimaSetu log in order: `in:float → out:ticket_created → out:query_raised → in:query_answer → out:qcr_round → in:revision_request → out:qcr_round → in:client_confirmation` (plus `stage_changed` entries).
- **Manual ticket**: create → query by mail → Validate → Send to insurers → auto Copycat → rows checked → Send to RM (nothing sent to BimaSetu) → Log client decision → Quote selected.
- **Unchanged behaviour**:
  - ✅ An insurer reply (Manual Review style, `simulateInsurer` with source) still maps to its thread.
  - ✅ Team / Me scopes are unchanged.
  - ✅ The SLA-P1 internal escalation sweep still fires on breached seeds.
- **Browser sweep**: all 17 tickets × all 9 tabs, plus the Insurer Panel / Insurer Threads sub-tabs, Home, Manual Review and Reports render with no console errors. BimaEndorse still renders after login.

---

## 2. Knock-on changes beyond the listed items

1. **Placement search.** It checked a `"Cases"` scope that no longer exists, so search by id, stage, business type or product never matched. It now checks `"Tickets"`.
2. **`PlQcrReportModal`.** It used an undefined `products` and threw when a Copycat QCR was opened. It now uses `allProducts`.
3. **Usable gate.** It used extraction-era `openItems`, which could never be cleared, so the PC-1027 seed quote could never be marked usable. Usable is now blocked only while that quote's insurer clarification is open (§1).
4. **Manual QCR drafts.** They read "QCR Generation In Progress" on SLA-11 with Copycat next-action text. They are now handled like single-quote drafts: Pending Placement Release, SLA-12.
5. **QCR upload after a release.** "Upload V{n}" after a release silently did nothing because of the `plCanCreateQcr` gate. It now creates the next round.
6. **Late-quote card.** It also appears when usable quotes are missing from the released QCR, not only when quotes are undecided. Without this, a revision round's re-rated quotes had no way to reach QCR V2.
7. **Exclude reason.** `decideQuote` refuses an exclude with an empty reason in the api, not only in the UI.
8. **Thread labels.** `plThreadLabel` is now "Insurer — Branch · TH-nn". Seeded threads had no POC, so the Manual Review thread picker showed identical labels.
9. **RFQ wording.** "RM Interface™" now reads "BimaSetu", and the RFQ Summary source reads "BimaSetu float · line ref".
10. **Split seed tickets.** PLC-1035–1040 got their own RFQ link and file names instead of embedding the parent id.
11. **Seed wording and handoffs.** "RFQ V1 floated …" became "RFQ V1 sent to insurer(s)". The ISS- handoff references and their audit rows were removed.
12. **Market tab copy.** The stale line "Adding a market happens … before RFQ float" was replaced.
13. **Inbox.** The more-quotes item became a "Revision requested" item.
14. **Memory notes.** The PM-assistant memory notes were updated for PLC- ids.

## 3. Assumptions

1. **`plStatusOf`** is `plCaseStatus(c).internal`.
2. **Exclusive mandate on a float** is `c.meta.mandate` with `source: "BimaSetu"`.
3. **Rejected floats** create no ticket. Their inbound `float` is kept on a module-level `PL_REJECTED_FLOATS` list, shown in the float simulator. Float replay is keyed on the line ref.
4. **Locked rows in the selection list.** The list shows every insurer + branch with at least one POC for the group, including Do Not Float, Inactive and incumbent ones (locked, with the reason), so §1's "Oriental is locked" is visible. "No POC" appears as a lock reason on the add-insurer path, which lists every branch.
5. **Incumbent matching.** The incumbent is matched by insurer id or by name ("New India", "HDFC Ergo"). It is blocked only on a Rollover with no Incumbent Approach Mandate.
6. **Insurer-level `togglePanel`** (add modal, legacy) acts on the insurer's first unlocked branch. Seeds that selected an insurer without branch picks mean its first branch.
7. **Insurer Master edits** apply to the in-memory master, with a master-level change log shown on the screen, because there is no ticket to hang them on. Renaming a branch doesn't rewrite branch names already stored on existing threads.
8. **Rounds.** `c.round` starts at 1. A revision opens the next round. A later QCR version (or upload) after a release is the next round, unless a revision has already opened it. The auto-trigger fires only while no QCR is released on the active RFQ; later rounds use "Create QCR V{n}". `requestedAt` is the ticket's arrival for round 1 and the revision time for later rounds.
9. **`revision_requested`** uses SLA-17 (4 business hours, the existing requote row) and sits at workflow step 5.
10. **Quote rows.**
    - Manual QCRs carry the usable quotes in `quoteIds`, so the PM has one row per quote to type into. Single-quote QCRs carry the one quote.
    - Editing any row clears "Quote rows checked".
    - "Validity" uses the mock field value, e.g. "30 days" or "45 days from 06 Aug 2026".
    - Seeded released QCRs get filled rows and count as checked.
11. **QCR round payload.** It carries rows without quote or insurer ids. A single-quote QCR's file is the insurer's quote PDF, as specified.
12. **Desk stage feed.** It also fires on closure, so `stage_changed` follows `closed_no_appetite` / `client_confirmation`.
13. **"Waiting on RM" count.** It counts tickets in RFQ Clarification with an unanswered query, plus held threads whose insurer query the RM hasn't answered.
14. **Closed manual tickets.** Log client decision is offered on any open manual ticket. Quote selected needs a released QCR.
15. **Outcome mapping.** The seeded `unable_to_place` (PLC-1030) maps to No appetite.
16. **Split seed tickets.** PLC-1035–1040 stay as standalone single-product tickets (user decision).
17. **Mandate request flow.** It already matched §1 and is unchanged. The request message stays mandatory, as before.
