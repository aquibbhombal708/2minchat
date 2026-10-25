import crypto from 'crypto';
import { db } from '../db';
import { AuthService } from './auth.service';
import { storage } from '../storage';
import { RealtimeService } from './realtime.service';
import { MessageService } from './message.service';
import { RoomModel, RoomMemberModel } from '../db/schema';

export interface CreateRoomInput {
  name: string;
  roomId?: string;
  code: string;
  lifetimeHours?: number;
  isHidden?: boolean;
  secretCode?: string;
  ownerId: string;
}

export class RoomService {
  static async createRoom(input: CreateRoomInput): Promise<{ room: RoomModel; roomToken: string }> {
    const cleanId = (
      input.roomId?.trim() ||
      'room-' + crypto.randomBytes(4).toString('hex')
    ).toLowerCase().replace(/[^a-z0-9_-]/g, '');

    const existing = await db.getRoom(cleanId);
    if (existing) {
      if (existing.expires_at > Date.now()) {
        throw new Error('Room ID is already occupied by an active session.');
      }
      // If previously expired, clean up
      await db.deleteRoom(cleanId);
    }

    const codeHash = await AuthService.hashCode(input.code);
    const secretCodeHash =
      input.isHidden && input.secretCode ? AuthService.hashSecretCode(input.secretCode) : null;

    let lifetimeHours = 24;
    if (typeof input.lifetimeHours === 'number' && !isNaN(input.lifetimeHours)) {
      lifetimeHours = Math.max(1, Math.min(24, Math.floor(input.lifetimeHours)));
    }

    const now = Date.now();
    const expiresAt = now + lifetimeHours * 3600 * 1000;

    const room: RoomModel = {
      id: cleanId,
      name: input.name.trim(),
      code_hash: codeHash,
      secret_code_hash: secretCodeHash,
      is_hidden: !!input.isHidden,
      owner_id: input.ownerId,
      lifetime_hours: lifetimeHours,
      blur_enabled: true,
      created_at: now,
      expires_at: expiresAt,
    };

    await db.createRoom(room);
    await db.addMember(room.id, input.ownerId, 'owner');

    const roomToken = AuthService.generateRoomToken({
      roomId: room.id,
      userId: input.ownerId,
      role: 'owner',
      timestamp: Date.now(),
    });

    return { room, roomToken };
  }

  static async getRoomDetails(roomId: string, currentUserId: string): Promise<any> {
    const room = await db.getRoom(roomId);
    if (!room || room.expires_at <= Date.now()) {
      throw new Error('Room does not exist or has expired.');
    }

    const isKicked = await db.isUserKicked(roomId, currentUserId);
    if (isKicked) {
      throw new Error('You have been permanently revoked from this room.');
    }

    const members = await db.getMembers(roomId);
    const memberList = await Promise.all(
      members.map(async (m) => {
        const u = await db.getUser(m.user_id);
        return {
          userId: m.user_id,
          name: u?.name || 'Anonymous',
          role: m.role,
          joinedAt: m.joined_at,
          isLocked: m.is_locked,
        };
      })
    );

    return {
      id: room.id,
      name: room.name,
      lifetimeHours: room.lifetime_hours,
      createdAt: room.created_at,
      expiresAt: room.expires_at,
      isHidden: room.is_hidden,
      isOwner: room.owner_id === currentUserId,
      blurEnabled: room.blur_enabled ?? true,
      members: memberList,
    };
  }

  static async unlockRoom(
    roomId: string,
    code: string,
    userId: string,
    ip: string
  ): Promise<{ roomToken: string; room: any }> {
    const room = await db.getRoom(roomId);
    if (!room || room.expires_at <= Date.now()) {
      throw new Error('Room not found or has expired.');
    }

    const isKicked = await db.isUserKicked(roomId, userId);
    if (isKicked) {
      throw new Error('You have been kicked from this room.');
    }

    // Rate-limit check
    const rateCheck = await AuthService.checkRateLimit(ip, roomId);
    if (rateCheck.isLocked) {
      const err: any = new Error(`Too many incorrect attempts. Locked for ${rateCheck.remainingSec}s.`);
      err.locked = true;
      err.remainingSec = rateCheck.remainingSec;
      throw err;
    }

    const isValid = await AuthService.verifyCode(code, room.code_hash);
    if (!isValid) {
      const rec = await AuthService.recordFailedAttempt(ip, roomId);
      if (rec.lockUntil > Date.now()) {
        const remainingSec = Math.ceil((rec.lockUntil - Date.now()) / 1000);
        const err: any = new Error(`Too many incorrect attempts. Locked for ${remainingSec}s.`);
        err.locked = true;
        err.remainingSec = remainingSec;
        throw err;
      }
      throw new Error('Incorrect 4-digit access code. Try again.');
    }

    // Reset rate limit on success
    await AuthService.resetRateLimit(ip, roomId);

    const isOwner = room.owner_id === userId;
    const role = isOwner ? 'owner' : 'member';
    await db.addMember(roomId, userId, role);

    const roomToken = AuthService.generateRoomToken({
      roomId: room.id,
      userId,
      role,
      timestamp: Date.now(),
    });

    const roomDetails = await this.getRoomDetails(roomId, userId);
    return { roomToken, room: roomDetails };
  }

