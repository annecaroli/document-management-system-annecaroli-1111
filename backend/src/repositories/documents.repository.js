const { constants: fileSystemConstants } = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');

function createDocumentsRepository({ storageDir = path.resolve(__dirname, '../../storage') } = {}) {
  const resolvedStorageDir = path.resolve(storageDir);
  const documents = new Map();
  const reservedBytesByOwner = new Map();
  let reservedTotalBytes = 0;
  let storedBytes = 0;

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

  async function prepareStorage() {
    await fs.mkdir(resolvedStorageDir, { recursive: true, mode: 0o700 });
    const stats = await fs.lstat(resolvedStorageDir);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error('O diretório de armazenamento deve ser um diretório real');
    }
    await fs.chmod(resolvedStorageDir, 0o700);
  }

  async function openRegularFile(storageName) {
    const filePath = resolveStoragePath(storageName);
    const linkStats = await fs.lstat(filePath);
    if (linkStats.isSymbolicLink()) {
      const error = new Error('Links simbólicos não são aceitos no armazenamento');
      error.code = 'ELOOP';
      throw error;
    }

    const flags = fileSystemConstants.O_RDONLY | (fileSystemConstants.O_NOFOLLOW || 0);
    const fileHandle = await fs.open(filePath, flags);
    try {
      const stats = await fileHandle.stat();
      if (!stats.isFile()) {
        const error = new Error('O recurso de armazenamento não é um arquivo regular');
        error.code = 'EINVAL';
        throw error;
      }
      return fileHandle;
    } catch (error) {
      await fileHandle.close();
      throw error;
    }
  }

  return {
    async initialize() {
      await prepareStorage();
      const entries = await fs.readdir(resolvedStorageDir, { withFileTypes: true });
      let totalBytes = 0;
      for (const entry of entries) {
        if (entry.isDirectory()) {
          continue;
        }
        const stats = await fs.lstat(path.join(resolvedStorageDir, entry.name));
        totalBytes += stats.size;
      }
      storedBytes = totalBytes;
    },

    prepareStorage,

    reserveUpload(ownerId, size, maxStoragePerUserBytes, maxStorageBytes) {
      if (!Number.isSafeInteger(size) || size < 0) {
        return null;
      }
      const currentBytes = [...documents.values()]
        .filter((document) => document.ownerId === ownerId)
        .reduce((total, document) => total + document.size, 0);
      const reservedBytes = reservedBytesByOwner.get(ownerId) || 0;
      if (
        currentBytes + reservedBytes + size > maxStoragePerUserBytes
        || storedBytes + reservedTotalBytes + size > maxStorageBytes
      ) {
        return null;
      }

      reservedBytesByOwner.set(ownerId, reservedBytes + size);
      reservedTotalBytes += size;
      let released = false;
      return () => {
        if (released) {
          return;
        }
        released = true;
        reservedTotalBytes -= size;
        const remainingBytes = (reservedBytesByOwner.get(ownerId) || 0) - size;
        if (remainingBytes > 0) {
          reservedBytesByOwner.set(ownerId, remainingBytes);
        } else {
          reservedBytesByOwner.delete(ownerId);
        }
      };
    },

    async create(document) {
      documents.set(document.id, { ...document });
      storedBytes += document.size;
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

    async readFile(storageName) {
      const fileHandle = await openRegularFile(storageName);
      try {
        return await fileHandle.readFile();
      } finally {
        await fileHandle.close();
      }
    },

    async createReadStream(storageName) {
      const fileHandle = await openRegularFile(storageName);
      return fileHandle.createReadStream({ autoClose: true });
    },

    async removeFile(storageName) {
      await fs.rm(resolveStoragePath(storageName), { force: true });
    },
  };
}

module.exports = createDocumentsRepository;