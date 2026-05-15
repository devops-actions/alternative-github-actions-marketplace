'use strict';

const { parseActionRef, parseActionRefs } = require('../lib/inputParser');

describe('parseActionRef', () => {
  test('parses owner/name@version', () => {
    const result = parseActionRef('actions/checkout@v4');
    expect(result).toEqual({
      owner: 'actions',
      name: 'checkout',
      version: 'v4',
      isHash: false,
      subPath: null,
      raw: 'actions/checkout@v4'
    });
  });

  test('parses owner/name without version', () => {
    const result = parseActionRef('actions/checkout');
    expect(result).toEqual({
      owner: 'actions',
      name: 'checkout',
      version: null,
      isHash: false,
      subPath: null,
      raw: 'actions/checkout'
    });
  });

  test('parses owner/name@sha (short hash)', () => {
    const result = parseActionRef('actions/checkout@abc1234');
    expect(result).toEqual({
      owner: 'actions',
      name: 'checkout',
      version: 'abc1234',
      isHash: true,
      subPath: null,
      raw: 'actions/checkout@abc1234'
    });
  });

  test('parses owner/name@sha (full 40-char hash)', () => {
    const sha = '11bd71901bbe5b1630ceea73d27597364c9af683';
    const result = parseActionRef(`actions/checkout@${sha}`);
    expect(result.isHash).toBe(true);
    expect(result.version).toBe(sha);
  });

  test('parses composite action with subpath', () => {
    const result = parseActionRef('github/codeql-action/analyze@v3');
    expect(result).toEqual({
      owner: 'github',
      name: 'codeql-action',
      version: 'v3',
      isHash: false,
      subPath: 'analyze',
      raw: 'github/codeql-action/analyze@v3'
    });
  });

  test('normalizes owner and name to lowercase', () => {
    const result = parseActionRef('Actions/Checkout@V4');
    expect(result.owner).toBe('actions');
    expect(result.name).toBe('checkout');
    expect(result.version).toBe('V4');
  });

  test('trims whitespace', () => {
    const result = parseActionRef('  actions/checkout@v4  ');
    expect(result.owner).toBe('actions');
    expect(result.name).toBe('checkout');
  });

  test('returns error for empty string', () => {
    const result = parseActionRef('');
    expect(result.error).toBeDefined();
  });

  test('returns error for null', () => {
    const result = parseActionRef(null);
    expect(result.error).toBeDefined();
  });

  test('returns error for single segment (no slash)', () => {
    const result = parseActionRef('checkout');
    expect(result.error).toBeDefined();
  });

  test('does not treat semver as hash', () => {
    const result = parseActionRef('actions/checkout@v4.2.1');
    expect(result.isHash).toBe(false);
    expect(result.version).toBe('v4.2.1');
  });

  test('does not treat mixed alphanumeric with non-hex as hash', () => {
    const result = parseActionRef('actions/checkout@release-1.0');
    expect(result.isHash).toBe(false);
  });
});

describe('parseActionRefs', () => {
  test('parses an array of refs', () => {
    const results = parseActionRefs([
      'actions/checkout@v4',
      'actions/setup-node@v4'
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].owner).toBe('actions');
    expect(results[1].name).toBe('setup-node');
  });

  test('returns empty array for non-array input', () => {
    expect(parseActionRefs(null)).toEqual([]);
    expect(parseActionRefs('string')).toEqual([]);
  });
});