  static async searchRooms(query?: string, secretCode?: string): Promise<any[]> {
    const secretHash = secretCode ? AuthService.hashSecretCode(secretCode) : undefined;
    const rooms = await db.searchRooms(query, secretHash);
    return rooms.map((r) => ({
      id: r.id,
      name: r.name,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      isHidden: r.is_hidden,
    }));
  }

  static async leaveRoom(roomId: string, userId: string): Promise<void> {
    // When a user leaves: auto-lock for this user
    await db.setMemberLocked(roomId, userId, true);
  }

  static async kickMember(roomId: string, ownerId: string, targetUserId: string): Promise<void> {
    const room = await db.getRoom(roomId);
    if (!room || room.owner_id !== ownerId) {
      throw new Error('Only the room creator can kick members.');
    }
    if (ownerId === targetUserId) {
      throw new Error('Room creator cannot kick themselves.');
    }
    await db.kickUser(roomId, targetUserId);
  }

  static async updateLifetime(
    roomId: string,
    userId: string,
    options: {
      extendHours?: number;
      newLifetimeHours?: number;
      remainingMinutes?: number;
      newExpiresAt?: number;
    }
  ): Promise<any> {
    const room = await db.getRoom(roomId);
    if (!room) {
      throw new Error('Room does not exist or has already expired.');
    }

    const member = await db.getMember(roomId, userId);
    const isOwner = room.owner_id === userId || member?.role === 'owner';
    if (!isOwner) {
      throw new Error('Only the room creator has permission to adjust room lifetime.');
    }

    const now = Date.now();
    let computedExpiresAt = room.expires_at;

    if (typeof options.newExpiresAt === 'number' && options.newExpiresAt > now) {
      computedExpiresAt = Math.round(options.newExpiresAt);
    } else if (typeof options.remainingMinutes === 'number' && !isNaN(options.remainingMinutes)) {
      const mins = Math.max(2, Math.min(30 * 24 * 60, options.remainingMinutes));
      computedExpiresAt = now + mins * 60 * 1000;
    } else if (typeof options.newLifetimeHours === 'number' && !isNaN(options.newLifetimeHours)) {
      const hrs = Math.max(0.05, Math.min(30 * 24, options.newLifetimeHours));
      computedExpiresAt = now + hrs * 3600 * 1000;
    } else if (typeof options.extendHours === 'number' && !isNaN(options.extendHours)) {
      // Positive increases (zyada), negative decreases (km)
      computedExpiresAt = room.expires_at + options.extendHours * 3600 * 1000;
      // If decreased below 2 minutes from now, floor at 2 minutes
      if (computedExpiresAt <= now + 2 * 60 * 1000) {
        computedExpiresAt = now + 2 * 60 * 1000;
      }
    }

    // Maximum cap: up to 30 days
    const maxAllowed = now + 30 * 24 * 3600 * 1000;
    if (computedExpiresAt > maxAllowed) {
      computedExpiresAt = maxAllowed;
    }

    await db.updateRoomExpiry(roomId, computedExpiresAt);

    const roomDetails = await this.getRoomDetails(roomId, userId);
    RealtimeService.broadcastRoomUpdated(roomId, roomDetails);
    return roomDetails;
  }

  static async extendLifetime(roomId: string, ownerId: string, extendHours: number): Promise<any> {
    return this.updateLifetime(roomId, ownerId, { extendHours });
  }

  static async deleteRoom(roomId: string, ownerId: string): Promise<void> {
    const room = await db.getRoom(roomId);
    if (!room || room.owner_id !== ownerId) {
      throw new Error('Only the room creator can permanently delete the room.');
    }

    const deletedMediaIds = await db.deleteRoom(roomId);
    for (const mId of deletedMediaIds) {
      await storage.delete(mId);
    }
    await storage.deleteByPrefix(`${roomId}_`);
  }

  static async toggleBlur(roomId: string, userId: string, blurEnabled: boolean): Promise<any> {
    const room = await db.getRoom(roomId);
    if (!room || room.expires_at <= Date.now()) {
      throw new Error('Room does not exist or has expired.');
    }

    const isKicked = await db.isUserKicked(roomId, userId);
    if (isKicked) {
      throw new Error('You have been permanently revoked from this room.');
    }

    await db.updateRoomBlur(roomId, blurEnabled);

    // Get triggering user's display name
    const user = await db.getUser(userId);
    const userName = user?.name || 'A participant';

    // Dispatch system notice message into room timeline
    const actionText = blurEnabled ? 'turned Message Blur ON' : 'turned Message Blur OFF';
    const systemMsg = await MessageService.sendMessage({
      roomId,
      senderId: 'system',
      senderName: 'System',
      content: `${userName} ${actionText}`,
      type: 'system',
    });

    // Real-time broadcast system message to timeline
    RealtimeService.broadcastToRoom(roomId, 'new_message', systemMsg);

    // Real-time broadcast updated room details to all participants
    const roomDetails = await this.getRoomDetails(roomId, userId);
    RealtimeService.broadcastRoomUpdated(roomId, roomDetails);

    return {
      success: true,
      blurEnabled,
      room: roomDetails,
      systemMessage: systemMsg,
    };
  }
}
