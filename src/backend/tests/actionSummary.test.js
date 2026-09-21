const { toActionSummary } = require('../lib/actionSummary');

describe('toActionSummary', () => {
  const fullPayload = {
    owner: 'actions',
    name: 'checkout',
    actionType: { actionType: 'Node', nodeVersion: '20', fileFound: 'action.yml' },
    repoInfo: { updated_at: '2026-07-20T10:00:00Z', archived: false, disabled: false },
    dependents: { dependents: '1,000', dependentsLastUpdated: '2026-07-01' },
    releaseInfo: ['v4.2.0', 'v4.1.0'],
    description: 'Checkout a Git repository so a workflow can access it',
    verified: true,
    ossf: true,
    openssf_score: 8.4,
    vulnerabilityStatus: { critical: 1, high: 2, lastUpdated: '2026-07-01' },
    // Fields the list pages never read; must not survive the projection.
    versionShaMap: { 'v4.2.0': 'abc123' },
    tagInfo: ['v4', 'v4.2'],
    dependabot: { alerts: 3, open: 1 },
    repoSize: 4096
  };

  it('keeps every field the list pages read', () => {
    const summary = toActionSummary(fullPayload);

    expect(summary).toEqual({
      owner: 'actions',
      name: 'checkout',
      actionType: { actionType: 'Node', nodeVersion: '20' },
      repoInfo: { updated_at: '2026-07-20T10:00:00Z', archived: false },
      dependents: { dependents: '1,000' },
      releaseInfo: ['v4.2.0'],
      description: 'Checkout a Git repository so a workflow can access it',
      verified: true,
      ossf: true,
      ossfScore: 8.4,
      vulnerabilityStatus: { critical: 1, high: 2 }
    });
  });

  it('drops fields only the detail page needs', () => {
    const summary = toActionSummary(fullPayload);

    expect(summary).not.toHaveProperty('versionShaMap');
    expect(summary).not.toHaveProperty('tagInfo');
    expect(summary).not.toHaveProperty('dependabot');
    expect(summary).not.toHaveProperty('repoSize');
  });

  it('returns null when owner or name is missing, since the UI cannot link to it', () => {
    expect(toActionSummary({ name: 'checkout' })).toBeNull();
    expect(toActionSummary({ owner: 'actions' })).toBeNull();
    expect(toActionSummary({ owner: '  ', name: 'checkout' })).toBeNull();
    expect(toActionSummary(null)).toBeNull();
    expect(toActionSummary('not an object')).toBeNull();
  });

  it('reads the OpenSSF score from any casing the pipeline has used', () => {
    expect(toActionSummary({ owner: 'o', name: 'n', openssf_score: 7.1 }).ossfScore).toBe(7.1);
    expect(toActionSummary({ owner: 'o', name: 'n', ossfScore: 6.2 }).ossfScore).toBe(6.2);
    expect(toActionSummary({ owner: 'o', name: 'n', ossf_score: 5.3 }).ossfScore).toBe(5.3);
    expect(toActionSummary({ owner: 'o', name: 'n', openssf_score: '4.4' }).ossfScore).toBe(4.4);
  });

  it('reports ossf true whenever a numeric score exists, even without the flag', () => {
    const summary = toActionSummary({ owner: 'o', name: 'n', openssf_score: 3.2 });
    expect(summary.ossf).toBe(true);
  });

  it('defaults a missing score to 0 and ossf to false', () => {
    const summary = toActionSummary({ owner: 'o', name: 'n' });
    expect(summary.ossfScore).toBe(0);
    expect(summary.ossf).toBe(false);
  });

  it('accepts the several shapes verified has been stored as', () => {
    expect(toActionSummary({ owner: 'o', name: 'n', verified: true }).verified).toBe(true);
    expect(toActionSummary({ owner: 'o', name: 'n', verified: 1 }).verified).toBe(true);
    expect(toActionSummary({ owner: 'o', name: 'n', verified: 'true' }).verified).toBe(true);
    expect(toActionSummary({ owner: 'o', name: 'n', verified: 'TRUE' }).verified).toBe(true);
    expect(toActionSummary({ owner: 'o', name: 'n', verified: false }).verified).toBe(false);
    expect(toActionSummary({ owner: 'o', name: 'n', verified: 'no' }).verified).toBe(false);
    expect(toActionSummary({ owner: 'o', name: 'n' }).verified).toBe(false);
  });

  it('takes the tag name when releaseInfo holds release objects rather than strings', () => {
    const summary = toActionSummary({
      owner: 'o',
      name: 'n',
      releaseInfo: [{ tag_name: 'v2.0.0', id: 1 }]
    });
    expect(summary.releaseInfo).toEqual(['v2.0.0']);
  });

  it('falls back to an empty release when releaseInfo is missing or unusable', () => {
    expect(toActionSummary({ owner: 'o', name: 'n' }).releaseInfo).toEqual([]);
    expect(toActionSummary({ owner: 'o', name: 'n', releaseInfo: [] }).releaseInfo).toEqual([]);
    expect(toActionSummary({ owner: 'o', name: 'n', releaseInfo: [{}] }).releaseInfo).toEqual([]);
  });

  it('normalises a numeric dependents count to the string the UI parses', () => {
    expect(toActionSummary({ owner: 'o', name: 'n', dependents: { dependents: 42 } }).dependents)
      .toEqual({ dependents: '42' });
  });

  it('preserves the "+" suffix that drives dependents sorting', () => {
    expect(toActionSummary({ owner: 'o', name: 'n', dependents: { dependents: '999+' } }).dependents)
      .toEqual({ dependents: '999+' });
  });

  it('defaults dependents to "0" when absent', () => {
    expect(toActionSummary({ owner: 'o', name: 'n' }).dependents).toEqual({ dependents: '0' });
  });

  it('coerces archived to a strict boolean so the filter cannot be fooled by truthy values', () => {
    expect(toActionSummary({ owner: 'o', name: 'n', repoInfo: { archived: true } }).repoInfo.archived).toBe(true);
    expect(toActionSummary({ owner: 'o', name: 'n', repoInfo: { archived: 'yes' } }).repoInfo.archived).toBe(false);
    expect(toActionSummary({ owner: 'o', name: 'n' }).repoInfo.archived).toBe(false);
  });

  it('defaults vulnerability counts to 0 when the scan has not run', () => {
    const summary = toActionSummary({ owner: 'o', name: 'n' });
    expect(summary.vulnerabilityStatus).toEqual({ critical: 0, high: 0 });
  });

  it('trims whitespace around owner and name', () => {
    const summary = toActionSummary({ owner: '  actions  ', name: '  checkout  ' });
    expect(summary.owner).toBe('actions');
    expect(summary.name).toBe('checkout');
  });

  it('reports null when the pipeline has not populated a description yet', () => {
    expect(toActionSummary({ owner: 'o', name: 'n' }).description).toBeNull();
    expect(toActionSummary({ owner: 'o', name: 'n', description: '   ' }).description).toBeNull();
    expect(toActionSummary({ owner: 'o', name: 'n', description: 42 }).description).toBeNull();
  });

  it('trims a description and truncates it to 200 characters', () => {
    expect(toActionSummary({ owner: 'o', name: 'n', description: '  Lint your Dockerfiles  ' }).description)
      .toBe('Lint your Dockerfiles');

    const long = 'x'.repeat(250);
    const summary = toActionSummary({ owner: 'o', name: 'n', description: long });
    expect(summary.description).toHaveLength(200);
    expect(summary.description.endsWith('…')).toBe(true);
  });
});
