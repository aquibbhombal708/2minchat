import crypto from 'crypto';
import { db } from '../db';
import { MessageModel } from '../db/schema';
import { storage } from '../storage';

export interface SendMessageInput {
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  type: 'text' | 'photo' | 'video' | 'document' | 'voice' | 'system';
  replyTo?: { id: string; senderName: string; text: string; type: string } | null;
  tempId?: string;
  isBlurred?: boolean;
}

export class MessageService {
  static async sendMessage(input: SendMessageInput): Promise<any> {
    const room = await db.getRoom(input.roomId);
    if (!room || room.expires_at <= Date.now()) {
      throw new Error('Room does not exist or has expired.');
    }

    if (input.type !== 'system') {
      const isKicked = await db.isUserKicked(input.roomId, input.senderId);
      if (isKicked) {
        throw new Error('You have been kicked from this room.');
      }
    }

    const isBlurred = input.type === 'system'
      ? false
      : typeof input.isBlurred === 'boolean'
      ? input.isBlurred
      : input.type === 'voice'
      ? false
      : (room.blur_enabled ?? true);

    const messageId = 'msg_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
    const msg: MessageModel = {
      id: messageId,
      room_id: input.roomId,
      sender_id: input.senderId,
      sender_name: input.senderName,
      content: input.content,
      type: input.type,
      reply_to_id: input.replyTo?.id || null,
      is_deleted: false,
      is_blurred: isBlurred,
      created_at: Date.now(),
    };

    await db.createMessage(msg);
    if (input.type !== 'system') {
      await db.setDeliveryStatus(messageId, input.senderId, 'sent');
    }

    return {
      id: msg.id,
      tempId: input.tempId,
      roomId: msg.room_id,
      senderId: msg.sender_id,
      senderName: msg.sender_name,
      content: msg.content,
      type: msg.type,
      deliveryState: 'sent',
      replyTo: input.replyTo || null,
      isDeleted: false,
      isBlurred: msg.is_blurred,
      createdAt: msg.created_at,
    };
  }

  static async getRoomMessages(roomId: string, currentUserId: string): Promise<any[]> {
    const rawMessages = await db.getMessagesByRoom(roomId);
    const mediaList = await db.getMediaByRoom(roomId);
    const mediaMap = new Map<string, any>();
    for (const m of mediaList) {
      mediaMap.set(m.message_id, {
        id: m.id,
        roomId: m.room_id,
        senderId: m.sender_id,
        filename: m.filename,
        originalName: m.original_name,
        mimeType: m.mime_type,
        size: m.size,
        duration: (m as any).duration || null,
        isViewOnce: m.is_view_once,
        isConsumed: m.is_consumed,
        createdAt: m.created_at,
      });
    }

    // Delivery states
    const result = await Promise.all(
      rawMessages.map(async (msg) => {
        let replyToData: any = null;
        if (msg.reply_to_id) {
          const orig = await db.getMessage(msg.reply_to_id);
          if (orig) {
            replyToData = {
              id: orig.id,
              senderName: orig.sender_name,
              text: orig.is_deleted ? 'This message was deleted.' : orig.content,
              type: orig.type,
            };
          }
        }

        const deliveryStates = await db.getDeliveryStates(msg.id);
        let deliveryState: 'sent' | 'delivered' | 'seen' = 'sent';
        if (deliveryStates.some((d) => d.status === 'seen' && d.user_id !== msg.sender_id)) {
          deliveryState = 'seen';
        } else if (
          deliveryStates.some((d) => d.status === 'delivered' && d.user_id !== msg.sender_id)
        ) {
          deliveryState = 'delivered';
        }

        return {
          id: msg.id,
          roomId: msg.room_id,
          senderId: msg.sender_id,
          senderName: msg.sender_name,
          content: msg.content,
          type: msg.type,
          deliveryState,
          replyTo: replyToData,
          media: mediaMap.get(msg.id) || null,
          isDeleted: msg.is_deleted,
          isBlurred: msg.is_blurred ?? (msg.type === 'system' || msg.type === 'voice' ? false : true),
          createdAt: msg.created_at,
        };
      })
    );

    return result;
  }

  static async deleteMessage(
    roomId: string,
    messageId: string,
    userId: string
  ): Promise<string | undefined> {
    const msg = await db.getMessage(messageId);
    if (!msg || msg.room_id !== roomId) {
      throw new Error('Message not found.');
    }

    const room = await db.getRoom(roomId);
    const isOwner = room?.owner_id === userId;
    const isSender = msg.sender_id === userId;

    if (!isSender && !isOwner) {
      throw new Error('You do not have permission to delete this message.');
    }

    const res = await db.deleteMessage(messageId);
    if (res?.mediaId) {
      await storage.delete(res.mediaId);
    }
    return res?.mediaId;
  }

  static async updateDeliveryState(
    messageId: string,
    userId: string,
    status: 'delivered' | 'seen'
  ): Promise<void> {
    await db.setDeliveryStatus(messageId, userId, status);
  }
}
