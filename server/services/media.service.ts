import crypto from 'crypto';
import { db } from '../db';
import { storage } from '../storage';
import { MediaModel } from '../db/schema';
import { MessageService } from './message.service';

export interface UploadMediaInput {
  roomId: string;
  senderId: string;
  senderName: string;
  fileBuffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
  type: 'photo' | 'video' | 'document' | 'voice';
  duration?: number;
  isViewOnce: boolean;
  replyTo?: any;
  tempId?: string;
}

export class MediaService {
  static async uploadMedia(input: UploadMediaInput): Promise<any> {
    const room = await db.getRoom(input.roomId);
    if (!room || room.expires_at <= Date.now()) {
      throw new Error('Room not found or has expired.');
    }

    const isKicked = await db.isUserKicked(input.roomId, input.senderId);
    if (isKicked) {
      throw new Error('You have been kicked from this room.');
    }

    if (input.size > 50 * 1024 * 1024) {
      throw new Error('Attachment exceeds maximum allowed threshold of 50MB.');
    }

    const mediaId = 'med_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
    const storageKey = `${input.roomId}_${mediaId}`;

    let finalMime = input.mimeType || 'application/octet-stream';
    if (input.type === 'voice') {
      if (!finalMime || finalMime === 'application/octet-stream') {
        finalMime = input.originalName?.endsWith('.mp4') ? 'audio/mp4' : 'audio/webm';
      }
    }

    // 1. Create message first
    const msg = await MessageService.sendMessage({
      roomId: input.roomId,
      senderId: input.senderId,
      senderName: input.senderName,
      content: input.originalName || (input.type === 'voice' ? 'Voice Memo' : 'Attached Media'),
      type: input.type,
      replyTo: input.replyTo,
      tempId: input.tempId,
    });

    // 2. Save media record and blob
    const media: MediaModel = {
      id: mediaId,
      room_id: input.roomId,
      message_id: msg.id,
      sender_id: input.senderId,
      filename: `${mediaId}_${input.originalName.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
      original_name: input.originalName,
      mime_type: finalMime,
      size: input.size,
      duration: input.duration || null,
      storage_key: storageKey,
      is_view_once: input.isViewOnce,
      is_consumed: false,
      consumed_at: null,
      created_at: Date.now(),
    };

    await db.createMedia(media, input.fileBuffer);
    await storage.save(storageKey, input.fileBuffer, media.mime_type);

    return {
      ...msg,
      media: {
        id: media.id,
        roomId: media.room_id,
        senderId: media.sender_id,
        filename: media.filename,
        originalName: media.original_name,
        mimeType: media.mime_type,
        size: media.size,
        duration: media.duration || null,
        isViewOnce: media.is_view_once,
        isConsumed: false,
        createdAt: media.created_at,
      },
    };
  }

  static async getMediaStream(
    roomId: string,
    mediaId: string,
    userId: string
  ): Promise<{ buffer: Buffer; mimeType: string; originalName: string }> {
    const room = await db.getRoom(roomId);
    if (!room || room.expires_at <= Date.now()) {
      throw new Error('Room has expired or does not exist.');
    }

    const isKicked = await db.isUserKicked(roomId, userId);
    if (isKicked) {
      throw new Error('You do not have access to this room.');
    }

    const media = await db.getMedia(mediaId);
    if (!media || media.room_id !== roomId) {
      throw new Error('Media asset not found.');
    }

    // View Once access rules
    if (media.is_view_once) {
      if (media.sender_id === userId) {
        throw new Error('Sender is not authorized to access dispatched View Once media.');
      }
      if (media.is_consumed) {
        throw new Error('This View Once media has already been consumed and permanently deleted.');
      }
    }

    // Retrieve binary from Database Blob or Storage Provider
    let buffer = await db.getMediaBlob(mediaId);
    if (!buffer) {
      buffer = await storage.get(media.storage_key);
    }

    if (!buffer) {
      throw new Error('Media binary is no longer available on server.');
    }

    return {
      buffer,
      mimeType: media.mime_type,
      originalName: media.original_name,
    };
  }

  static async consumeViewOnce(roomId: string, mediaId: string, userId: string): Promise<void> {
    const media = await db.getMedia(mediaId);
    if (!media || media.room_id !== roomId) {
      throw new Error('Media not found.');
    }

    if (!media.is_view_once) {
      return; // Normal media is not consumable
    }

    if (media.sender_id === userId) {
      throw new Error('Sender cannot consume View Once media.');
    }

    if (media.is_consumed) {
      throw new Error('Media is already consumed.');
    }

    await db.markMediaConsumed(mediaId, userId);
    await storage.delete(media.storage_key);
  }
}
