const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const createDocumentsRepository = require('../src/repositories/documents.repository');

test('repository rejects traversal names and symbolic links', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dms-storage-'));
  const storageDir = path.join(rootDir, 'storage');
  const outsidePath = path.join(rootDir, 'outside.txt');
  await fs.writeFile(outsidePath, 'nao deve ser lido');
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));

  const repository = createDocumentsRepository({ storageDir });
  await repository.initialize();
  const directoryStats = await fs.stat(storageDir);
  assert.equal(directoryStats.mode & 0o777, 0o700);

  await assert.rejects(repository.readFile('../outside.txt'), /Nome de armazenamento inválido/);

  const symbolicLinkName = '12345678-1234-4234-8234-123456789abc';
  await fs.symlink(outsidePath, path.join(storageDir, symbolicLinkName));
  await assert.rejects(repository.readFile(symbolicLinkName), { code: 'ELOOP' });
  await assert.rejects(repository.createReadStream(symbolicLinkName), { code: 'ELOOP' });
});

test('repository rejects a symbolic link as the storage directory', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dms-storage-link-'));
  const realDir = path.join(rootDir, 'real');
  const linkedDir = path.join(rootDir, 'linked');
  await fs.mkdir(realDir);
  await fs.symlink(realDir, linkedDir, 'dir');
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));

  const repository = createDocumentsRepository({ storageDir: linkedDir });
  await assert.rejects(repository.initialize(), /diretório real/);
});

test('repository reservations enforce total quota across concurrent users', async (t) => {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dms-storage-quota-'));
  t.after(() => fs.rm(storageDir, { recursive: true, force: true }));

  const repository = createDocumentsRepository({ storageDir });
  await repository.initialize();
  const releaseFirst = repository.reserveUpload('user-a', 8, 100, 10);
  assert.equal(typeof releaseFirst, 'function');
  assert.equal(repository.reserveUpload('user-b', 3, 100, 10), null);
  releaseFirst();
  assert.equal(typeof repository.reserveUpload('user-b', 3, 100, 10), 'function');
});