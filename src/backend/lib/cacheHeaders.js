/**
 * Builds a `Cache-Control` header for a public, cacheable response.
 *
 * Only successful (2xx) GET responses should be cached — error responses
 * must never carry this header so clients/CDNs always revalidate them.
 *
 * @param {number} maxAgeSeconds - freshness lifetime in seconds.
 * @returns {{ 'Cache-Control': string }}
 */
function cacheControlHeaders(maxAgeSeconds) {
  return { 'Cache-Control': `public, max-age=${maxAgeSeconds}` };
}

module.exports = {
  cacheControlHeaders
};
