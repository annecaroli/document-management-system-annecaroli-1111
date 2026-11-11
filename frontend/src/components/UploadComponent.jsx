import { useRef, useState } from 'react';

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.csv'];

function formatFileSize(size) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file, maxFileSize) {
  if (!file) {
    return 'Selecione um arquivo para continuar.';
  }

  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return 'Este formato não é permitido.';
  }
  if (file.size > maxFileSize) {
    return `O arquivo excede o limite de ${formatFileSize(maxFileSize)}.`;
  }
  return '';
}

export function UploadComponent({ onUpload, disabled = false, maxFileSize = 10 * 1024 * 1024 }) {
  const inputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [validationMessage, setValidationMessage] = useState('');

  function handleFileChange(event) {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setValidationMessage(file ? validateFile(file, maxFileSize) : '');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const message = validateFile(selectedFile, maxFileSize);
    if (message) {
      setValidationMessage(message);
      return;
    }

    setValidationMessage('');
    const uploaded = await onUpload(selectedFile);
    if (uploaded) {
      setSelectedFile(null);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  }

  return (
    <form className="upload-form" onSubmit={handleSubmit}>
      <label className={`file-picker${selectedFile ? ' file-picker-selected' : ''}`} htmlFor="document-file">
        <span className="file-picker-icon" aria-hidden="true">＋</span>
        <span className="file-picker-copy">
          <strong>{selectedFile ? selectedFile.name : 'Escolher documento'}</strong>
          <span>{selectedFile ? formatFileSize(selectedFile.size) : 'PDF, DOCX, XLSX, PPTX, TXT ou CSV'}</span>
        </span>
        <input
          ref={inputRef}
          id="document-file"
          type="file"
          accept={ALLOWED_EXTENSIONS.join(',')}
          onChange={handleFileChange}
          disabled={disabled}
        />
      </label>
      <p className="upload-limit">Máximo de {formatFileSize(maxFileSize)} por arquivo</p>
      {validationMessage && <p className="field-error" role="alert">{validationMessage}</p>}
      <button className="primary-button" type="submit" disabled={disabled || !selectedFile}>
        {disabled ? 'Enviando...' : 'Enviar arquivo'}
        {!disabled && <span aria-hidden="true">↗</span>}
      </button>
    </form>
  );
}