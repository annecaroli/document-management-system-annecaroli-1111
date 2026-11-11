const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const yauzl = require('yauzl');

const DEFAULT_ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.csv'];
const CONTENT_TYPES = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};

function createServiceError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizeAllowedExtensions(value) {
  const extensions = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : DEFAULT_ALLOWED_EXTENSIONS;

  const normalizedExtensions = [...new Set(extensions
    .map((extension) => extension.trim().toLowerCase())
    .filter(Boolean)
    .map((extension) => (extension.startsWith('.') ? extension : `.${extension}`)))];
  if (
    normalizedExtensions.length === 0
    || normalizedExtensions.some((extension) => !CONTENT_TYPES[extension])
  ) {
    throw new Error('DMS_ALLOWED_EXTENSIONS contém um formato não suportado');
  }
  return normalizedExtensions;
}

function hasExpectedOfficeContent(extension, content) {
  const requiredParts = {
    '.docx': 'word/document.xml',
    '.xlsx': 'xl/workbook.xml',
    '.pptx': 'ppt/presentation.xml',
  };
  const requiredContentTypes = {
    '.docx': 'wordprocessingml.document.main+xml',
    '.xlsx': 'spreadsheetml.sheet.main+xml',
    '.pptx': 'presentationml.presentation.main+xml',
  };
  const requiredRootTags = {
    '.docx': /<(?:[A-Za-z0-9_]+:)?document\b/,
    '.xlsx': /<(?:[A-Za-z0-9_]+:)?workbook\b/,
    '.pptx': /<(?:[A-Za-z0-9_]+:)?presentation\b/,
  };

  return new Promise((resolve) => {
    yauzl.fromBuffer(content, {
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true,
    }, (error, zipFile) => {
      if (error || !zipFile) {
        resolve(false);
        return;
      }

      let entryCount = 0;
      let uncompressedBytes = 0;
      let hasContentTypes = false;
      let hasRequiredPart = false;
      let completed = false;
      const entryNames = new Set();
      let partsAreValid = true;

      function finish(isValid) {
        if (completed) {
          return;
        }
        completed = true;
        zipFile.close();
        resolve(isValid);
      }

      zipFile.on('error', () => finish(false));
      zipFile.on('entry', (entry) => {
        entryCount += 1;
        uncompressedBytes += entry.uncompressedSize;
        const parts = entry.fileName.split('/');
        if (
          entryCount > 5000
          || !Number.isSafeInteger(entry.uncompressedSize)
          || uncompressedBytes > 100 * 1024 * 1024
          || entryNames.has(entry.fileName)
          || entry.fileName.includes('\\')
          || path.posix.isAbsolute(entry.fileName)
          || parts.includes('..')
        ) {
          finish(false);
          return;
        }

        entryNames.add(entry.fileName);
        if (entry.fileName === '[Content_Types].xml') {
          hasContentTypes = true;
        }
        if (entry.fileName === requiredParts[extension]) {
          hasRequiredPart = true;
        }

        const isContentTypes = entry.fileName === '[Content_Types].xml';
        const isRequiredPart = entry.fileName === requiredParts[extension];
        if (!isContentTypes && !isRequiredPart) {
          zipFile.readEntry();
          return;
        }

        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            finish(false);
            return;
          }

          const chunks = [];
          let partSize = 0;
          stream.on('data', (chunk) => {
            partSize += chunk.length;
            if (partSize > 1024 * 1024) {
              partsAreValid = false;
              stream.destroy();
              finish(false);
              return;
            }
            chunks.push(chunk);
          });
          stream.on('error', () => finish(false));
          stream.on('end', () => {
            if (completed) {
              return;
            }
            const xml = Buffer.concat(chunks).toString('utf8');
            if (isContentTypes) {
              partsAreValid = xml.includes('<Types')
                && xml.includes(requiredContentTypes[extension]);
            } else {
              partsAreValid = requiredRootTags[extension].test(xml);
            }
            if (!partsAreValid) {
              finish(false);
              return;
            }
            zipFile.readEntry();
          });
        });
      });
      zipFile.on('end', () => finish(hasContentTypes && hasRequiredPart && partsAreValid));
      zipFile.readEntry();
    });
  });
}

