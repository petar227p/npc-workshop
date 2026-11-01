import { describe, expect, it } from 'vitest';
import { request } from 'node:http';
import { verificationPage } from './verification.mjs';

describe('temporary local verification form', () => {
  it('exposes credentials only to a same-origin POST and closes cleanly', async () => {
    const page = await verificationPage({ worldId: 'world_1', token: 'local-secret' });
    try {
      expect(page.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(page.url).not.toContain('local-secret');
      const entry = await fetch(page.url); expect(entry.headers.get('cache-control')).toBe('no-store');
      expect(await entry.text()).not.toContain('local-secret');
      const denied = await fetch(`${page.url}/credentials`, { method: 'POST', headers: { Origin: 'https://other.test' } });
      expect(denied.status).toBe(403); expect(await denied.text()).not.toContain('local-secret');
      expect((await fetch(`${page.url}/credentials`)).status).toBe(403);
      expect((await fetch(`${page.url}/credentials`, { method: 'POST', headers: { Origin: page.url } })).status).toBe(403);
      const allowed = await fetch(`${page.url}/credentials`, { method: 'POST', headers: { Origin: page.url, 'X-Verification-UI': '1' } });
      expect(allowed.status).toBe(200); expect(await allowed.text()).toContain('local-secret');
      expect(allowed.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect((await fetch(page.url, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403);
      const badHost = await new Promise((resolve, reject) => {
        request(page.url, { headers: { Host: 'evil.test' } }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject).end();
      });
      expect(badHost).toBe(403);
    } finally { page.close(); }
    await expect(fetch(page.url)).rejects.toThrow();
  });
});
