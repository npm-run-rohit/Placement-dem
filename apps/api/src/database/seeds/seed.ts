import 'reflect-metadata';
import dataSource from '../data-source';
import {
  BUSINESS_TYPE_SEED,
  EARLY_RELEASE_REASONS_SEED,
  INDUSTRY_TYPES_SEED,
  MANDATE_DECLINE_REASONS_SEED,
  MANDATE_REQUEST_REASONS_SEED,
  PRODUCT_TYPES_SEED,
  QUOTE_TARGET_MATRIX_SEED,
  SLA_MASTER_SEED,
  THRESHOLD_DEFAULTS,
  SLA_P1_DEFAULTS,
  FOLLOW_UP_LADDER_DEFAULTS,
  BUSINESS_CALENDAR_DEFAULTS,
} from '@bimaplacement/contracts';

/**
 * Seeds masters from the PRD defaults (Appendix C "Have" items). Idempotent (upserts).
 * Real data still pending from the Placement Head (insurer appetite grid, holiday list, users, RMs,
 * final template wording); the rest of the business masters workbook is loaded by seed-masters.ts.
 * Dev fixtures (insurers, demo tickets) live in ./fixtures and are only loaded with SEED_FIXTURES=true.
 */
async function main() {
  await dataSource.initialize();
  const q = (sql: string, params: unknown[] = []) => dataSource.query(sql, params);

  for (const [i, p] of PRODUCT_TYPES_SEED.entries()) {
    await q(
      `INSERT INTO product_types(code, product_group, short_label, label, rfq_template, timing_lob, aliases, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (code) DO UPDATE SET label=EXCLUDED.label, rfq_template=EXCLUDED.rfq_template, timing_lob=EXCLUDED.timing_lob, aliases=EXCLUDED.aliases`,
      [p.code, p.group, p.short, p.label, p.rfqTemplate, p.timingLob, p.aliases, i],
    );
  }
  const lookups: Array<[string, string[]]> = [
    ['industry_type', INDUSTRY_TYPES_SEED],
    ['business_type', BUSINESS_TYPE_SEED.map((b) => b.value)],
    ['urgency', ['High', 'Medium', 'Low']],
    ['risk_tier', ['Preferred', 'Non-preferred']],
    ['early_release_reason', EARLY_RELEASE_REASONS_SEED],
    ['mandate_request_reason', MANDATE_REQUEST_REASONS_SEED],
    ['mandate_decline_reason', MANDATE_DECLINE_REASONS_SEED],
  ];
  for (const [kind, values] of lookups) {
    for (const [i, value] of values.entries()) {
      await q(
        `INSERT INTO lookup_values(kind, value, sort_order) VALUES ($1,$2,$3) ON CONFLICT (kind, value) DO NOTHING`,
        [kind, value, i],
      );
    }
  }
  for (const s of SLA_MASTER_SEED) {
    await q(
      `INSERT INTO sla_definitions(id, touchpoint, owner, target_mins, owner_type, target_text) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [s.id, s.touchpoint, s.owner, s.targetMins, s.ownerType, s.targetText],
    );
  }
  for (const [lob, row] of Object.entries(QUOTE_TARGET_MATRIX_SEED)) {
    for (const [scenario, days] of Object.entries(row)) {
      await q(
        `INSERT INTO quote_target_matrix(timing_lob, scenario, business_days) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [lob, scenario, days],
      );
    }
  }
  const settings: Record<string, unknown> = {
    business_calendar: BUSINESS_CALENDAR_DEFAULTS,
    thresholds: THRESHOLD_DEFAULTS,
    sla_p1: SLA_P1_DEFAULTS,
    follow_up_ladder: FOLLOW_UP_LADDER_DEFAULTS,
    upload_rules: { rfqAccept: ['.xlsx', '.xls', '.csv'], qcrAccept: null },
    assignment_rule: { strategy: 'head_fallback' },
  };
  for (const [key, value] of Object.entries(settings)) {
    await q(`INSERT INTO app_settings(key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`, [
      key,
      JSON.stringify(value),
    ]);
  }
  // Holidays: none seeded. The list is pending from the Placement Head (PRD App. A #20, App. C #16); add it on
  // the Business Calendar master. Dev fixtures load the prototype's dates (seed-fixtures.ts).

  // Communication templates: the PRD M6 s12 / s12.1 examples, verbatim. Final wording is pending from the
  // Placement Head (PRD App. A #20) - edit them on the Communication Template master, never in code.
  const templates: Array<[string, 'insurer' | 'rm' | 'internal', string, string, string]> = [
    [
      'INS-T01',
      'insurer',
      'Initial RFQ float',
      '[{{TicketID}} | {{ThreadID}}] RFQ - {{Client}} - {{ProductType}}',
      'Dear {{POC}}, Please find the RFQ for {{Client}} - {{ProductType}} ({{RFQAttachLine}}). Kindly share your quotation/queries by {{ExpectedResponseDate}}. Please retain the Ticket/Thread reference in the subject. Regards, {{PMName}}.',
    ],
    [
      'INS-T02',
      'insurer',
      'Follow-up 1 - response pending',
      'Follow-up: [{{TicketID}} | {{ThreadID}}] {{Client}} - {{ProductType}}',
      'Dear {{POC}}, Following up on the RFQ shared on {{RFQSentDate}}. Please confirm whether the risk is under review and share any clarification required or expected quote timeline. Regards, {{PMName}}.',
    ],
    [
      'INS-T03',
      'insurer',
      'Follow-up 2 - quote pending',
      'Second follow-up: [{{TicketID}} | {{ThreadID}}] Quote pending - {{Client}}',
      'Dear {{POC}}, The quotation is still awaited. Please share the quote / current underwriting status and expected response time. Regards, {{PMName}}.',
    ],
    [
      'INS-T04',
      'insurer',
      'Insurer escalation - no response',
      'Escalation: [{{TicketID}} | {{ThreadID}}] RFQ response pending - {{Client}}',
      'Dear {{POC}}, We have not yet received a response on the attached RFQ despite earlier follow-ups. Request your support in confirming whether the risk can be quoted and the expected timeline. Regards, {{PMName}}.',
    ],
    [
      'INS-T06',
      'insurer',
      'Thread restarted - RFQ re-sent',
      '[{{TicketID}} | {{ThreadID}}] RFQ re-shared - {{Client}}',
      'Dear {{POC}}, Re-sharing the RFQ ({{RFQAttachLine}}). Reason: {{RestartReason}}. Regards, {{PMName}}.',
    ],
    [
      'RM-T01',
      'rm',
      'RFQ queries - clarification request',
      '[{{TicketID}}] Information needed before float - {{Client}}',
      'Hi {{RMFirst}}, before I can float RFQ V{{RFQVersion}} for {{Client}} I need the points below. Could you pick these up with {{SPOCFirst}}? {{GapList}}',
    ],
    [
      'INT-T01',
      'internal',
      'New ticket assigned',
      'New Placement Ticket {{TicketID}} assigned',
      '{{Client}} / {{ProductType}} has been assigned to you. Current status: {{Status}}. RFQ completeness: {{Completeness}}.',
    ],
    [
      'INT-T02',
      'internal',
      'Insurer SLA at risk / overdue',
      'Insurer response overdue - {{TicketID}} / {{Insurer}}',
      '{{Insurer}} has crossed {{SLAStage}}. Last action: {{LastAction}}. Suggested next action: {{NextAction}}.',
    ],
    [
      'INT-T03',
      'internal',
      'Third usable quote reached',
      '3 usable quotes - QCR generation started',
      'The quote threshold has been reached for {{TicketID}}. Automated follow-ups have stopped and the usable quote PDFs have been sent to Copycat.',
    ],
    [
      'INT-T04',
      'internal',
      'Copycat QCR generation failed',
      'QCR generation failed - {{TicketID}}',
      'Copycat could not generate QCR V{{QCRVersion}}: {{Error}}. Open the QCR tab and retry with Copycat.',
    ],
    [
      'INT-T06',
      'internal',
      'Ticket escalated to Placement Head',
      'Escalated - {{TicketID}}',
      'The SLA ladder is exhausted for {{TicketID}}. Ownership has moved to {{HeadName}}.',
    ],
  ];
  for (const [id, audience, trigger, subject, body] of templates) {
    await q(
      `INSERT INTO communication_templates(id, audience, trigger, subject_template, body_template, channels) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [id, audience, trigger, subject, body, audience === 'internal' ? ['in_app'] : ['mail']],
    );
  }
  // TODO(dev): SEED_FIXTURES=true -> insurers/branches/POCs + demo tickets from the prototype seeds

  await dataSource.destroy();
  console.log('seed complete');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
