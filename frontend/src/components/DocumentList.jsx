import { DownloadButton } from './DownloadButton.jsx';

function formatFileSize(size) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function getFileExtension(fileName) {
  const extension = fileName.split('.').pop();
  return extension && extension !== fileName ? extension.toUpperCase() : 'ARQ';
}

export function DocumentList({ documents, isLoading, downloadingId, onDownload }) {
  if (isLoading) {
    return <div className="list-state" role="status">Carregando documentos...</div>;
  }

  if (documents.length === 0) {
    return (
      <div className="list-state empty-state">
        <span className="empty-mark" aria-hidden="true">—</span>
        <p>Nenhum documento por aqui.</p>
      </div>
    );
  }

  return (
    <div className="document-table-wrap">
      <table className="document-table">
        <thead>
          <tr>
            <th scope="col">Nome</th>
            <th scope="col">Adicionado</th>
            <th scope="col">Tamanho</th>
            <th scope="col"><span className="visually-hidden">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => (
            <tr key={document.id}>
              <td data-label="Nome">
                <div className="document-name-cell">
                  <span className="file-type" aria-hidden="true">{getFileExtension(document.originalName)}</span>
                  <span className="document-name" title={document.originalName}>{document.originalName}</span>
                </div>
              </td>
              <td data-label="Adicionado" className="document-date">{formatDate(document.uploadedAt)}</td>
              <td data-label="Tamanho" className="document-size">{formatFileSize(document.size)}</td>
              <td className="document-actions">
                <DownloadButton
                  document={document}
                  isLoading={downloadingId === document.id}
                  onDownload={onDownload}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}