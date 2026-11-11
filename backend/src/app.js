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
const createUsersRepository = require('./repositories/users.repository');
const createAuthService = require('./services/auth.service');
const createAuthController = require('./controllers/auth.controller');
const createAuthRouter = require('./routes/auth.routes');
const createAuthMiddleware = require('./middleware/auth.middleware');
const errorHandler = require('./middleware/error-handler');
const createDocumentsRepository = require('./repositories/documents.repository');
const createDocumentsService = require('./services/documents.service');
const createDocumentsController = require('./controllers/documents.controller');
const createDocumentsRouter = require('./routes/documents.routes');

const PORT = process.env.PORT || 3000;

function readPositiveInteger(value, name, defaultValue) {
  if (value === undefined || value === '') {
    return defaultValue;
  }
  if (!/^\d+$/.test(String(value))) {
    throw new Error(`${name} deve ser um inteiro positivo`);
  }

  const parsedValue = Number(value);
  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${name} deve ser um inteiro positivo`);
  }
  return parsedValue;
}

function createApp(options = {}) {
  const storageDir = path.resolve(options.storageDir || process.env.DMS_STORAGE_DIR || path.join(__dirname, '../storage'));
  const maxFileSize = readPositiveInteger(options.maxFileSize ?? process.env.DMS_MAX_FILE_SIZE_BYTES, 'DMS_MAX_FILE_SIZE_BYTES', 10485760);
  const maxStoragePerUserBytes = readPositiveInteger(
    options.maxStoragePerUserBytes ?? process.env.DMS_MAX_STORAGE_PER_USER_BYTES,
    'DMS_MAX_STORAGE_PER_USER_BYTES',
    1073741824,
  );
  const maxStorageBytes = readPositiveInteger(
    options.maxStorageBytes ?? process.env.DMS_MAX_STORAGE_BYTES,
    'DMS_MAX_STORAGE_BYTES',
    1073741824,
  );
  const sessionTtlSeconds = readPositiveInteger(
    options.sessionTtlSeconds ?? process.env.DMS_SESSION_TTL_SECONDS,
    'DMS_SESSION_TTL_SECONDS',
    3600,
  );
  const usersJson = options.usersJson ?? process.env.DMS_USERS_JSON ?? '[]';

  const usersRepository = createUsersRepository(usersJson);
  const authService = createAuthService(usersRepository, { sessionTtlSeconds });
  const authController = createAuthController(authService);
  const requireAuthenticatedUser = createAuthMiddleware(authService);
  const documentsRepository = createDocumentsRepository({ storageDir });
  const documentsService = createDocumentsService(documentsRepository, {
    allowedExtensions: options.allowedExtensions ?? process.env.DMS_ALLOWED_EXTENSIONS,
    maxFileSize,
    maxStoragePerUserBytes,
    maxStorageBytes,
  });
  const documentsController = createDocumentsController(documentsService);
  const app = express();

  app.use(express.json({ limit: '16kb' }));
  app.use(createAuthRouter({ authController, requireAuthenticatedUser }));
  app.use(createDocumentsRouter({
    documentsController,
    storageDir,
    maxFileSize,
    prepareStorage: documentsRepository.prepareStorage,
    requireAuthenticatedUser,
  }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso não encontrado' } });
  });

  app.use(errorHandler);
  app.locals.hasConfiguredUsers = authService.hasUsers;
  app.initialize = documentsRepository.initialize;
  return app;
}

const app = createApp();

if (require.main === module) {
  if (!app.locals.hasConfiguredUsers) {
    throw new Error('Configure ao menos um usuário em DMS_USERS_JSON antes de iniciar o backend');
  }

  app.initialize().then(() => {
    app.listen(PORT, () => {
      console.log(`DMS backend ouvindo na porta ${PORT}`);
    });
  }).catch((error) => {
    console.error('Não foi possível preparar o armazenamento do DMS', error.code || 'UNKNOWN');
    process.exitCode = 1;
  });
}

module.exports = app;
module.exports.createApp = createApp;
