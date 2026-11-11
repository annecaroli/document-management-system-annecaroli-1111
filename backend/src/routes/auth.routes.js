const express = require('express');

const MAX_FAILED_LOGINS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_ACTIVE_LOGINS_PER_IP = 2;
const MAX_ACTIVE_LOGINS = 20;

function createAuthRouter({ authController, requireAuthenticatedUser }) {
  const router = express.Router();
  const failedLogins = new Map();
  const activeLoginsByIp = new Map();
  let activeLogins = 0;

  function limitLoginAttempts(req, res, next) {
    const now = Date.now();
    const key = req.ip || 'unknown';
    if (!failedLogins.has(key) && failedLogins.size >= 10000) {
      for (const [address, attempt] of failedLogins) {
        if (attempt.resetAt <= now) {
          failedLogins.delete(address);
        }
      }
      if (failedLogins.size >= 10000) {
        return res.status(429).json({
          error: { code: 'LOGIN_RATE_LIMITED', message: 'Muitas tentativas. Tente novamente mais tarde.' },
        });
      }
    }
    let attempt = failedLogins.get(key);

    if (!attempt || attempt.resetAt <= now) {
      attempt = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
      failedLogins.set(key, attempt);
    }

    if (attempt.count >= MAX_FAILED_LOGINS) {
      return res.status(429).json({
        error: { code: 'LOGIN_RATE_LIMITED', message: 'Muitas tentativas. Tente novamente mais tarde.' },
      });
    }

    const activeForIp = activeLoginsByIp.get(key) || 0;
    if (activeLogins >= MAX_ACTIVE_LOGINS || activeForIp >= MAX_ACTIVE_LOGINS_PER_IP) {
      return res.status(429).json({
        error: { code: 'LOGIN_BUSY', message: 'Muitas tentativas simultâneas. Tente novamente.' },
      });
    }

    activeLogins += 1;
    activeLoginsByIp.set(key, activeForIp + 1);
    let released = false;
    const release = () => {
      if (released) {
        return;
      }
      released = true;
      activeLogins -= 1;
      const remaining = (activeLoginsByIp.get(key) || 1) - 1;
      if (remaining > 0) {
        activeLoginsByIp.set(key, remaining);
      } else {
        activeLoginsByIp.delete(key);
      }
    };
    res.once('finish', release);
    res.once('close', release);

    req.recordLoginFailure = () => { attempt.count += 1; };
    req.clearLoginFailures = () => failedLogins.delete(key);
    return next();
  }

  router.post('/auth/login', limitLoginAttempts, authController.login);
  router.post('/auth/logout', requireAuthenticatedUser, authController.logout);

  return router;
}

module.exports = createAuthRouter;