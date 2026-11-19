/**
 * Shared email layer conversation key: `PLC-nnnn/TH-nn` for an insurer thread, `PLC-nnnn/RM` for RM mail on a
 * manual ticket. Replies are chained inside one conversation, whichever mailbox sends them.
 */
export function conversationRefFor(ticketNo: string, threadRef: string | null): string {
  return `${ticketNo}/${threadRef ?? 'RM'}`;
}
