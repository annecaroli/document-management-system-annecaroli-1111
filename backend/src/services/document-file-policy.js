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

function validateOfficeArchive(extension, content) {
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
        const isContentTypes = entry.fileName === '[Content_Types].xml';
        const isRequiredPart = entry.fileName === requiredParts[extension];
        hasContentTypes ||= isContentTypes;
        hasRequiredPart ||= isRequiredPart;

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
            partsAreValid = isContentTypes
              ? xml.includes('<Types') && xml.includes(requiredContentTypes[extension])
              : requiredRootTags[extension].test(xml);
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
    return validateOfficeArchive(extension, content);
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

function createDocumentFilePolicy({ allowedExtensions } = {}) {
  const contentTypes = new Map(
    normalizeAllowedExtensions(allowedExtensions)
      .map((extension) => [extension, CONTENT_TYPES[extension]]),
  );

  return {
    get allowedExtensions() {
      return [...contentTypes.keys()];
    },

    getContentType(extension) {
      return contentTypes.get(extension) || null;
    },

    getExtension(originalName) {
      const extension = path.extname(originalName).toLowerCase();
      if (!contentTypes.has(extension)) {
        const error = new Error('Formato de arquivo não permitido');
        error.statusCode = 415;
        error.code = 'UNSUPPORTED_FILE_TYPE';
        throw error;
      }
      return extension;
    },

    hasExpectedContent,
    sanitizeOriginalName,
  };
}

module.exports = createDocumentFilePolicy;