export function DownloadButton({ document, isLoading = false, onDownload }) {
  return (
    <button
      type="button"
      className="download-button"
      onClick={() => onDownload(document)}
      disabled={isLoading}
      aria-label={`Baixar ${document.originalName}`}
    >
      <span aria-hidden="true">{isLoading ? '…' : '↓'}</span>
      <span>{isLoading ? 'Baixando' : 'Baixar'}</span>
    </button>
  );
}