const API_BASE_URL = '/api';

export class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request(path, { token, headers = {}, ...options } = {}) {
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has('Accept')) {
    requestHeaders.set('Accept', 'application/json');
  }
  if (token) {
    requestHeaders.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: requestHeaders,
  });

  if (!response.ok) {
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    throw new ApiError(
      payload?.error?.message || 'A solicitação não pôde ser concluída.',
      { status: response.status, code: payload?.error?.code },
    );
  }

  return response;
}

export async function login(username, password) {
  const response = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return response.json();
}

export async function logout({ token } = {}) {
  await request('/auth/logout', { token, method: 'POST' });
}

export async function getUploadConfig({ signal } = {}) {
  const response = await request('/config', { signal });
  return response.json();
}

export async function listDocuments({ token, signal } = {}) {
  const response = await request('/documents', { token, signal });
  const payload = await response.json();
  return Array.isArray(payload.documents) ? payload.documents : [];
}

export async function uploadDocument(file, { token, signal } = {}) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await request('/upload', {
    token,
    signal,
    method: 'POST',
    body: formData,
  });
  return response.json();
}

function getDownloadFileName(contentDisposition, fallbackName) {
  const utf8Name = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8Name) {
    try {
      return decodeURIComponent(utf8Name.replace(/^"|"$/g, ''));
    } catch {
      return fallbackName;
    }
  }

  const quotedName = contentDisposition?.match(/filename="([^"]+)"/i)?.[1];
  return quotedName || fallbackName;
}

export async function downloadDocument(id, fallbackName, { token, signal } = {}) {
  const response = await request(`/documents/${encodeURIComponent(id)}/download`, {
    token,
    signal,
    headers: { Accept: '*/*' },
  });
  return {
    blob: await response.blob(),
    fileName: getDownloadFileName(response.headers.get('content-disposition'), fallbackName),
  };
}