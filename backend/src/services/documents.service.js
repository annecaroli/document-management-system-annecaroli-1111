const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { TextDecoder } = require('node:util');

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

  return extensions
    .map((extension) => extension.trim().toLowerCase())
    .filter(Boolean)
    .map((extension) => (extension.startsWith('.') ? extension : `.${extension}`));
}

function hasExpectedContent(extension, content) {
  if (extension === '.pdf') {
    return content.subarray(0, 5).toString('ascii') === '%PDF-';
  }

  const officeDirectories = {
    '.docx': 'word/',
    '.xlsx': 'xl/',
    '.pptx': 'ppt/',
  };
  if (officeDirectories[extension]) {
    return content.length >= 4
      && content[0] === 0x50
      && content[1] === 0x4b
      && content.includes(Buffer.from('[Content_Types].xml'))
      && content.includes(Buffer.from(officeDirectories[extension]));
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

      const content = await repository.readFile(file.filename);
      if (content.length > maxFileSize) {
        throw createServiceError(413, 'FILE_TOO_LARGE', 'Arquivo excede o tamanho máximo permitido');
      }
      if (!hasExpectedContent(extension, content)) {
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
    } catch (error) {
      await repository.removeFile(file.filename).catch(() => {});
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
    if (!document || !(await repository.fileExists(document.storageName))) {
      throw createServiceError(404, 'DOCUMENT_NOT_FOUND', 'Documento não encontrado');
    }

    return {
      document,
      filePath: repository.getFilePath(document.storageName),
    };
  }

  return { upload, list, getDownload };
}

module.exports = createDocumentsService;