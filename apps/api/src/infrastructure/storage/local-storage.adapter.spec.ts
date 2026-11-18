import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageAdapter } from './local-storage.adapter';

describe('LocalStorageAdapter', () => {
  const root = mkdtempSync(join(tmpdir(), 'placement-storage-'));
  const storage = new LocalStorageAdapter(root, 'http://localhost/api');

  it('stores and reads inside its folder', async () => {
    await storage.put({ key: 'tickets/a/rfq.xlsx', body: Buffer.from('x'), contentType: 'text/plain' });
    const chunks: Buffer[] = [];
    for await (const c of await storage.get('tickets/a/rfq.xlsx')) chunks.push(Buffer.from(c));
    expect(Buffer.concat(chunks).toString()).toBe('x');
  });

  it('refuses keys that escape the folder', async () => {
    await expect(storage.get('../../etc/passwd')).rejects.toThrow(/escapes/);
    await expect(
      storage.put({ key: '../outside.txt', body: Buffer.from('x'), contentType: 'text/plain' }),
    ).rejects.toThrow(/escapes/);
  });
});
