'use strict';

const capturedOptions = [];

jest.mock('express-rate-limit', () => (options) => {
  capturedOptions.push(options);
  return jest.fn();
});

const { createRateLimiters } = require('../lib/rateLimiter');

describe('rateLimiter', () => {
  beforeEach(() => {
    capturedOptions.length = 0;
  });

  test('createRateLimiters returns limiter objects', () => {
    const limiters = createRateLimiters();

    expect(limiters).toHaveProperty('globalLimiter');
    expect(limiters).toHaveProperty('mcpLimiter');
    expect(limiters).toHaveProperty('burstLimiter');

    expect(typeof limiters.globalLimiter).toBe('function');
    expect(typeof limiters.mcpLimiter).toBe('function');
    expect(typeof limiters.burstLimiter).toBe('function');
  });

  test('limiters are distinct instances', () => {
    const limiters = createRateLimiters();

    expect(limiters.globalLimiter).not.toBe(limiters.mcpLimiter);
    expect(limiters.globalLimiter).not.toBe(limiters.burstLimiter);
    expect(limiters.mcpLimiter).not.toBe(limiters.burstLimiter);
  });

  describe('keyGenerator', () => {
    function getKeyGenerator() {
      capturedOptions.length = 0;
      createRateLimiters();
      // All three limiters use identical keyGenerator logic; use the first one
      return capturedOptions[0].keyGenerator;
    }

    test('returns req.ip when available', () => {
      const keyGenerator = getKeyGenerator();
      const req = { ip: '1.2.3.4', socket: { remoteAddress: '5.6.7.8' } };
      expect(keyGenerator(req)).toBe('1.2.3.4');
    });

    test('falls back to req.socket.remoteAddress when req.ip is falsy', () => {
      const keyGenerator = getKeyGenerator();
      const req = { ip: undefined, socket: { remoteAddress: '5.6.7.8' } };
      expect(keyGenerator(req)).toBe('5.6.7.8');
    });

    test('falls back to "unknown" when both ip and socket address are falsy', () => {
      const keyGenerator = getKeyGenerator();
      const req = { ip: undefined, socket: {} };
      expect(keyGenerator(req)).toBe('unknown');
    });

    test('returns "unknown" when req.ip is empty string', () => {
      const keyGenerator = getKeyGenerator();
      const req = { ip: '', socket: { remoteAddress: '' } };
      expect(keyGenerator(req)).toBe('unknown');
    });
  });
});
