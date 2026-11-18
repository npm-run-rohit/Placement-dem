import type { ApiError } from '@bimaplacement/contracts';
import { authHeaders } from './auth';

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? '/api/v1';

export class ApiRequestError extends Error {
  public readonly error: ApiError;
  constructor(error: ApiError) {
    const message = messageText(error.message);
    super(message);
    this.error = { ...error, message };
  }
}

/** class-validator answers `message` as an array of strings; show it as one readable line. */
function messageText(m: unknown): string {
  if (Array.isArray(m)) return m.map(String).join('; ');
  if (typeof m === 'string' && m) return m;
  return 'Request failed';
}

/** Error body of a failed response; a non-JSON body (proxy page, empty) still gives a readable message. */
async function errorOf(res: Response): Promise<ApiRequestError> {
  const text = await res.text().catch(() => '');
  let body: Partial<ApiError> | null = null;
  try {
    body = text ? (JSON.parse(text) as Partial<ApiError>) : null;
  } catch {
    body = null;
  }
  return new ApiRequestError({
    statusCode: body?.statusCode ?? res.status,
    code: body?.code ?? 'HTTP_ERROR',
    message: messageText(body?.message ?? (res.statusText || `HTTP ${res.status}`)),
    details: body?.details,
    correlationId: body?.correlationId,
  });
}

/** Success body: an empty 200/201 (a command that returns nothing) is `undefined`, not a JSON parse error. */
async function bodyOf<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...authHeaders(),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) throw await errorOf(res);
  return bodyOf<T>(res);
}

/** Multipart upload to POST /documents (RFQ Excel, mandate proof, manual QCR, quote re-upload). */
export async function uploadDocument(
  file: File,
  kind: string,
  ticketId?: string,
): Promise<{ id: string; fileName: string }> {
  const form = new FormData();
  form.append('file', file);
  form.append('kind', kind);
  if (ticketId) form.append('ticketId', ticketId);
  const res = await fetch(`${BASE}/documents`, { method: 'POST', headers: authHeaders(), body: form });
  if (!res.ok) throw await errorOf(res);
  return bodyOf(res);
}

/** Opens a stored document (signed URL from the API) in a new tab. */
/** View opens the file in a new tab (inline); Download saves it. */
export async function openDocument(documentId: string, mode: 'view' | 'download' = 'download') {
  const { url } = await api<{ url: string }>(
    `/documents/${documentId}/download-url${mode === 'view' ? '?inline=1' : ''}`,
  );
  window.open(url, '_blank', 'noopener');
}