async function hasExpectedContent(extension, content) {
  if (extension === '.pdf') {
    return content.subarray(0, 5).toString('ascii') === '%PDF-'
      && content.subarray(-1024).includes(Buffer.from('%%EOF'));
  }

  if (extension === '.docx' || extension === '.xlsx' || extension === '.pptx') {
    return hasExpectedOfficeContent(extension, content);
  }

  if (extension === '.txt' || extension === '.csv') {
    if (content.includes(0)) {
      return false;
    }

    try {
      new TextDecoder('utf-8', { fatal: true }).decode(content);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

function sanitizeOriginalName(originalName) {
  const basename = path.posix.basename(originalName.replace(/\\/g, '/'));
  const sanitized = basename.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return sanitized || 'document';
}

function createDocumentsService(repository, {
  allowedExtensions,
  maxFileSize = 10 * 1024 * 1024,
  maxStoragePerUserBytes = 1024 * 1024 * 1024,
  maxStorageBytes = 1024 * 1024 * 1024,
} = {}) {
  const allowed = new Set(normalizeAllowedExtensions(allowedExtensions));

  async function upload(file, ownerId) {
    if (!ownerId) {
      throw createServiceError(401, 'UNAUTHENTICATED', 'Autenticação necessária');
    }
    if (!file?.filename || !file.originalname) {
      throw createServiceError(400, 'FILE_REQUIRED', 'Envie um arquivo no campo "file"');
    }

    try {
      const extension = path.extname(file.originalname).toLowerCase();
      if (!allowed.has(extension) || !CONTENT_TYPES[extension]) {
        throw createServiceError(415, 'UNSUPPORTED_FILE_TYPE', 'Formato de arquivo não permitido');
      }

      const releaseReservation = repository.reserveUpload(
        ownerId,
        file.size,
        maxStoragePerUserBytes,
        maxStorageBytes,
      );
      if (!releaseReservation) {
        throw createServiceError(413, 'STORAGE_QUOTA_EXCEEDED', 'Limite de armazenamento do usuário excedido');
      }

      try {
        const content = await repository.readFile(file.filename);
        if (content.length > maxFileSize) {
          throw createServiceError(413, 'FILE_TOO_LARGE', 'Arquivo excede o tamanho máximo permitido');
        }
        if (!(await hasExpectedContent(extension, content))) {
          throw createServiceError(415, 'INVALID_FILE_CONTENT', 'Conteúdo incompatível com o formato informado');
        }

        const document = {
          id: randomUUID(),
          originalName: sanitizeOriginalName(file.originalname),
          size: content.length,
          contentType: CONTENT_TYPES[extension],
          uploadedAt: new Date().toISOString(),
          ownerId,
          storageName: file.filename,
        };

        return await repository.create(document);
      } finally {
        releaseReservation();
      }
    } catch (error) {
      try {
        await repository.removeFile(file.filename);
      } catch (cleanupError) {
        console.error('Falha ao limpar upload rejeitado', cleanupError.code || 'UNKNOWN');
      }
      throw error;
    }
  }

  async function list(ownerId) {
    if (!ownerId) {
      throw createServiceError(401, 'UNAUTHENTICATED', 'Autenticação necessária');
    }
    return repository.listByOwner(ownerId);
  }

  async function getDownload(id, ownerId) {
    if (!ownerId) {
      throw createServiceError(401, 'UNAUTHENTICATED', 'Autenticação necessária');
    }

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
      allowedExtensions: [...allowed],
    };
  }

  return { upload, list, getDownload, getUploadConfig };
}

module.exports = createDocumentsService;