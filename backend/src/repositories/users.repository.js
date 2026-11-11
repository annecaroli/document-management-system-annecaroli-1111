function decodePasswordHash(passwordHash) {
  const match = /^scrypt\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/.exec(passwordHash);
  if (!match) {
    throw new Error('DMS_USERS_JSON contém um passwordHash inválido');
  }

  const salt = Buffer.from(match[1], 'base64url');
  const key = Buffer.from(match[2], 'base64url');
  if (
    salt.length < 16
    || key.length !== 64
    || salt.toString('base64url') !== match[1]
    || key.toString('base64url') !== match[2]
  ) {
    throw new Error('DMS_USERS_JSON contém um passwordHash inválido');
  }

  return { salt, key };
}

function createUsersRepository(usersJson = '[]') {
  let configuredUsers;
  try {
    configuredUsers = JSON.parse(usersJson);
  } catch {
    throw new Error('DMS_USERS_JSON deve conter um array JSON válido');
  }

  if (!Array.isArray(configuredUsers)) {
    throw new Error('DMS_USERS_JSON deve conter um array JSON');
  }

  const usersByUsername = new Map();
  const ids = new Set();

  for (const configuredUser of configuredUsers) {
    if (!configuredUser || typeof configuredUser !== 'object' || Array.isArray(configuredUser)) {
      throw new Error('Cada usuário em DMS_USERS_JSON deve ser um objeto');
    }
    const id = typeof configuredUser.id === 'string' ? configuredUser.id.trim() : '';
    const username = typeof configuredUser.username === 'string' ? configuredUser.username.trim() : '';
    const normalizedUsername = username.toLowerCase();

    if (!id || !username || typeof configuredUser.passwordHash !== 'string') {
      throw new Error('Cada usuário em DMS_USERS_JSON deve ter id, username e passwordHash');
    }
    if (ids.has(id) || usersByUsername.has(normalizedUsername)) {
      throw new Error('IDs e nomes de usuário em DMS_USERS_JSON devem ser únicos');
    }

    const password = decodePasswordHash(configuredUser.passwordHash);
    ids.add(id);
    usersByUsername.set(normalizedUsername, { id, username, ...password });
  }

  return {
    findByUsername(username) {
      return usersByUsername.get(username.trim().toLowerCase()) || null;
    },
    get size() {
      return usersByUsername.size;
    },
  };
}

module.exports = createUsersRepository;