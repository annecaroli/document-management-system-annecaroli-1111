const multer = require('multer');

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({
      error: {
        code: tooLarge ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD',
        message: tooLarge ? 'Arquivo excede o tamanho máximo permitido' : 'Requisição de upload inválida',
      },
    });
  }

  const knownStatusCodes = [400, 401, 404, 413, 415, 429];
  const statusCode = knownStatusCodes.includes(error.statusCode) ? error.statusCode : 500;
  const safeCode = typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code)
    ? error.code
    : 'INVALID_REQUEST';
  const safeMessages = {
    DOCUMENT_NOT_FOUND: 'Documento não encontrado',
    FILE_REQUIRED: 'Envie um arquivo no campo "file"',
    FILE_TOO_LARGE: 'Arquivo excede o tamanho máximo permitido',
    INVALID_FILE_CONTENT: 'Conteúdo incompatível com o formato informado',
    STORAGE_QUOTA_EXCEEDED: 'Limite de armazenamento excedido',
    UNSUPPORTED_FILE_TYPE: 'Formato de arquivo não permitido',
  };
  const safeMessage = safeMessages[error.code]
    || (statusCode === 401
      ? 'Autenticação necessária'
      : statusCode === 413
        ? 'Limite de armazenamento excedido'
        : statusCode === 500
          ? 'Erro interno do servidor'
          : 'Requisição inválida');
  return res.status(statusCode).json({
    error: {
      code: statusCode === 500 ? 'INTERNAL_ERROR' : safeCode,
      message: safeMessage,
    },
  });
}

module.exports = errorHandler;