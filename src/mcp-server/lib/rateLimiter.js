'use strict';

const rateLimit = require('express-rate-limit');

/**
 * Create the tiered rate limiters for the MCP server.
 */
function createRateLimiters() {
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
    keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown'
  });

  const mcpLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'MCP rate limit exceeded. Please slow down.' },
    keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown'
  });

  const burstLimiter = rateLimit({
    windowMs: 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Burst rate limit exceeded. Please wait a moment.' },
    keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown'
  });

  return { globalLimiter, mcpLimiter, burstLimiter };
}

module.exports = { createRateLimiters };
