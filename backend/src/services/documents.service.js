const { randomUUID } = require('node:crypto');
const createDocumentFilePolicy = require('./document-file-policy');

function createServiceError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function createDocumentsService(repository, {
  allowedExtensions,
  maxFileSize = 10 * 1024 * 1024,
  maxStoragePerUserBytes = 1024 * 1024 * 1024,
  maxStorageBytes = 1024 * 1024 * 1024,
} = {}) {
  const filePolicy = createDocumentFilePolicy({ allowedExtensions });

  function requireOwnerId(ownerId) {
    if (typeof ownerId !== 'string' || !ownerId.trim()) {
      throw createServiceError(401, 'UNAUTHENTICATED', 'Autenticação necessária');
    }
    return ownerId;
  }

  async function upload(file, ownerId) {
    requireOwnerId(ownerId);
    if (!file?.filename || !file.originalname) {
      throw createServiceError(400, 'FILE_REQUIRED', 'Envie um arquivo no campo "file"');
    }

    let releaseReservation;
    try {
      const extension = filePolicy.getExtension(file.originalname);

      releaseReservation = repository.reserveUpload(
        ownerId,
        file.size,
        maxStoragePerUserBytes,
        maxStorageBytes,
      );
      if (!releaseReservation) {
        throw createServiceError(413, 'STORAGE_QUOTA_EXCEEDED', 'Limite de armazenamento do usuário excedido');
      }

      const content = await repository.readFile(file.filename);
      if (content.length > maxFileSize) {
        throw createServiceError(413, 'FILE_TOO_LARGE', 'Arquivo excede o tamanho máximo permitido');
      }
      if (!(await filePolicy.hasExpectedContent(extension, content))) {
        throw createServiceError(415, 'INVALID_FILE_CONTENT', 'Conteúdo incompatível com o formato informado');
      }

      return repository.create({
        id: randomUUID(),
        originalName: filePolicy.sanitizeOriginalName(file.originalname),
        size: content.length,
        contentType: filePolicy.getContentType(extension),
        uploadedAt: new Date().toISOString(),
        ownerId,
        storageName: file.filename,
      });
    } catch (error) {
      try {
        await repository.removeFile(file.filename);
      } catch (cleanupError) {
        console.error('Falha ao limpar upload rejeitado', cleanupError.code || 'UNKNOWN');
      }
      throw error;
    } finally {
      releaseReservation?.();
    }
  }

  async function list(ownerId) {
    return repository.listByOwner(requireOwnerId(ownerId));
  }

  async function getDownload(id, ownerId) {
    requireOwnerId(ownerId);

    const document = await repository.findByIdAndOwner(id, ownerId);
    if (!document) {
      throw createServiceError(404, 'DOCUMENT_NOT_FOUND', 'Documento não encontrado');
    }

    let stream;
    try {
      stream = await repository.createReadStream(document.storageName);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw createServiceError(404, 'DOCUMENT_NOT_FOUND', 'Documento não encontrado');
      }
      throw error;
    }

    return {
      document,
      stream,
    };
  }

  function getUploadConfig() {
    return {
      maxFileSize,
      allowedExtensions: filePolicy.allowedExtensions,
    };
  }

  return { upload, list, getDownload, getUploadConfig };
}

module.exports = createDocumentsService;