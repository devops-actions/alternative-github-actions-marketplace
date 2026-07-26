const { rewriteRelativeAssetUrls } = require('../lib/readmeAssets');

describe('rewriteRelativeAssetUrls', () => {
  const owner = 'step-security';
  const repoName = 'harden-runner';
  const ref = 'main';

  it('rewrites a relative img src to an absolute raw.githubusercontent.com URL', () => {
    const html = '<img alt="Dark Banner" src="images/harden-runner-new.png" width="400">';
    const result = rewriteRelativeAssetUrls(html, owner, repoName, ref);

    expect(result).toContain(
      'src="https://raw.githubusercontent.com/step-security/harden-runner/main/images/harden-runner-new.png"'
    );
  });

  it('leaves already-absolute img src untouched', () => {
    const html = '<img src="https://camo.githubusercontent.com/abc" alt="badge">';
    const result = rewriteRelativeAssetUrls(html, owner, repoName, ref);

    expect(result).toBe(html);
  });

  it('leaves protocol-relative and data URIs untouched', () => {
    const html = '<img src="//example.com/foo.png"><img src="data:image/png;base64,AAA">';
    const result = rewriteRelativeAssetUrls(html, owner, repoName, ref);

    expect(result).toBe(html);
  });

  it('rewrites relative srcset candidates while preserving descriptors', () => {
    const html = '<source srcset="images/a.png 1x, images/b.png 2x, https://example.com/c.png 3x">';
    const result = rewriteRelativeAssetUrls(html, owner, repoName, ref);

    expect(result).toBe(
      '<source srcset="https://raw.githubusercontent.com/step-security/harden-runner/main/images/a.png 1x, ' +
      'https://raw.githubusercontent.com/step-security/harden-runner/main/images/b.png 2x, https://example.com/c.png 3x">'
    );
  });

  it('resolves relative paths using the given ref', () => {
    const html = '<img src="images/case-study.png">';
    const result = rewriteRelativeAssetUrls(html, owner, repoName, 'v2.1.0');

    expect(result).toContain(
      'src="https://raw.githubusercontent.com/step-security/harden-runner/v2.1.0/images/case-study.png"'
    );
  });

  it('does not touch non-img/source tags such as anchors', () => {
    const html = '<a href="docs/how-it-works.md">How it works</a>';
    const result = rewriteRelativeAssetUrls(html, owner, repoName, ref);

    expect(result).toBe(html);
  });

  it('returns falsy input unchanged', () => {
    expect(rewriteRelativeAssetUrls('', owner, repoName, ref)).toBe('');
    expect(rewriteRelativeAssetUrls(null, owner, repoName, ref)).toBe(null);
  });

  describe('when the README lives in a subdirectory', () => {
    it('resolves relative paths against the README directory, not the repo root', () => {
      const html = '<img src="images/foo.png">';
      const result = rewriteRelativeAssetUrls(html, owner, repoName, ref, 'docs/README.md');

      expect(result).toContain(
        'src="https://raw.githubusercontent.com/step-security/harden-runner/main/docs/images/foo.png"'
      );
    });

    it('handles a nested .github README', () => {
      const html = '<img src="assets/banner.png">';
      const result = rewriteRelativeAssetUrls(html, owner, repoName, ref, '.github/README.md');

      expect(result).toContain(
        'src="https://raw.githubusercontent.com/step-security/harden-runner/main/.github/assets/banner.png"'
      );
    });

    it('falls back to repo root when readmePath is not provided', () => {
      const html = '<img src="images/foo.png">';
      const result = rewriteRelativeAssetUrls(html, owner, repoName, ref);

      expect(result).toContain(
        'src="https://raw.githubusercontent.com/step-security/harden-runner/main/images/foo.png"'
      );
    });

    it('treats a root-level readmePath the same as no path', () => {
      const html = '<img src="images/foo.png">';
      const result = rewriteRelativeAssetUrls(html, owner, repoName, ref, 'README.md');

      expect(result).toContain(
        'src="https://raw.githubusercontent.com/step-security/harden-runner/main/images/foo.png"'
      );
    });
  });
});
