// Seed do servidor backend do Document Management System.
//
// Este arquivo é apenas um ponto de partida mínimo. Ao longo do workshop você
// vai usar o Agent Mode do GitHub Copilot para construir as camadas:
//   - routes/       (definição das rotas)
//   - controllers/  (entrada HTTP e validação)
//   - services/     (regras de negócio)
//   - repositories/ (persistência: arquivos locais + metadados em memória)
//
// Restrição do projeto: uploads são gravados no filesystem local da aplicação
// usando multer com diskStorage. Não utilize provedores externos.

const express = require('express');
const path = require('node:path');
const createDocumentsRepository = require('./repositories/documents.repository');
const createDocumentsService = require('./services/documents.service');
const createDocumentsController = require('./controllers/documents.controller');
const createDocumentsRouter = require('./routes/documents.routes');

const app = express();
const PORT = process.env.PORT || 3000;
const storageDir = path.resolve(process.env.DMS_STORAGE_DIR || path.join(__dirname, '../storage'));
const maxFileSize = Number.parseInt(process.env.DMS_MAX_FILE_SIZE_BYTES || '10485760', 10);

if (!Number.isSafeInteger(maxFileSize) || maxFileSize <= 0) {
  throw new Error('DMS_MAX_FILE_SIZE_BYTES deve ser um inteiro positivo');
}

app.use(express.json());

const documentsRepository = createDocumentsRepository({ storageDir });
const documentsService = createDocumentsService(documentsRepository, {
  allowedExtensions: process.env.DMS_ALLOWED_EXTENSIONS,
  maxFileSize,
});
const documentsController = createDocumentsController(documentsService);

app.use(createDocumentsRouter({ documentsController, storageDir, maxFileSize }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`DMS backend ouvindo na porta ${PORT}`);
  });
}

module.exports = app;
