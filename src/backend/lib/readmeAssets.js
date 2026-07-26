const { posix } = require('path');

const ABSOLUTE_URL_REGEX = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Returns the repo-relative directory a README lives in, with a trailing
 * slash, or '' for a repo-root README. GitHub allows a repo's displayed
 * README to live in the root, docs/, or .github/, and relative image paths
 * inside it are resolved against that directory, not the repo root.
 * @param {string|null|undefined} readmePath - path of the README file as
 *   returned by the GitHub contents API (e.g. "docs/README.md")
 * @returns {string} directory prefix, e.g. "docs/" or ""
 */
function getReadmeDir(readmePath) {
  if (!readmePath) {
    return '';
  }
  const dir = posix.dirname(readmePath);
  return !dir || dir === '.' ? '' : `${dir}/`;
}

function isAbsoluteUrl(url) {
  return ABSOLUTE_URL_REGEX.test(url.trim());
}

function resolveRelativeUrl(relativeUrl, baseUrl) {
  try {
    return new URL(relativeUrl, baseUrl).toString();
  } catch (error) {
    return relativeUrl;
  }
}

function rewriteSrc(attrs, baseUrl) {
  return attrs.replace(/(\ssrc\s*=\s*)("([^"]*)"|'([^']*)')/gi, (match, prefix, quoted, dq, sq) => {
    const value = dq !== undefined ? dq : sq;
    const quote = quoted[0];
    if (!value || isAbsoluteUrl(value) || value.startsWith('data:')) {
      return match;
    }
    return `${prefix}${quote}${resolveRelativeUrl(value, baseUrl)}${quote}`;
  });
}

function rewriteSrcset(attrs, baseUrl) {
  return attrs.replace(/(\ssrcset\s*=\s*)("([^"]*)"|'([^']*)')/gi, (match, prefix, quoted, dq, sq) => {
    const value = dq !== undefined ? dq : sq;
    const quote = quoted[0];
    if (!value) {
      return match;
    }

    const rewritten = value
      .split(',')
      .map((candidate) => {
        const trimmed = candidate.trim();
        if (!trimmed) {
          return trimmed;
        }
        const spaceIndex = trimmed.indexOf(' ');
        const url = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
        const descriptor = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex);
        if (isAbsoluteUrl(url) || url.startsWith('data:')) {
          return trimmed;
        }
        return `${resolveRelativeUrl(url, baseUrl)}${descriptor}`;
      })
      .join(', ');

    return `${prefix}${quote}${rewritten}${quote}`;
  });
}

/**
 * Rewrites repo-relative image sources in GitHub-rendered README HTML to
 * absolute raw.githubusercontent.com URLs.
 *
 * GitHub's HTML render of a README keeps same-repo image paths relative
 * (e.g. src="images/foo.png"), which only resolve correctly on github.com
 * itself. Embedded on another origin, the browser resolves them against
 * that origin instead, so the images 404. Only <img>/<source> src and
 * srcset are rewritten; already-absolute URLs (including camo-proxied
 * badges) are left untouched.
 * @param {string} html - README HTML as returned by the GitHub API
 * @param {string} owner - Repository owner
 * @param {string} repoName - Repository name
 * @param {string} ref - Branch, tag, or commit the README was fetched at
 * @param {string} [readmePath] - path of the README file within the repo
 *   (e.g. "docs/README.md"), used to resolve relative asset paths against
 *   the README's actual directory instead of assuming the repo root
 * @returns {string} HTML with relative asset URLs rewritten to absolute URLs
 */
function rewriteRelativeAssetUrls(html, owner, repoName, ref, readmePath) {
  if (!html) {
    return html;
  }

  const baseUrl = `https://raw.githubusercontent.com/${owner}/${repoName}/${ref}/${getReadmeDir(readmePath)}`;

  return html.replace(/<(img|source)\b([^>]*)>/gi, (match, tag, attrs) => {
    const rewrittenAttrs = rewriteSrcset(rewriteSrc(attrs, baseUrl), baseUrl);
    return `<${tag}${rewrittenAttrs}>`;
  });
}

module.exports = {
  rewriteRelativeAssetUrls
};
