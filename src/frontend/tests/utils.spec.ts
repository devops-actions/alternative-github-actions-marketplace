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

  test('matches a query against the action type', () => {
    const item = { owner: 'actions', name: 'checkout', actionType: 'Docker' };
    expect(matchesSearchQuery(item, 'docker')).toBe(true);
    expect(matchesSearchQuery(item, 'node')).toBe(false);
  });

  test('matches a query against verified and archived state', () => {
    const verified = { owner: 'actions', name: 'checkout', verified: true };
    const archived = { owner: 'actions', name: 'old-thing', archived: true };
    expect(matchesSearchQuery(verified, 'verified')).toBe(true);
    expect(matchesSearchQuery(archived, 'archived')).toBe(true);
    expect(matchesSearchQuery(verified, 'archived')).toBe(false);
  });

  test('matches a query against the description', () => {
    const item = { owner: 'someone', name: 'no-releases', description: 'Lints Terraform configuration files' };
    expect(matchesSearchQuery(item, 'terraform')).toBe(true);
    expect(matchesSearchQuery(item, 'lints configuration')).toBe(true);
  });

  test('still matches by owner/name when description is missing', () => {
    const item = { owner: 'actions', name: 'checkout' };
    expect(matchesSearchQuery(item, 'checkout')).toBe(true);
  });
});
