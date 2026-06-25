const { buildCorsHeaders } = require('../lib/cors');

describe('CORS helper', () => {
  const originalAllowOrigins = process.env.CORS_ALLOWED_ORIGINS;
  const originalAllowOriginsAlt = process.env.CORS_ALLOW_ORIGINS;

  afterEach(() => {
    if (originalAllowOrigins === undefined) {
      delete process.env.CORS_ALLOWED_ORIGINS;
    } else {
      process.env.CORS_ALLOWED_ORIGINS = originalAllowOrigins;
    }

    if (originalAllowOriginsAlt === undefined) {
      delete process.env.CORS_ALLOW_ORIGINS;
    } else {
      process.env.CORS_ALLOW_ORIGINS = originalAllowOriginsAlt;
    }
  });

  it('defaults to wildcard when no allowlist is configured', () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    delete process.env.CORS_ALLOW_ORIGINS;

    const headers = buildCorsHeaders({ headers: { origin: 'https://example.com' } });

    expect(headers['Access-Control-Allow-Origin']).toBe('*');
    expect(headers['Access-Control-Allow-Methods']).toContain('GET');
    expect(headers['Access-Control-Allow-Headers']).toContain('Content-Type');
  });

  it('reflects the Origin header when it matches the allowlist', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://a.azurestaticapps.net, https://b.azurestaticapps.net';

    const headers = buildCorsHeaders({ headers: { origin: 'https://b.azurestaticapps.net' } });

    expect(headers['Access-Control-Allow-Origin']).toBe('https://b.azurestaticapps.net');
    expect(headers['Vary']).toBe('Origin');
  });

  it('omits Access-Control-Allow-Origin when Origin does not match the allowlist', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://a.azurestaticapps.net';

    const headers = buildCorsHeaders({ headers: { origin: 'https://evil.example.com' } });

    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('reads CORS_ALLOW_ORIGINS as fallback when CORS_ALLOWED_ORIGINS is not set', () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    process.env.CORS_ALLOW_ORIGINS = 'https://c.azurestaticapps.net';

    const headers = buildCorsHeaders({ headers: { origin: 'https://c.azurestaticapps.net' } });

    expect(headers['Access-Control-Allow-Origin']).toBe('https://c.azurestaticapps.net');
  });

  it('handles request with no Origin header (defaults to wildcard when no allowlist)', () => {
    delete process.env.CORS_ALLOWED_ORIGINS;

    const headers = buildCorsHeaders({ headers: {} });

    expect(headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('handles request with no headers object', () => {
    delete process.env.CORS_ALLOWED_ORIGINS;

    const headers = buildCorsHeaders(null);

    expect(headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('resolves Origin via lowercase header key fallback', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://a.azurestaticapps.net';

    // Pass headers with only a lowercase "origin" key (no "Origin")
    const headers = buildCorsHeaders({ headers: { origin: 'https://a.azurestaticapps.net' } });

    expect(headers['Access-Control-Allow-Origin']).toBe('https://a.azurestaticapps.net');
  });

  describe('withCorsHeaders', () => {
    it('merges CORS headers with existing headers', () => {
      const { withCorsHeaders } = require('../lib/cors');
      delete process.env.CORS_ALLOWED_ORIGINS;

      const result = withCorsHeaders(null, { 'Allow': 'GET,OPTIONS', 'Content-Type': 'application/json' });

      expect(result['Allow']).toBe('GET,OPTIONS');
      expect(result['Content-Type']).toBe('application/json');
      expect(result['Access-Control-Allow-Origin']).toBe('*');
    });

    it('works with no existing headers', () => {
      const { withCorsHeaders } = require('../lib/cors');
      delete process.env.CORS_ALLOWED_ORIGINS;

      const result = withCorsHeaders(null, undefined);

      expect(result['Access-Control-Allow-Origin']).toBe('*');
    });

    it('CORS headers override any existing Access-Control headers', () => {
      const { withCorsHeaders } = require('../lib/cors');
      delete process.env.CORS_ALLOWED_ORIGINS;

      const result = withCorsHeaders(null, { 'Access-Control-Allow-Origin': 'old-value' });

      expect(result['Access-Control-Allow-Origin']).toBe('*');
    });
  });
});
