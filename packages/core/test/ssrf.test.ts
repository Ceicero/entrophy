import { describe, expect, it } from 'vitest';
import { assertPublicHttpUrl, isPrivateIp, SsrfError } from '../src/utils/ssrf';

function lookupTo(...addresses: string[]) {
  return async () => addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
}

describe('isPrivateIp', () => {
  it('flags private/loopback/link-local/metadata/CGNAT IPv4 ranges', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.5')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('100.64.0.1')).toBe(true);
  });

  it('flags IPv6 loopback/link-local/ULA/multicast', () => {
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
    expect(isPrivateIp('fd00::1')).toBe(true);
    expect(isPrivateIp('ff02::1')).toBe(true);
  });

  it('does not flag ordinary public addresses', () => {
    expect(isPrivateIp('93.184.216.34')).toBe(false);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('2001:4860:4860::8888')).toBe(false);
  });
});

describe('assertPublicHttpUrl', () => {
  it('rejects non-http(s) protocols', async () => {
    await expect(assertPublicHttpUrl('ftp://example.com/file')).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects URLs with embedded credentials', async () => {
    await expect(
      assertPublicHttpUrl('https://user:pass@example.com', { lookup: lookupTo('93.184.216.34') }),
    ).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects localhost by hostname before any DNS lookup', async () => {
    await expect(assertPublicHttpUrl('https://localhost/webhook')).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects a literal private IPv4 host', async () => {
    await expect(assertPublicHttpUrl('https://127.0.0.1/webhook', { allowPorts: [443] })).rejects.toBeInstanceOf(
      SsrfError,
    );
    await expect(assertPublicHttpUrl('https://10.0.0.5/webhook')).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects the cloud metadata IP', async () => {
    await expect(assertPublicHttpUrl('https://169.254.169.254/latest/meta-data')).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects a literal IPv6 link-local host', async () => {
    await expect(assertPublicHttpUrl('https://[fe80::1]/x')).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects a hostname that resolves only to private addresses', async () => {
    await expect(
      assertPublicHttpUrl('https://internal.example.com/x', { lookup: lookupTo('10.1.2.3') }),
    ).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects disallowed ports', async () => {
    await expect(
      assertPublicHttpUrl('https://example.com:8080/x', { lookup: lookupTo('93.184.216.34') }),
    ).rejects.toBeInstanceOf(SsrfError);
  });

  it('accepts a public https URL resolving to a public address', async () => {
    const url = await assertPublicHttpUrl('https://example.com/webhook', { lookup: lookupTo('93.184.216.34') });
    expect(url.hostname).toBe('example.com');
  });

  it('rejects plain http unless allowHttp is set, then accepts it', async () => {
    await expect(
      assertPublicHttpUrl('http://example.com/webhook', { lookup: lookupTo('93.184.216.34') }),
    ).rejects.toBeInstanceOf(SsrfError);

    const url = await assertPublicHttpUrl('http://example.com/webhook', {
      allowHttp: true,
      lookup: lookupTo('93.184.216.34'),
    });
    expect(url.protocol).toBe('http:');
  });
});
