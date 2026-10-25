import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { db } from '../db';

export interface StorageProvider {
  save(key: string, buffer: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  deleteByPrefix(prefix: string): Promise<void>;
}

class DatabaseStorageProvider implements StorageProvider {
  async save(key: string, buffer: Buffer, mimeType: string): Promise<void> {
    // Stored in the persistent database blobs
    // Handled in media creation / blob access
  }

  async get(key: string): Promise<Buffer | null> {
    return await db.getMediaBlob(key);
  }

  async delete(key: string): Promise<void> {
    // When media is deleted or consumed, blob is deleted from db
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    // Cascade delete on room removal handles this automatically
  }
}

class LocalDiskStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor() {
    this.baseDir = config.mediaDir;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async save(key: string, buffer: Buffer, _mimeType: string): Promise<void> {
    const filePath = path.join(this.baseDir, key);
    await fs.promises.writeFile(filePath, buffer);
  }

  async get(key: string): Promise<Buffer | null> {
    const filePath = path.join(this.baseDir, key);
    if (!fs.existsSync(filePath)) return null;
    return await fs.promises.readFile(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.baseDir, key);
    if (fs.existsSync(filePath)) {
      try {
        await fs.promises.unlink(filePath);
      } catch (e) {
        // ignore
      }
    }
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    if (!fs.existsSync(this.baseDir)) return;
    try {
      const files = await fs.promises.readdir(this.baseDir);
      for (const file of files) {
        if (file.startsWith(prefix)) {
          await this.delete(file);
        }
      }
    } catch (e) {
      console.error('Failed to delete files by prefix:', e);
    }
  }
}

export const storage: StorageProvider =
  config.storageType === 'db' ? new DatabaseStorageProvider() : new LocalDiskStorageProvider();
