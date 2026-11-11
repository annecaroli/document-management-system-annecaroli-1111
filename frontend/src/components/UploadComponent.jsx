import { useRef, useState } from 'react';
import { formatFileSize } from '../utils/format.js';

function validateFile(file, maxFileSize, allowedExtensions) {
  if (!file) {
    return 'Selecione um arquivo para continuar.';
  }
  if (!maxFileSize || allowedExtensions.length === 0) {
    return 'As regras de upload ainda não estão disponíveis.';
  }

  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!allowedExtensions.includes(extension)) {
    return 'Este formato não é permitido.';
  }
  if (file.size > maxFileSize) {
    return `O arquivo excede o limite de ${formatFileSize(maxFileSize)}.`;
  }
  return '';
}

export function UploadComponent({ onUpload, disabled = false, maxFileSize = 0, allowedExtensions = [] }) {
  const inputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [validationMessage, setValidationMessage] = useState('');

  function handleFileChange(event) {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setValidationMessage(file ? validateFile(file, maxFileSize, allowedExtensions) : '');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const message = validateFile(selectedFile, maxFileSize, allowedExtensions);
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
          <span>{selectedFile ? formatFileSize(selectedFile.size) : allowedExtensions.map((extension) => extension.slice(1).toUpperCase()).join(', ') || 'Carregando formatos...'}</span>
        </span>
        <input
          ref={inputRef}
          id="document-file"
          type="file"
          accept={allowedExtensions.join(',')}
          onChange={handleFileChange}
          disabled={disabled || !maxFileSize || allowedExtensions.length === 0}
        />
      </label>
      <p className="upload-limit">
        {maxFileSize ? `Máximo de ${formatFileSize(maxFileSize)} por arquivo` : 'Carregando regras de upload...'}
      </p>
      {validationMessage && <p className="field-error" role="alert">{validationMessage}</p>}
      <button
        className="primary-button"
        type="submit"
        disabled={disabled || !selectedFile || !maxFileSize || allowedExtensions.length === 0}
      >
        {disabled ? 'Enviando...' : 'Enviar arquivo'}
        {!disabled && <span aria-hidden="true">↗</span>}
      </button>
    </form>
  );
}