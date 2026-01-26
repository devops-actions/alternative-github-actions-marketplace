import { test, expect } from '@playwright/test';
import { matchesSearchQuery } from '../src/services/utils';

test.describe('matchesSearchQuery unit tests', () => {
  test('matches single token against owner', () => {
    const item = { owner: 'Owner1', name: 'github-actions-jwt-generator' };
    expect(matchesSearchQuery(item, 'owner')).toBe(true);
  });

  test('matches multiple tokens in any order', () => {
    const item = { owner: 'Owner1', name: 'github-actions-jwt-generator' };
    expect(matchesSearchQuery(item, 'actions owner')).toBe(true);
  });

  test('does not match when token missing', () => {
    const item = { owner: 'Owner1', name: 'github-actions-jwt-generator' };
    expect(matchesSearchQuery(item, 'foobar')).toBe(false);
  });

  test('ignores punctuation and splits tokens', () => {
    const item = { owner: 'Test-Org', name: 'my_repo-name' };
    expect(matchesSearchQuery(item, 'test org my repo')).toBe(true);
  });
});
