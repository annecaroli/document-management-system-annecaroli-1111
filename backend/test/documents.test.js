const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { randomBytes, scryptSync } = require('node:crypto');
const appModule = require('../src/app');

function makePasswordHash(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

function crc32(buffer) {
  let checksum = 0xffffffff;
  for (const byte of buffer) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      checksum = (checksum >>> 1) ^ (0xedb88320 & -(checksum & 1));
    }
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const localRecords = [];
  const centralRecords = [];
  let localOffset = 0;

  for (const [fileName, value] of entries) {
    const name = Buffer.from(fileName);
    const content = Buffer.from(value);
    const checksum = crc32(content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localRecords.push(localHeader, name, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralRecords.push(centralHeader, name);
    localOffset += localHeader.length + name.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  const entryCount = entries.length;
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(entryCount, 8);
  endRecord.writeUInt16LE(entryCount, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localRecords, centralDirectory, endRecord]);
}

test('real app authenticates users and isolates document upload, list and download', async (t) => {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dms-documents-'));
  t.after(() => fs.rm(storageDir, { recursive: true, force: true }));

  const pdfContent = '%PDF-1.7\nconteudo de teste\n%%EOF';
  const officeContent = makeZip([
    ['[Content_Types].xml', '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['word/document.xml', '<w:document xmlns:w="urn:test"><w:body/></w:document>'],
  ]);
  const app = appModule.createApp({
    storageDir,
    maxFileSize: 4096,
    maxStoragePerUserBytes: Buffer.byteLength(pdfContent) + officeContent.length * 2 - 1,
    maxStorageBytes: 8192,
    usersJson: JSON.stringify([
      { id: 'user-a', username: 'alice', passwordHash: makePasswordHash('alice-password') },
      { id: 'user-b', username: 'bob', passwordHash: makePasswordHash('bob-password') },
    ]),
  });
  await app.initialize();

  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const configResponse = await fetch(`${baseUrl}/config`);
  assert.deepEqual(await configResponse.json(), {
    maxFileSize: 4096,
    allowedExtensions: ['.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.csv'],
  });

  const unauthenticatedResponse = await fetch(`${baseUrl}/documents`);
  assert.equal(unauthenticatedResponse.status, 401);

  const invalidLoginResponse = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'wrong-password' }),
  });
  assert.equal(invalidLoginResponse.status, 401);

  async function login(username, password) {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    assert.equal(response.status, 200);
    return (await response.json()).token;
  }

  const tokenA = await login('alice', 'alice-password');
  const tokenB = await login('bob', 'bob-password');
  const ownerHeaders = { Authorization: `Bearer ${tokenA}` };

  const uploadBody = new FormData();
  uploadBody.append('file', new Blob([pdfContent], { type: 'application/pdf' }), 'relatorio.pdf');
  const uploadResponse = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    headers: ownerHeaders,
    body: uploadBody,
  });

  assert.equal(uploadResponse.status, 201);
  const uploadedDocument = await uploadResponse.json();
  assert.equal(uploadedDocument.originalName, 'relatorio.pdf');
  assert.equal(uploadedDocument.size, Buffer.byteLength(pdfContent));
  assert.equal('ownerId' in uploadedDocument, false);
  assert.equal('storageName' in uploadedDocument, false);

  const officeBody = new FormData();
  officeBody.append('file', new Blob([officeContent]), 'contrato.docx');
  const officeResponse = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    headers: ownerHeaders,
    body: officeBody,
  });
  assert.equal(officeResponse.status, 201);
  assert.equal((await officeResponse.json()).contentType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

  const fakeOfficeBody = new FormData();
  fakeOfficeBody.append(
    'file',
    new Blob(['PK [Content_Types].xml word/document.xml']),
    'falso.docx',
  );
  const fakeOfficeResponse = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    headers: ownerHeaders,
    body: fakeOfficeBody,
  });
  assert.equal(fakeOfficeResponse.status, 415);
  assert.equal((await fs.readdir(storageDir)).length, 2);

  const ownerListResponse = await fetch(`${baseUrl}/documents`, {
    headers: ownerHeaders,
  });
  assert.deepEqual(
    (await ownerListResponse.json()).documents.map((document) => document.originalName).sort(),
    ['contrato.docx', 'relatorio.pdf'],
  );

  const otherUserListResponse = await fetch(`${baseUrl}/documents`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.deepEqual((await otherUserListResponse.json()).documents, []);

  const forbiddenDownloadResponse = await fetch(`${baseUrl}/documents/${uploadedDocument.id}/download`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.equal(forbiddenDownloadResponse.status, 404);

  const downloadResponse = await fetch(`${baseUrl}/documents/${uploadedDocument.id}/download`, {
    headers: ownerHeaders,
  });
  assert.equal(downloadResponse.status, 200);
  assert.equal(downloadResponse.headers.get('content-type'), 'application/pdf');
  assert.match(downloadResponse.headers.get('content-disposition'), /attachment/);
  assert.equal(await downloadResponse.text(), pdfContent);

  const quotaBody = new FormData();
  quotaBody.append('file', new Blob([officeContent]), 'limite.docx');
  const quotaResponse = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    headers: ownerHeaders,
    body: quotaBody,
  });
  assert.equal(quotaResponse.status, 413);

  const logoutResponse = await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST',
    headers: ownerHeaders,
  });
  assert.equal(logoutResponse.status, 204);
  const loggedOutResponse = await fetch(`${baseUrl}/documents`, { headers: ownerHeaders });
  assert.equal(loggedOutResponse.status, 401);

  const unsupportedBody = new FormData();
  unsupportedBody.append('file', new Blob(['binario'], { type: 'application/octet-stream' }), 'arquivo.exe');
  const unsupportedResponse = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: unsupportedBody,
  });
  assert.equal(unsupportedResponse.status, 415);

  const oversizedBody = new FormData();
  oversizedBody.append('file', new Blob(['%PDF-1.7\n' + 'x'.repeat(8192)], { type: 'application/pdf' }), 'grande.pdf');
  const oversizedResponse = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: oversizedBody,
  });
  assert.equal(oversizedResponse.status, 413);
});