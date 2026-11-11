const { pipeline } = require('node:stream');

function toPublicDocument(document) {
  return {
    id: document.id,
    originalName: document.originalName,
    size: document.size,
    contentType: document.contentType,
    uploadedAt: document.uploadedAt,
  };
}

function createDocumentsController(documentsService) {
  return {
    uploadConfig(req, res) {
      res.json(documentsService.getUploadConfig());
    },

    async upload(req, res) {
      const document = await documentsService.upload(req.file, req.user.id);
      res.status(201).json(toPublicDocument(document));
    },

    async list(req, res) {
      const documents = await documentsService.list(req.user.id);
      res.json({ documents: documents.map(toPublicDocument) });
    },

    async download(req, res, next) {
      const { document, stream } = await documentsService.getDownload(req.params.id, req.user.id);
      res.attachment(document.originalName);
      res.type(document.contentType);
      res.set('X-Content-Type-Options', 'nosniff');
      pipeline(stream, res, (error) => {
        if (error && !res.headersSent) {
          next(error);
        } else if (error) {
          res.destroy(error);
        }
      });
    },
  };
}

module.exports = createDocumentsController;