const { cacheControlHeaders } = require('../lib/cacheHeaders');

describe('cacheControlHeaders', () => {
  it('builds a public max-age Cache-Control header for the given TTL', () => {
    expect(cacheControlHeaders(300)).toEqual({ 'Cache-Control': 'public, max-age=300' });
  });

  it('supports different TTLs per endpoint', () => {
    expect(cacheControlHeaders(600)).toEqual({ 'Cache-Control': 'public, max-age=600' });
    expect(cacheControlHeaders(1800)).toEqual({ 'Cache-Control': 'public, max-age=1800' });
  });
});
