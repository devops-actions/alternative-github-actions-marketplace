import { describe, expect, it } from 'vitest';

import { formatPinnedRef, isRefError, isShaLike, parseActionRef } from '../src/data/actionRef';

function parsed(input: string) {
  const result = parseActionRef(input);
  if (isRefError(result)) {
    throw new Error(`expected a parse success for "${input}", got: ${result.error}`);
  }
  return result;
}

function failure(input: unknown): string {
  const result = parseActionRef(input);
  if (!isRefError(result)) {
    throw new Error(`expected a parse failure for "${String(input)}"`);
  }
  return result.error;
}

describe('parseActionRef', () => {
  it('parses owner/name', () => {
    expect(parsed('actions/checkout')).toMatchObject({
      owner: 'actions',
      name: 'checkout',
      subPath: null,
      version: null,
      isSha: false
    });
  });

  it('parses a tag pin', () => {
    expect(parsed('actions/checkout@v4')).toMatchObject({ version: 'v4', isSha: false });
  });

  it('lowercases owner and name but keeps the version as written', () => {
    expect(parsed('Actions/CheckOut@V4.1.1')).toMatchObject({
      owner: 'actions',
      name: 'checkout',
      version: 'V4.1.1'
    });
  });

  it('parses a composite sub-path', () => {
    expect(parsed('github/codeql-action/analyze@v3')).toMatchObject({
      owner: 'github',
      name: 'codeql-action',
      subPath: 'analyze',
      version: 'v3'
    });
  });

  it('parses a multi-segment sub-path', () => {
    expect(parsed('owner/repo/a/b@v1').subPath).toBe('a/b');
  });

  it('recognises a full commit SHA pin', () => {
    expect(parsed('actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683')).toMatchObject({ isSha: true });
  });

  it('recognises a short commit SHA pin', () => {
    expect(parsed('actions/checkout@11bd719')).toMatchObject({ isSha: true });
  });

  it('does not treat a version tag as a SHA', () => {
    expect(parsed('actions/checkout@v4.1.1').isSha).toBe(false);
  });

  it('trims surrounding whitespace', () => {
    expect(parsed('  actions/checkout@v4  ')).toMatchObject({ raw: 'actions/checkout@v4', version: 'v4' });
  });

  it('treats an empty version after @ as unpinned', () => {
    expect(parsed('actions/checkout@').version).toBeNull();
  });

  it('rejects a reference without an owner', () => {
    expect(failure('checkout')).toMatch(/owner\/name/);
  });

  it('rejects empty owner or name segments', () => {
    expect(failure('/checkout')).toMatch(/cannot be empty/);
    expect(failure('actions/')).toMatch(/cannot be empty/);
  });

  it('rejects non-string and empty input', () => {
    expect(failure(undefined)).toMatch(/non-empty string/);
    expect(failure('')).toMatch(/non-empty string/);
    expect(failure('   ')).toMatch(/non-empty string/);
    expect(failure(42)).toMatch(/non-empty string/);
  });

  it('explains why a docker reference is not a marketplace action', () => {
    expect(failure('docker://alpine:3.19')).toMatch(/Docker image references/);
  });

  it('explains why a local path action is not a marketplace action', () => {
    expect(failure('./.github/actions/build')).toMatch(/Local path actions/);
    expect(failure('../shared/action')).toMatch(/Local path actions/);
  });
});

describe('isShaLike', () => {
  it('accepts 7 to 40 hex characters', () => {
    expect(isShaLike('abc1234')).toBe(true);
    expect(isShaLike('a'.repeat(40))).toBe(true);
  });

  it('rejects shorter, longer, and non-hex values', () => {
    expect(isShaLike('abc123')).toBe(false);
    expect(isShaLike('a'.repeat(41))).toBe(false);
    expect(isShaLike('v4.1.1')).toBe(false);
  });
});

describe('formatPinnedRef', () => {
  it('appends the version as a comment', () => {
    expect(formatPinnedRef('actions', 'checkout', null, 'abc123def456', 'v4.1.1'))
      .toBe('actions/checkout@abc123def456 # v4.1.1');
  });

  it('omits the comment when there is no version', () => {
    expect(formatPinnedRef('actions', 'checkout', null, 'abc123def456', null))
      .toBe('actions/checkout@abc123def456');
  });

  it('includes the sub-path', () => {
    expect(formatPinnedRef('github', 'codeql-action', 'analyze', 'abc123def456', 'v3'))
      .toBe('github/codeql-action/analyze@abc123def456 # v3');
  });
});
