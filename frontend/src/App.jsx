import { useEffect, useState } from 'react';
import { DocumentList } from './components/DocumentList.jsx';
import { UploadComponent } from './components/UploadComponent.jsx';
import { downloadDocument, listDocuments, uploadDocument } from './services/api.js';
import './App.css';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function getErrorMessage(error) {
  if (error.status === 401) {
    return 'A API exige uma sessão autenticada. O fluxo de login ainda não está conectado.';
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

  async function refreshDocuments() {
    setIsLoading(true);
    setErrorMessage('');
    try {
      setDocuments(await listDocuments());
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refreshDocuments();
  }, []);

  async function handleUpload(file) {
    setIsUploading(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const document = await uploadDocument(file);
      setDocuments((currentDocuments) => [document, ...currentDocuments]);
      setSuccessMessage(`${document.originalName} enviado com sucesso.`);
      return true;
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      return false;
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDownload(document) {
    setDownloadingId(document.id);
    setErrorMessage('');
    try {
      const download = await downloadDocument(document.id, document.originalName);
      const objectUrl = URL.createObjectURL(download.blob);
      const link = window.document.createElement('a');
      link.href = objectUrl;
      link.download = download.fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="DMS, início">
          <span className="brand-mark" aria-hidden="true">D</span>
          <span>DMS<span className="brand-period">.</span></span>
        </a>
        <span className="topbar-label">GESTÃO DE DOCUMENTOS</span>
        <span className="topbar-status"><span aria-hidden="true" /> ARQUIVO LOCAL</span>
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
            <UploadComponent onUpload={handleUpload} disabled={isUploading} maxFileSize={MAX_FILE_SIZE} />
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
