const { randomUUID } = require('node:crypto');
const express = require('express');
const multer = require('multer');

function createDocumentsRouter({
  documentsController,
  storageDir,
  maxFileSize,
  prepareStorage,
  requireAuthenticatedUser,
}) {
  const router = express.Router();
  let activeUploads = 0;
  const storage = multer.diskStorage({
    destination(req, file, callback) {
      prepareStorage().then(() => callback(null, storageDir), callback);
    },
    filename(req, file, callback) {
      callback(null, randomUUID());
    },
  });
  const upload = multer({
    storage,
    limits: { fileSize: maxFileSize, files: 1, fields: 0 },
  });

  function limitConcurrentUploads(req, res, next) {
    if (activeUploads >= 4) {
      return res.status(429).json({
        error: { code: 'UPLOADS_BUSY', message: 'Muitos uploads simultâneos. Tente novamente.' },
      });
    }

    activeUploads += 1;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        activeUploads -= 1;
      }
    };
    res.once('finish', release);
    res.once('close', release);
    return next();
  }

  router.get('/config', documentsController.uploadConfig);
  router.post('/upload', requireAuthenticatedUser, limitConcurrentUploads, upload.single('file'), documentsController.upload);
  router.get('/documents', requireAuthenticatedUser, documentsController.list);
  router.get('/documents/:id/download', requireAuthenticatedUser, documentsController.download);

  return router;
}

module.exports = createDocumentsRouter;