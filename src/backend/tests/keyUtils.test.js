const { normalizePartitionKey, normalizeRowKey } = require('../lib/keyUtils');

describe('keyUtils', () => {
  describe('normalizePartitionKey', () => {
    it('lower-cases and trims the value', () => {
      expect(normalizePartitionKey('  Actions  ')).toBe('actions');
    });

    it('coerces non-string values to strings', () => {
      expect(normalizePartitionKey(123)).toBe('123');
    });
  });

  describe('normalizeRowKey', () => {
    it('lower-cases and trims the value', () => {
      expect(normalizeRowKey('  CheckOut\t')).toBe('checkout');
    });

    it('coerces non-string values to strings', () => {
      expect(normalizeRowKey(456)).toBe('456');
    });
  });

  it('produces identical output for equivalent partition and row key inputs', () => {
    const value = '  My-Org  ';
    expect(normalizePartitionKey(value)).toBe(normalizeRowKey(value));
  });
});
