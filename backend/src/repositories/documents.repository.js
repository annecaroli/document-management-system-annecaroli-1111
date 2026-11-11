const fs = require('node:fs/promises');
const path = require('node:path');

function createDocumentsRepository({ storageDir = path.resolve(__dirname, '../../storage') } = {}) {
  const resolvedStorageDir = path.resolve(storageDir);
  const documents = new Map();

  function resolveStoragePath(storageName) {
    if (
      typeof storageName !== 'string'
      || storageName !== path.basename(storageName)
      || storageName.includes('\\')
    ) {
      throw new Error('Nome de armazenamento inválido');
    }

    const filePath = path.resolve(resolvedStorageDir, storageName);
    if (!filePath.startsWith(`${resolvedStorageDir}${path.sep}`)) {
      throw new Error('Caminho de armazenamento inválido');
    }

    return filePath;
  }

  return {
    async create(document) {
      documents.set(document.id, { ...document });
      return { ...document };
    },

    async listByOwner(ownerId) {
      return [...documents.values()]
        .filter((document) => document.ownerId === ownerId)
        .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt))
        .map((document) => ({ ...document }));
    },

    async findByIdAndOwner(id, ownerId) {
      const document = documents.get(id);
      return document?.ownerId === ownerId ? { ...document } : null;
    },

    getFilePath(storageName) {
      return resolveStoragePath(storageName);
    },

    async readFile(storageName) {
      return fs.readFile(resolveStoragePath(storageName));
    },

    async fileExists(storageName) {
      try {
        await fs.access(resolveStoragePath(storageName));
        return true;
      } catch {
        return false;
      }
    },

    async removeFile(storageName) {
      await fs.rm(resolveStoragePath(storageName), { force: true });
    },
  };
}

module.exports = createDocumentsRepository;