import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { supabaseAdmin, isRealSupabaseConfigured } from '../supabaseAdmin.js';

export interface IStorageService {
  uploadFile(buffer: Buffer, originalName: string, mimeType: string, tenantId?: string): Promise<string>;
  deleteFile(fileUrl: string, tenantId?: string): Promise<boolean>;
}

export class SupabaseStorageService implements IStorageService {
  private fallbackUploadDir: string;

  constructor() {
    this.fallbackUploadDir = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME ? '/tmp/uploads' : path.resolve(process.cwd(), 'data', 'uploads');
    try {
      if (!fs.existsSync(this.fallbackUploadDir)) {
        fs.mkdirSync(this.fallbackUploadDir, { recursive: true });
      }
    } catch (err) {
      console.warn('[STORAGE] Local fallback directory creation skipped (read-only FS):', err);
    }
  }

  async uploadFile(buffer: Buffer, originalName: string, mimeType: string, tenantId: string = 'global'): Promise<string> {
    const ext = path.extname(originalName) || '.png';
    const cleanFileName = `${crypto.randomUUID()}${ext}`;
    const storagePath = `${tenantId}/branding/${cleanFileName}`;

    try {
      let uploadRes = await supabaseAdmin
        .storage
        .from('tenant-media')
        .upload(storagePath, buffer, {
          contentType: mimeType || 'image/png',
          upsert: true,
        });

      if (uploadRes.error && (uploadRes.error.message?.toLowerCase().includes('not found') || uploadRes.error.message?.toLowerCase().includes('bucket'))) {
        try {
          if (typeof supabaseAdmin.storage.createBucket === 'function') {
            await supabaseAdmin.storage.createBucket('tenant-media', { public: true });
          }
          uploadRes = await supabaseAdmin
            .storage
            .from('tenant-media')
            .upload(storagePath, buffer, {
              contentType: mimeType || 'image/png',
              upsert: true,
            });
        } catch (createErr) {
          console.warn('[STORAGE] Bucket creation error:', createErr);
        }
      }

      if (!uploadRes.error) {
        const { data } = supabaseAdmin.storage.from('tenant-media').getPublicUrl(storagePath);
        if (data?.publicUrl) {
          return data.publicUrl;
        }
      } else {
        console.error('[STORAGE] Supabase upload failed with error:', uploadRes.error.message);
        if (isRealSupabaseConfigured) {
          throw new Error(`Erro ao enviar arquivo para o Supabase Storage: ${uploadRes.error.message}`);
        }
      }
    } catch (err: any) {
      if (isRealSupabaseConfigured) {
        throw err;
      }
      console.warn('[STORAGE] Supabase remote upload fallback to local directory:', err.message);
    }

    // Local fallback persistence
    try {
      if (!fs.existsSync(this.fallbackUploadDir)) {
        fs.mkdirSync(this.fallbackUploadDir, { recursive: true });
      }
      const localFilePath = path.join(this.fallbackUploadDir, cleanFileName);
      await fs.promises.writeFile(localFilePath, buffer);
      return `/uploads/${cleanFileName}`;
    } catch (err) {
      console.error('[STORAGE] Local fallback write failed:', err);
      throw new Error('Failed to upload file');
    }
  }

  async deleteFile(fileUrl: string, tenantId: string = 'global'): Promise<boolean> {
    try {
      const fileName = path.basename(fileUrl);
      const storagePath = `${tenantId}/branding/${fileName}`;
      await supabaseAdmin.storage.from('tenant-media').remove([storagePath]);

      const localFilePath = path.join(this.fallbackUploadDir, fileName);
      if (fs.existsSync(localFilePath)) {
        await fs.promises.unlink(localFilePath);
      }
      return true;
    } catch (err) {
      console.error('[STORAGE] Error deleting file:', err);
      return false;
    }
  }
}

export const storageService: IStorageService = new SupabaseStorageService();
