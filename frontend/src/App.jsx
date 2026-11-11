import { useEffect, useRef, useState } from 'react';
import { DocumentList } from './components/DocumentList.jsx';
import { UploadComponent } from './components/UploadComponent.jsx';
import { downloadDocument, getUploadConfig, listDocuments, login, logout, uploadDocument } from './services/api.js';
import './App.css';

function getErrorMessage(error) {
  if (error.status === 401) {
    return 'Sua sessão expirou. Entre novamente.';
  }
  return error.message || 'Não foi possível concluir a operação.';
}

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [authToken, setAuthToken] = useState(null);
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [uploadConfig, setUploadConfig] = useState(null);
  const authTokenRef = useRef(null);
  const documentRequestId = useRef(0);
  authTokenRef.current = authToken;

  function showApiError(error) {
    setErrorMessage(getErrorMessage(error));
    if (error.status === 401) {
      authTokenRef.current = null;
      documentRequestId.current += 1;
      setAuthToken(null);
      setUser(null);
    }
  }

  async function refreshDocuments(token = authToken) {
    if (!token) {
      documentRequestId.current += 1;
      setDocuments([]);
      setIsLoading(false);
      return;
    }

    const requestId = documentRequestId.current + 1;
    documentRequestId.current = requestId;
    setIsLoading(true);
    setErrorMessage('');
    try {
      const nextDocuments = await listDocuments({ token });
      if (requestId === documentRequestId.current) {
        setDocuments(nextDocuments);
      }
    } catch (error) {
      if (requestId === documentRequestId.current) {
        showApiError(error);
      }
    } finally {
      if (requestId === documentRequestId.current) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    refreshDocuments(authToken);
  }, [authToken]);

  useEffect(() => {
    const controller = new AbortController();
    getUploadConfig({ signal: controller.signal })
      .then(setUploadConfig)
      .catch((error) => {
        if (!controller.signal.aborted) {
          setErrorMessage(error.message || 'Não foi possível carregar as regras de upload.');
        }
      });
    return () => controller.abort();
  }, []);

  async function handleUpload(file) {
    const requestToken = authToken;
    setIsUploading(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const document = await uploadDocument(file, { token: authToken });
      if (authTokenRef.current !== requestToken) {
        return false;
      }
      setDocuments((currentDocuments) => [document, ...currentDocuments]);
      setSuccessMessage(`${document.originalName} enviado com sucesso.`);
      return true;
    } catch (error) {
      showApiError(error);
      return false;
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDownload(document) {
    const requestToken = authToken;
    setDownloadingId(document.id);
    setErrorMessage('');
    try {
      const download = await downloadDocument(document.id, document.originalName, { token: authToken });
      if (authTokenRef.current !== requestToken) {
        return;
      }
      const objectUrl = URL.createObjectURL(download.blob);
      const link = window.document.createElement('a');
      link.href = objectUrl;
      link.download = download.fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      showApiError(error);
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setIsLoggingIn(true);
    setErrorMessage('');
    try {
      const session = await login(username, password);
      authTokenRef.current = session.token;
      setAuthToken(session.token);
      setUser(session.user);
      setPassword('');
    } catch (error) {
      setErrorMessage(error.message || 'Não foi possível entrar. Tente novamente.');
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleLogout() {
    const token = authToken;
    authTokenRef.current = null;
    documentRequestId.current += 1;
    try {
      await logout({ token });
    } catch {
      // A sessão local é descartada mesmo se a API estiver indisponível.
    } finally {
      setAuthToken(null);
      setUser(null);
      setDocuments([]);
      setErrorMessage('');
    }
  }

  if (!authToken) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <a className="brand" href="/" aria-label="DMS, início">
            <span className="brand-mark" aria-hidden="true">D</span>
            <span>DMS<span className="brand-period">.</span></span>
          </a>
          <span className="topbar-status"><span aria-hidden="true" /> ACESSO RESTRITO</span>
        </header>
        <main className="auth-page">
          <section className="auth-panel" aria-labelledby="login-title">
            <p className="eyebrow">DOCUMENT MANAGEMENT SYSTEM</p>
            <h1 id="login-title">Acesse sua<br />biblioteca<span>.</span></h1>
            <form className="login-form" onSubmit={handleLogin}>
              <label htmlFor="username">Usuário</label>
              <input
                id="username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
              <label htmlFor="password">Senha</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              {errorMessage && <p className="field-error" role="alert">{errorMessage}</p>}
              <button className="primary-button login-button" type="submit" disabled={isLoggingIn}>
                {isLoggingIn ? 'Entrando...' : 'Entrar'}
                {!isLoggingIn && <span aria-hidden="true">↗</span>}
              </button>
            </form>
          </section>
          <div className="auth-rail" aria-hidden="true"><span>DMS / 01</span></div>
        </main>
        <footer className="app-footer">
          <span>DMS <span className="footer-separator">/</span> ARMAZENAMENTO LOCAL</span>
          <span>METADADOS EM MEMÓRIA</span>
        </footer>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="DMS, início">
          <span className="brand-mark" aria-hidden="true">D</span>
          <span>DMS<span className="brand-period">.</span></span>
        </a>
        <span className="topbar-label">GESTÃO DE DOCUMENTOS</span>
        <div className="topbar-session">
          <span className="topbar-status"><span aria-hidden="true" /> {user?.username}</span>
          <button type="button" className="logout-button" onClick={handleLogout}>Sair</button>
        </div>
      </header>

      <main className="workspace">
        <section className="page-heading" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">ESPAÇO DE TRABALHO / DOCUMENTOS</p>
            <h1 id="page-title">Seus arquivos<span>.</span></h1>
            <p className="page-description">Envie e acesse seus documentos em um só lugar.</p>
          </div>
          <div className="document-counter" aria-live="polite">
            <span className="counter-value">{documents.length.toString().padStart(2, '0')}</span>
            <span className="counter-label">{documents.length === 1 ? 'DOCUMENTO' : 'DOCUMENTOS'}</span>
          </div>
        </section>

        {errorMessage && (
          <div className="feedback feedback-error" role="alert">
            <span>{errorMessage}</span>
            <button type="button" className="text-button" onClick={refreshDocuments}>
              Tentar novamente
            </button>
          </div>
        )}
        {successMessage && (
          <div className="feedback feedback-success" role="status">
            {successMessage}
            <button type="button" className="feedback-dismiss" onClick={() => setSuccessMessage('')} aria-label="Dispensar aviso">
              ×
            </button>
          </div>
        )}

        <div className="content-grid">
          <aside className="upload-panel" aria-labelledby="upload-title">
            <div className="section-heading">
              <span className="section-index">01</span>
              <h2 id="upload-title">Adicionar arquivo</h2>
            </div>
            <UploadComponent
              onUpload={handleUpload}
              disabled={isUploading}
              maxFileSize={uploadConfig?.maxFileSize || 0}
              allowedExtensions={uploadConfig?.allowedExtensions || []}
            />
          </aside>

          <section className="documents-panel" aria-labelledby="documents-title">
            <div className="section-heading documents-heading">
              <div className="section-title-group">
                <span className="section-index">02</span>
                <h2 id="documents-title">Biblioteca</h2>
              </div>
              <button
                type="button"
                className="refresh-button"
                onClick={refreshDocuments}
                disabled={isLoading}
                title="Atualizar lista"
              >
                <span aria-hidden="true">↻</span> Atualizar
              </button>
            </div>
            <DocumentList
              documents={documents}
              isLoading={isLoading}
              downloadingId={downloadingId}
              onDownload={handleDownload}
            />
          </section>
        </div>
      </main>
      <footer className="app-footer">
        <span>DMS <span className="footer-separator">/</span> ARMAZENAMENTO LOCAL</span>
        <span>METADADOS EM MEMÓRIA</span>
      </footer>
    </div>
  );
}
