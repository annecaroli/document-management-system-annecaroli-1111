const { createHash, randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const scryptAsync = promisify(scrypt);
const DUMMY_SALT = Buffer.from('dms-invalid-user-salt');
const DUMMY_KEY = Buffer.alloc(64);

function createAuthService(usersRepository, { sessionTtlSeconds = 3600 } = {}) {
  const sessions = new Map();
  const sessionHashesByUser = new Map();

  function hashToken(token) {
    return createHash('sha256').update(token).digest('hex');
  }

  function removeExpiredSessions(now = Date.now()) {
    for (const [tokenHash, session] of sessions) {
      if (session.expiresAt <= now) {
        sessions.delete(tokenHash);
        if (sessionHashesByUser.get(session.user.id) === tokenHash) {
          sessionHashesByUser.delete(session.user.id);
        }
      }
    }
  }

  return {
    get hasUsers() {
      return usersRepository.size > 0;
    },

    async login(username, password) {
      if (
        typeof username !== 'string'
        || typeof password !== 'string'
        || !username.trim()
        || password.length === 0
        || password.length > 1024
      ) {
        return null;
      }

      const user = usersRepository.findByUsername(username);
      const salt = user?.salt || DUMMY_SALT;
      const expectedKey = user?.key || DUMMY_KEY;
      const actualKey = await scryptAsync(password, salt, 64);
      if (!user || !timingSafeEqual(actualKey, expectedKey)) {
        return null;
      }

      const now = Date.now();
      removeExpiredSessions(now);
      const token = randomBytes(32).toString('base64url');
      const tokenHash = hashToken(token);
      const expiresAt = now + sessionTtlSeconds * 1000;
      const previousTokenHash = sessionHashesByUser.get(user.id);
      if (previousTokenHash) {
        sessions.delete(previousTokenHash);
      }
      sessions.set(tokenHash, {
        user: { id: user.id, username: user.username },
        expiresAt,
      });
      sessionHashesByUser.set(user.id, tokenHash);

      return {
        token,
        tokenType: 'Bearer',
        expiresAt: new Date(expiresAt).toISOString(),
        user: { id: user.id, username: user.username },
      };
    },

    authenticate(token) {
      if (typeof token !== 'string' || !token) {
        return null;
      }

      const tokenHash = hashToken(token);
      const session = sessions.get(tokenHash);
      if (!session) {
        return null;
      }
      if (session.expiresAt <= Date.now()) {
        sessions.delete(tokenHash);
        if (sessionHashesByUser.get(session.user.id) === tokenHash) {
          sessionHashesByUser.delete(session.user.id);
        }
        return null;
      }
      return { ...session.user };
    },

    logout(token) {
      if (typeof token === 'string' && token) {
        const tokenHash = hashToken(token);
        const session = sessions.get(tokenHash);
        sessions.delete(tokenHash);
        if (session && sessionHashesByUser.get(session.user.id) === tokenHash) {
          sessionHashesByUser.delete(session.user.id);
        }
      }
    },
  };
}

module.exports = createAuthService;