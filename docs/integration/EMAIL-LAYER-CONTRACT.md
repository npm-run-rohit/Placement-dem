# Email Layer Contract v1

Contract between the shared email layer (repo `email-parser-scaffold`) and a product (first client: BimaPlacement).
This file is identical in both repos. The TypeScript in `contract.ts` is identical too:
`bimaplacement/apps/api/src/integrations/email-layer/contract.ts` and `email-parser-scaffold/email-parser/email-layer/contract.ts`.

## Rules

- **Send as the assigned user only (M5).** A sender with no connected, send-enabled mailbox gets 409 `MAILBOX_NOT_CONNECTED`. Final: no retry, no fallback sender.
- **Conversation refs:** `PLC-nnnn/TH-nn` for insurer threads, `PLC-nnnn/RM` for RM mail on manual tickets. Tag pattern `/\bPLC-\d{4,}\b/`.
- **Unanchored mail** (`conversationRef: null`) always goes to Manual Review and is never auto-applied (BR-046).
- **Idempotency:** a send repeated with the same `idempotencyKey` returns the original `SendResponse`. A delivery repeated with the same `deliveryId` is answered 2xx with no effect.
- **Own sends are not deliveries.** A message the layer sent for the product is never delivered back, even though it shows in the sender's SENT label.
- **One delivery per message.** A message seen in several connected mailboxes (CC'd colleagues) is delivered once, deduplicated on `rfcMessageId`; all mailboxes are listed in `seenInMailboxes`.
- **Staff messages:** `sentByStaff: true` marks a message sent by a connected colleague (not by the product and not by an external party).
- **Attachments** are passed as time-limited URLs. If a URL has expired when the product fetches it, the product answers 5xx so the layer retries with fresh URLs. The product never stores the mail without its attachments.

## Signature

Header `x-email-layer-signature: t=<unix seconds>,v1=<hex hmac-sha256 of "${t}.${rawBody}">`, one secret per product,
tolerance 300 s. Same scheme as `apps/api/src/integrations/bimasetu/hmac.ts`. It signs the raw request body in both directions.

```ts
export const SIGNATURE_HEADER = 'x-email-layer-signature';
export function signEmailLayer(rawBody: string, secret: string, t?: number): string;
export function verifyEmailLayerSignature(
  rawBody: string, header: string | undefined, secret: string, toleranceSec: number, nowSec?: number,
): boolean;
```

## Types

```ts
export interface SendRequest {
  product: string;
  idempotencyKey: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{ fileName: string; contentType: string; url: string }>;
  conversation: { ref: string; replyToMessageId?: string };
}

export interface SendResponse {
  rfcMessageId: string;
  gmailMessageId: string;
  gmailThreadId: string;
  sentAt: string;
}

export interface DeliveryPayload {
  deliveryId: string;
  product: string;
  conversationRef: string | null;
  rootMessageId: string;
  message: {
    rfcMessageId: string;
    inReplyTo: string | null;
    references: string[];
    from: string;
    to: string[];
    cc: string[];
    subject: string;
    textBody: string;
    htmlBody: string | null;
    sentAt: string;
    seenInMailboxes: string[];
    sentByStaff: boolean;
    attachments: Array<{ fileName: string; contentType: string; size: number; url: string }>;
  };
}
```

## Endpoints

| Call | Answers |
|---|---|
| `POST /email-layer/v1/messages` (product to layer) | 200 `SendResponse`; 401 bad signature; 409 `{ "code": "MAILBOX_NOT_CONNECTED" }`; 422 bad request |
| `GET /email-layer/v1/health?product=placement` | `{ "ok": boolean, "mailboxesWithoutSend": string[] }` |
| `POST <product webhook>` (layer to product) | 2xx delivered; 4xx rejected (final); 5xx or timeout retried |

When a reply is sent from a mailbox that has no Gmail thread for the conversation (for example after a ticket is reassigned),
the layer sends with `In-Reply-To` / `References` and no Gmail `threadId`; the conversation stays the same.

## Examples

### Send request

```json
{
  "product": "placement",
  "idempotencyKey": "outbox-8f1c2d",
  "from": "bhupendra@bimakavach.com",
  "to": ["underwriting@insurer.example", "poc2@insurer.example"],
  "cc": [],
  "subject": "[PLC-1042 | TH-03] RFQ for Property - Acme Industries",
  "text": "Dear team, please find the RFQ attached.",
  "attachments": [
    { "fileName": "rfq.xlsx", "contentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "url": "https://files.example/signed/abc" }
  ],
  "conversation": { "ref": "PLC-1042/TH-03" }
}
```

### Send response

```json
{
  "rfcMessageId": "<CAF123@mail.gmail.com>",
  "gmailMessageId": "18c0a1b2c3d4e5f6",
  "gmailThreadId": "18c0a1b2c3d4e5f0",
  "sentAt": "2026-11-04T09:30:00.000Z"
}
```

### Anchored delivery (insurer reply on a known conversation)

```json
{
  "deliveryId": "dlv_01HF3K",
  "product": "placement",
  "conversationRef": "PLC-1042/TH-03",
  "rootMessageId": "<CAF123@mail.gmail.com>",
  "message": {
    "rfcMessageId": "<REPLY456@insurer.example>",
    "inReplyTo": "<CAF123@mail.gmail.com>",
    "references": ["<CAF123@mail.gmail.com>"],
    "from": "underwriting@insurer.example",
    "to": ["bhupendra@bimakavach.com"],
    "cc": [],
    "subject": "Re: [PLC-1042 | TH-03] RFQ for Property - Acme Industries",
    "textBody": "Quote attached.",
    "htmlBody": null,
    "sentAt": "2026-11-04T11:02:00.000Z",
    "seenInMailboxes": ["bhupendra@bimakavach.com"],
    "sentByStaff": false,
    "attachments": [
      { "fileName": "quote.pdf", "contentType": "application/pdf", "size": 183204, "url": "https://files.example/signed/def" }
    ]
  }
}
```

### Unanchored delivery (no ref, goes to Manual Review)

```json
{
  "deliveryId": "dlv_01HF3M",
  "product": "placement",
  "conversationRef": null,
  "rootMessageId": "<NEW789@insurer.example>",
  "message": {
    "rfcMessageId": "<NEW789@insurer.example>",
    "inReplyTo": null,
    "references": [],
    "from": "someone@insurer.example",
    "to": ["bhupendra@bimakavach.com"],
    "cc": [],
    "subject": "Quote for Acme",
    "textBody": "Please see our quote.",
    "htmlBody": "<p>Please see our quote.</p>",
    "sentAt": "2026-11-04T12:15:00.000Z",
    "seenInMailboxes": ["bhupendra@bimakavach.com"],
    "sentByStaff": false,
    "attachments": []
  }
}
```

### Staff delivery (connected colleague replied from their own mailbox)

```json
{
  "deliveryId": "dlv_01HF3P",
  "product": "placement",
  "conversationRef": "PLC-1042/TH-03",
  "rootMessageId": "<CAF123@mail.gmail.com>",
  "message": {
    "rfcMessageId": "<STAFF321@mail.gmail.com>",
    "inReplyTo": "<REPLY456@insurer.example>",
    "references": ["<CAF123@mail.gmail.com>", "<REPLY456@insurer.example>"],
    "from": "colleague@bimakavach.com",
    "to": ["underwriting@insurer.example"],
    "cc": ["bhupendra@bimakavach.com"],
    "subject": "Re: [PLC-1042 | TH-03] RFQ for Property - Acme Industries",
    "textBody": "Sharing the revised sum insured.",
    "htmlBody": null,
    "sentAt": "2026-11-04T13:40:00.000Z",
    "seenInMailboxes": ["colleague@bimakavach.com", "bhupendra@bimakavach.com"],
    "sentByStaff": true,
    "attachments": []
  }
}
```

On a thread waiting on us, a staff delivery from a connected colleague runs the same workflow as an in-app reply (`replyToInsurer`) but sends no mail.
