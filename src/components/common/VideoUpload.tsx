import React, { useState, useRef } from 'react';
import { Upload, X, Loader2, Check, AlertCircle, Video as VideoIcon } from 'lucide-react';
import { api } from '../../services/api';
import { supabaseClient, isSupabaseConfigured } from '../../services/supabaseClient';

interface VideoUploadProps {
  value?: string;
  onChange: (url: string) => void;
  label?: string;
  helperText?: string;
}

export const VideoUpload: React.FC<VideoUploadProps> = ({
  value,
  onChange,
  label = 'Vídeo (YouTube ou Arquivo Próprio)',
  helperText = 'Insira um link do YouTube/Vimeo ou envie um vídeo MP4/WebM do seu dispositivo (até 50MB).',
}) => {
  const [sourceType, setSourceType] = useState<'youtube' | 'upload'>(() => {
    if (value && (value.includes('youtube.com') || value.includes('youtu.be') || value.includes('vimeo.com'))) {
      return 'youtube';
    }
    if (value && (value.startsWith('http') || value.startsWith('/'))) {
      return 'upload';
    }
    return 'youtube';
  });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    // Validate type (MP4, WebM)
    const valid = file.type.includes('mp4') || file.type.includes('webm') || file.name.match(/\.(mp4|webm)$/i);
    if (!valid) {
      setError('Formato inválido. Por favor, envie um arquivo de vídeo MP4 ou WebM.');
      return;
    }

    // Validate size (50MB max)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('O vídeo é muito grande. O limite máximo de upload é de 50MB.');
      return;
    }

    try {
      setUploading(true);
      let url = '';

      if (isSupabaseConfigured) {
        try {
          const signedRes = await api.getSignedUploadUrl(file.name, file.type || 'video/mp4', 'videos');
          const { error: uploadError } = await supabaseClient.storage
            .from('tenant-media')
            .uploadToSignedUrl(signedRes.path, signedRes.token, file, {
              contentType: file.type || 'video/mp4',
              upsert: true,
            });
          if (uploadError) {
            throw new Error(uploadError.message);
          }
          url = signedRes.publicUrl;
        } catch (signedErr: any) {
          console.warn('[UPLOAD] Direct signed upload failed, falling back to base64 API:', signedErr);
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          url = await api.uploadSiteMedia(base64Data, file.name, file.type || 'video/mp4', 'videos');
        }
      } else {
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        url = await api.uploadSiteMedia(base64Data, file.name, file.type || 'video/mp4', 'videos');
      }

      onChange(url);
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar o vídeo para o armazenamento.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };


  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block font-bold text-slate-700 text-xs">{label}</label>
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => setSourceType('youtube')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              sourceType === 'youtube' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            YouTube / Vimeo
          </button>
          <button
            type="button"
            onClick={() => setSourceType('upload')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              sourceType === 'upload' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Enviar Arquivo (.mp4, .webm)
          </button>
        </div>
      </div>

      {sourceType === 'youtube' ? (
        <div>
          <input
            type="text"
            placeholder="https://www.youtube.com/watch?v=..."
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500 text-xs font-semibold"
          />
        </div>
      ) : (
        <div className="space-y-2">
          {value && !value.includes('youtube') && !value.includes('vimeo') ? (
            <div className="space-y-2">
              <div className="relative rounded-xl overflow-hidden bg-black aspect-video border border-slate-200">
                <video src={value} controls className="w-full h-full object-contain" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-emerald-600 font-semibold truncate flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Vídeo enviado e salvo com sucesso
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    Substituir
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange('')}
                    disabled={uploading}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    Remover
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
                uploading
                  ? 'bg-slate-50 border-slate-300 opacity-60 cursor-not-allowed'
                  : 'border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/30 bg-slate-50/50'
              }`}
            >
              {uploading ? (
                <div className="flex flex-col items-center justify-center space-y-2">
                  <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                  <p className="text-xs font-bold text-slate-700">Enviando vídeo para o Supabase Storage...</p>
                  <p className="text-[11px] text-slate-500">Isso pode levar alguns segundos dependendo da conexão.</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">Clique para selecionar ou arraste o vídeo</p>
                    <p className="text-[11px] text-slate-500">MP4 ou WebM (limite máx. 50MB)</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {error && (
        <p className="text-xs font-medium text-rose-600 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </p>
      )}
      <p className="text-[11px] text-slate-500 leading-relaxed">{helperText}</p>
    </div>
  );
};
