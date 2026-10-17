import React, { useState, useRef } from 'react';
import { Upload, X, Loader2, Image as ImageIcon, AlertCircle, Sparkles } from 'lucide-react';
import { api } from '../../services/api';
import { optimizeImage } from '../../utils/imageOptimizer';

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  subfolder?: string;
  label?: string;
  helperText?: string;
  aspectRatio?: 'square' | 'video' | 'banner' | 'auto';
  autoOptimize?: boolean; // automatically resize and optimize
  className?: string;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  value,
  onChange,
  subfolder = 'general',
  label,
  helperText = 'Formatos suportados: PNG, JPG, WEBP até 10MB',
  aspectRatio = 'auto',
  autoOptimize = true,
  className = '',
}) => {
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileProcess = async (file: File) => {
    setError(null);

    // Validate mime type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      setError('Formato inválido. Por favor, envie uma imagem JPEG, PNG, WEBP ou SVG.');
      return;
    }

    // Validate size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('O arquivo é muito grande. O limite máximo é de 10MB.');
      return;
    }

    try {
      setLoading(true);

      let payloadDataUrl = '';
      let mimeType = file.type;

      if (autoOptimize && file.type !== 'image/svg+xml' && file.type !== 'image/gif') {
        setOptimizing(true);
        try {
          const optimized = await optimizeImage(file, {
            maxWidth: 1920,
            maxHeight: 1920,
            quality: 0.88,
          });
          payloadDataUrl = optimized.dataUrl;
          mimeType = payloadDataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
        } catch {
          // Fallback to raw base64 if canvas optimization fails
          payloadDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        } finally {
          setOptimizing(false);
        }
      } else {
        payloadDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      const url = await api.uploadSiteMedia(payloadDataUrl, file.name, mimeType, subfolder);
      onChange(url);
    } catch (err: any) {
      setError(err.message || 'Erro no processamento da imagem.');
    } finally {
      setLoading(false);
      setOptimizing(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileProcess(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const aspectClass =
    aspectRatio === 'square'
      ? 'aspect-square'
      : aspectRatio === 'video'
      ? 'aspect-video'
      : aspectRatio === 'banner'
      ? 'aspect-[21/9]'
      : 'min-h-[140px]';

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && <label className="block text-xs font-bold text-slate-700">{label}</label>}

      {value ? (
        <div className={`relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 group ${aspectClass}`}>
          <img
            src={value}
            alt="Upload preview"
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="px-3 py-1.5 bg-white/90 hover:bg-white text-slate-900 rounded-lg text-xs font-semibold shadow-md transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Substituir
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={loading}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-md transition-all cursor-pointer flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              Remover
            </button>
          </div>
          {loading && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !loading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
            dragOver
              ? 'border-indigo-500 bg-indigo-50/50'
              : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-50'
          } ${aspectClass}`}
        >
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-indigo-600">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-xs font-semibold">
                {optimizing ? 'Otimizando enquadramento e resolução...' : 'Enviando imagem otimizada...'}
              </span>
            </div>
          ) : (
            <>
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 mb-2">
                <ImageIcon className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-slate-800">
                Clique para escolher ou arraste a imagem
              </p>
              <div className="flex items-center justify-center gap-1 mt-1 text-[11px] text-emerald-600 font-medium">
                <Sparkles className="w-3 h-3" />
                <span>Otimização inteligente automática</span>
              </div>
              <p className="text-[10px] text-slate-600 mt-0.5">{helperText}</p>
            </>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-rose-600 font-medium flex items-center gap-1.5 mt-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif"
        onChange={handleInputChange}
        className="hidden"
      />
    </div>
  );
};
