import { test, expect } from '@playwright/test';
import { isGitHubOwnedAction } from '../src/services/utils';

test.describe('isGitHubOwnedAction helper', () => {
  test('actions org is GitHub-owned', () => {
    expect(isGitHubOwnedAction({ owner: 'actions' })).toBe(true);
  });

  test('github org is GitHub-owned', () => {
    expect(isGitHubOwnedAction({ owner: 'github' })).toBe(true);
  });

  test('is case-insensitive', () => {
    expect(isGitHubOwnedAction({ owner: 'Actions' })).toBe(true);
    expect(isGitHubOwnedAction({ owner: 'GitHub' })).toBe(true);
  });

  test('other owners are not GitHub-owned', () => {
    expect(isGitHubOwnedAction({ owner: 'docker' })).toBe(false);
    expect(isGitHubOwnedAction({ owner: 'azure' })).toBe(false);
    expect(isGitHubOwnedAction({ owner: 'some-random-user' })).toBe(false);
  });

  test('missing owner', () => {
    expect(isGitHubOwnedAction({})).toBe(false);
  });
});
