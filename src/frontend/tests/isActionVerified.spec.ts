import { test, expect } from '@playwright/test';
import { isActionVerified } from '../src/services/utils';

test.describe('isActionVerified helper', () => {
  test('boolean true', async () => {
    expect(isActionVerified({ verified: true })).toBe(true);
  });

  test('boolean false', async () => {
    expect(isActionVerified({ verified: false })).toBe(false);
  });

  test('numeric 1 and 0', async () => {
    expect(isActionVerified({ verified: 1 })).toBe(true);
    expect(isActionVerified({ verified: 0 })).toBe(false);
  });

  test('string values', async () => {
    expect(isActionVerified({ verified: 'TRUE' })).toBe(true);
    expect(isActionVerified({ verified: '1' })).toBe(true);
    expect(isActionVerified({ verified: 'false' })).toBe(false);
  });

  test('missing value', async () => {
    expect(isActionVerified({})).toBe(false);
  });
});
