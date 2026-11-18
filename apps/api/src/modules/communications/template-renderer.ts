/** Minimal {{Placeholder}} renderer for the Communication Template master (M6 s12). Missing keys render as ''. */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (vars[k] ?? '').toString());
}

/** Subject reference kept on every insurer mail for inbound mapping (FR-050, BR-033). */
export const insurerSubjectRef = (ticketNo: string, threadRef: string) => `[${ticketNo} | ${threadRef}]`;
