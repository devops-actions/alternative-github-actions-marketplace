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
});
