'use strict';

const { createRateLimiters } = require('../lib/rateLimiter');

describe('rateLimiter', () => {
  test('createRateLimiters returns limiter objects', () => {
    const limiters = createRateLimiters();
    
    expect(limiters).toHaveProperty('globalLimiter');
    expect(limiters).toHaveProperty('mcpLimiter');
    expect(limiters).toHaveProperty('burstLimiter');
    
    // Check that each limiter is a function (express-rate-limit middleware)
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
});
