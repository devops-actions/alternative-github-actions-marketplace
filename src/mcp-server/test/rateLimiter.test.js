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

  describe('limiter options', () => {
    function getOptions() {
      capturedOptions.length = 0;
      createRateLimiters();
      return capturedOptions;
    }

    test('global limiter allows 200 requests per minute', () => {
      const [global] = getOptions();
      expect(global.windowMs).toBe(60 * 1000);
      expect(global.max).toBe(200);
      expect(global.standardHeaders).toBe(true);
      expect(global.legacyHeaders).toBe(false);
      expect(global.message).toEqual({ error: 'Too many requests. Please try again later.' });
    });

    test('mcp limiter allows 60 requests per minute', () => {
      const [, mcp] = getOptions();
      expect(mcp.windowMs).toBe(60 * 1000);
      expect(mcp.max).toBe(60);
      expect(mcp.standardHeaders).toBe(true);
      expect(mcp.legacyHeaders).toBe(false);
      expect(mcp.message).toEqual({ error: 'MCP rate limit exceeded. Please slow down.' });
    });

    test('burst limiter allows 10 requests per second', () => {
      const [, , burst] = getOptions();
      expect(burst.windowMs).toBe(1000);
      expect(burst.max).toBe(10);
      expect(burst.standardHeaders).toBe(true);
      expect(burst.legacyHeaders).toBe(false);
      expect(burst.message).toEqual({ error: 'Burst rate limit exceeded. Please wait a moment.' });
    });

    test('every limiter provides a keyGenerator function', () => {
      for (const options of getOptions()) {
        expect(typeof options.keyGenerator).toBe('function');
        expect(options.keyGenerator({ ip: '1.2.3.4' })).toBe('1.2.3.4');
      }
    });
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
