'use strict';

const { extractRepoName } = require('../lib/actionNameDecoder');

describe('extractRepoName', () => {
  test('extracts repo name from encoded composite action path', () => {
    const result = extractRepoName('github', 'github_codeql-action_analyze');
    expect(result).toBe('codeql-action');
  });

  test('extracts repo name from simple action', () => {
    const result = extractRepoName('actions', 'actions_setup-java');
    expect(result).toBe('setup-java');
  });

  test('handles action name without prefix', () => {
    const result = extractRepoName('actions', 'checkout');
    expect(result).toBe('checkout');
  });

  test('handles action name with wrong prefix', () => {
    const result = extractRepoName('actions', 'github_codeql-action');
    expect(result).toBe('github_codeql-action');
  });

  test('restores slashes from underscores in composite paths', () => {
    const result = extractRepoName('github', 'github_codeql-action_analyze');
    expect(result).toBe('codeql-action');
  });

  test('returns first segment only for composite actions', () => {
    const result = extractRepoName('github', 'github_codeql-action_analyze_path');
    expect(result).toBe('codeql-action');
  });

  test('handles empty owner', () => {
    const result = extractRepoName('', 'actions_setup-java');
    expect(result).toBe('actions_setup-java');
  });

  test('handles empty name', () => {
    const result = extractRepoName('actions', '');
    expect(result).toBe('');
  });

  test('handles null values', () => {
    const result = extractRepoName(null, 'actions_setup-java');
    expect(result).toBe('actions_setup-java');
  });

  test('handles undefined values', () => {
    const result = extractRepoName(undefined, 'actions_setup-java');
    expect(result).toBe('actions_setup-java');
  });

  test('handles case sensitivity in prefix', () => {
    const result = extractRepoName('Actions', 'actions_setup-java');
    expect(result).toBe('setup-java');
  });

  test('handles multiple underscores in name', () => {
    const result = extractRepoName('actions', 'actions_setup_java_with_extra');
    expect(result).toBe('setup/java/with/extra');
  });
});
