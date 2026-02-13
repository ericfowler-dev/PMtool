import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, X, CheckCircle, AlertCircle } from 'lucide-react';

export default function FileUpload({ onUpload, accept = '.csv,.xlsx,.xls', label = 'Upload Price List' }) {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState(null); // null | 'uploading' | 'success' | 'error'
  const [message, setMessage] = useState('');
  const inputRef = useRef(null);

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    setStatus(null);
    setMessage('');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleSubmit = async () => {
    if (!file || status === 'uploading') return;
    setStatus('uploading');
    try {
      const result = await onUpload(file);
      setStatus('success');
      setMessage(result?.message || `Uploaded ${result?.items_count || ''} items successfully`);
      setTimeout(() => { setFile(null); setStatus(null); setMessage(''); }, 3000);
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Upload failed');
    }
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl cursor-pointer
          transition-all duration-200
          ${dragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100'}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
        <Upload size={32} className={`mb-3 ${dragOver ? 'text-brand-500' : 'text-gray-400'}`} />
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-500 mt-1">Drag & drop or click to browse. CSV or Excel files accepted.</p>
      </div>

      {file && (
        <div className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg">
          <FileSpreadsheet size={20} className="text-brand-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
            <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
          {status === null && (
            <div className="flex gap-2">
              <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="btn btn-ghost btn-sm">
                <X size={14} />
              </button>
              <button onClick={handleSubmit} className="btn btn-primary btn-sm">Upload</button>
            </div>
          )}
          {status === 'uploading' && (
            <div className="flex items-center gap-2 text-sm text-brand-600">
              <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              Processing...
            </div>
          )}
          {status === 'success' && (
            <div className="flex items-center gap-1 text-sm text-emerald-600">
              <CheckCircle size={16} /> {message}
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-center gap-1 text-sm text-red-600">
              <AlertCircle size={16} /> {message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
