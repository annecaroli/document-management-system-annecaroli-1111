const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const express = require('express');
const multer = require('multer');

function createDocumentsRouter({ documentsController, storageDir, maxFileSize }) {
  const router = express.Router();
  const storage = multer.diskStorage({
    destination(req, file, callback) {
      fs.mkdir(storageDir, { recursive: true })
        .then(() => callback(null, storageDir), callback);
    },
    filename(req, file, callback) {
      callback(null, randomUUID());
    },
  });
  const upload = multer({
    storage,
    limits: { fileSize: maxFileSize, files: 1, fields: 0 },
  });

  function requireAuthenticatedUser(req, res, next) {
    if (typeof req.user?.id !== 'string' || !req.user.id.trim()) {
      return res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Autenticação necessária' },
      });
    }
    return next();
  }

  function handleError(error, req, res, next) {
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

    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const code = statusCode === 500 ? 'INTERNAL_ERROR' : error.code;
    const message = statusCode === 500 ? 'Erro interno do servidor' : error.message;
    return res.status(statusCode).json({ error: { code, message } });
  }

  router.post('/upload', requireAuthenticatedUser, upload.single('file'), documentsController.upload);
  router.get('/documents', requireAuthenticatedUser, documentsController.list);
  router.get('/documents/:id/download', requireAuthenticatedUser, documentsController.download);
  router.use(handleError);

  return router;
}

module.exports = createDocumentsRouter;