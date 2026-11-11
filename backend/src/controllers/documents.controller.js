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
    async upload(req, res) {
      const document = await documentsService.upload(req.file, req.user.id);
      res.status(201).json(toPublicDocument(document));
    },

    async list(req, res) {
      const documents = await documentsService.list(req.user.id);
      res.json({ documents: documents.map(toPublicDocument) });
    },

    async download(req, res, next) {
      const { document, filePath } = await documentsService.getDownload(req.params.id, req.user.id);
      res.download(
        filePath,
        document.originalName,
        { headers: { 'Content-Type': document.contentType } },
        (error) => {
          if (error && !res.headersSent) {
            next(error);
          }
        },
      );
    },
  };
}

module.exports = createDocumentsController;