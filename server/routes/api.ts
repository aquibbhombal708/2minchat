import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { AuthService } from '../services/auth.service';
import { RoomService } from '../services/room.service';
import { MessageService } from '../services/message.service';
import { MediaService } from '../services/media.service';
import { RealtimeService } from '../services/realtime.service';
import { db } from '../db';
import { config } from '../config';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileSize },
});

// Middleware: Session extraction
async function requireSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = (req.headers['x-session-token'] as string) || req.cookies?.session_token;
  if (!token) {
    res.status(401).json({ error: 'Session required' });
    return;
  }
  const session = await db.getSession(token);
  if (!session || session.expires_at <= Date.now()) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }
  (req as any).userId = session.user_id;
  (req as any).sessionToken = session.token;
  next();
}

// Middleware: Room authorization
async function requireRoomAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const roomToken =
    (req.headers['x-room-token'] as string) ||
    (req.query.roomToken as string) ||
    (req.query.token as string);
  const sessionToken =
    (req.headers['x-session-token'] as string) ||
    (req.query.sessionToken as string);
  const roomId = req.params.roomId;

  if (!roomId) {
    res.status(400).json({ error: 'Room ID required' });
    return;
  }

  let payload = roomToken ? AuthService.verifyRoomToken(roomToken) : null;
  if (!payload || payload.roomId !== roomId) {
    // Try roomToken as sessionToken or use explicit sessionToken
    const tokenToTry = (payload ? null : roomToken) || sessionToken;
    if (tokenToTry) {
      const session = await db.getSession(tokenToTry);
      if (session) {
        const room = await db.getRoom(roomId);
        const member = await db.getMember(roomId, session.user_id);
        if (room && (room.owner_id === session.user_id || member)) {
          payload = {
            roomId,
            userId: session.user_id,
            role: room.owner_id === session.user_id ? 'owner' : (member?.role || 'member'),
            timestamp: Date.now(),
          };
        }
      }
    }
  }

  if (!payload || payload.roomId !== roomId) {
    res.status(403).json({ error: 'Invalid room authorization token' });
    return;
  }

  // Check room status
  const room = await db.getRoom(roomId);
  if (!room || room.expires_at <= Date.now()) {
    res.status(410).json({ error: 'Room has expired' });
    return;
  }

  // Check kicked status
  const isKicked = await db.isUserKicked(roomId, payload.userId);
  if (isKicked) {
    res.status(403).json({ error: 'You have been kicked from this room' });
    return;
  }

  (req as any).roomAuth = payload;
  next();
}

// -------------------------------------------------------------
// SESSIONS
// -------------------------------------------------------------
router.get('/session', async (req: Request, res: Response) => {
  try {
    const existing = req.headers['x-session-token'] as string;
    const { user, sessionToken } = await AuthService.getOrCreateSession(existing);
    res.json({ user, sessionToken });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Session failure' });
  }
});

router.post('/session/name', requireSession, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Valid name required' });
      return;
    }
    const updated = await db.updateUserName(userId, name.trim().slice(0, 32));
    res.json({ user: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update name' });
  }
});

// -------------------------------------------------------------
// ROOMS
// -------------------------------------------------------------
router.get('/rooms', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const secretCode = req.query.secretCode as string;
    const rooms = await RoomService.searchRooms(query, secretCode);
    res.json({ rooms });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Search failed' });
  }
});

router.post('/rooms/create', requireSession, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { name, roomId, code, lifetimeHours, isHidden, secretCode } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Room name is required' });
      return;
    }
    if (!code || typeof code !== 'string' || !/^\d{4}$/.test(code.trim())) {
      res.status(400).json({ error: 'Access code must be exactly 4 digits' });
      return;
    }
    if (isHidden && (!secretCode || typeof secretCode !== 'string' || !secretCode.trim())) {
      res.status(400).json({ error: 'Secret code is required for hidden rooms' });
      return;
    }

    const { room, roomToken } = await RoomService.createRoom({
      name: name.trim(),
      roomId: roomId ? roomId.trim() : undefined,
      code: code.trim(),
      lifetimeHours: lifetimeHours ? Number(lifetimeHours) : 24,
      isHidden: !!isHidden,
      secretCode: isHidden ? secretCode.trim() : undefined,
      ownerId: userId,
    });

    const roomDetails = await RoomService.getRoomDetails(room.id, userId);
    res.status(201).json({ room: roomDetails, roomToken });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create room' });
  }
});

router.post('/rooms/:roomId/unlock', requireSession, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { roomId } = req.params;
    const { code } = req.body;
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';

    if (!code || typeof code !== 'string' || !/^\d{4}$/.test(code.trim())) {
      res.status(400).json({ error: '4-digit access code required' });
      return;
    }

    const result = await RoomService.unlockRoom(roomId, code.trim(), userId, ip);
    res.json(result);
  } catch (err: any) {
    if (err.locked) {
      res.status(429).json({ error: err.message, locked: true, remainingSec: err.remainingSec });
      return;
    }
    res.status(401).json({ error: err.message || 'Incorrect access code' });
  }
});

router.get('/rooms/:roomId', requireRoomAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const auth = (req as any).roomAuth;
    const details = await RoomService.getRoomDetails(roomId, auth.userId);
    res.json(details);
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'Room not found' });
  }
});

router.post('/rooms/:roomId/leave', requireRoomAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const auth = (req as any).roomAuth;
    await RoomService.leaveRoom(roomId, auth.userId);
    RealtimeService.broadcastPresence(roomId);
    res.json({ success: true, message: 'Room locked for user' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Leave failed' });
  }
});

router.delete('/rooms/:roomId', requireRoomAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const auth = (req as any).roomAuth;
    await RoomService.deleteRoom(roomId, auth.userId);
    RealtimeService.notifyRoomExpired(roomId);
    res.json({ success: true, message: 'Room permanently deleted' });
  } catch (err: any) {
    res.status(403).json({ error: err.message || 'Failed to delete room' });
  }
});

router.post('/rooms/:roomId/settings', requireRoomAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const auth = (req as any).roomAuth;
    const { extendHours, newLifetimeHours, remainingMinutes, newExpiresAt } = req.body;

    const updated = await RoomService.updateLifetime(roomId, auth.userId, {
      extendHours: typeof extendHours === 'number' ? extendHours : undefined,
      newLifetimeHours: typeof newLifetimeHours === 'number' ? newLifetimeHours : undefined,
      remainingMinutes: typeof remainingMinutes === 'number' ? remainingMinutes : undefined,
      newExpiresAt: typeof newExpiresAt === 'number' ? newExpiresAt : undefined,
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update room settings' });
  }
});

router.post('/rooms/:roomId/kick', requireRoomAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const auth = (req as any).roomAuth;
    const { targetUserId } = req.body;

    if (!targetUserId || typeof targetUserId !== 'string') {
      res.status(400).json({ error: 'targetUserId required' });
      return;
    }

    await RoomService.kickMember(roomId, auth.userId, targetUserId);
    RealtimeService.notifyKick(roomId, targetUserId);
    res.json({ success: true, message: 'User kicked' });
  } catch (err: any) {
    res.status(403).json({ error: err.message || 'Failed to kick user' });
  }
});

router.post('/rooms/:roomId/blur', requireRoomAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const auth = (req as any).roomAuth;
    const { blurEnabled } = req.body;

    if (typeof blurEnabled !== 'boolean') {
      res.status(400).json({ error: 'blurEnabled boolean is required' });
      return;
    }

    const result = await RoomService.toggleBlur(roomId, auth.userId, blurEnabled);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to toggle blur state' });
  }
});

// -------------------------------------------------------------
// MESSAGES
// -------------------------------------------------------------
router.get('/rooms/:roomId/messages', requireRoomAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const auth = (req as any).roomAuth;
    const messages = await MessageService.getRoomMessages(roomId, auth.userId);
    res.json({ messages });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load messages' });
  }
});

router.post('/rooms/:roomId/messages', requireRoomAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const auth = (req as any).roomAuth;
    const { content, type, replyTo, tempId } = req.body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      res.status(400).json({ error: 'Message content is required' });
      return;
    }

    const user = await db.getUser(auth.userId);
    const msg = await MessageService.sendMessage({
      roomId,
      senderId: auth.userId,
      senderName: user?.name || 'Anonymous',
      content: content.trim(),
      type: type || 'text',
      replyTo,
      tempId,
    });

    RealtimeService.broadcastToRoom(roomId, 'new_message', msg);
    res.status(201).json({ message: msg });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Message dispatch failed' });
  }
});

router.delete('/rooms/:roomId/messages/:messageId', requireRoomAuth, async (req: Request, res: Response) => {
  try {
    const { roomId, messageId } = req.params;
    const auth = (req as any).roomAuth;

    await MessageService.deleteMessage(roomId, messageId, auth.userId);
    RealtimeService.broadcastToRoom(roomId, 'message_deleted', { messageId });
    res.json({ success: true });
  } catch (err: any) {
    res.status(403).json({ error: err.message || 'Failed to delete message' });
  }
});

// -------------------------------------------------------------
// MEDIA & VIEW ONCE
// -------------------------------------------------------------
router.post(
  ['/rooms/:roomId/media', '/rooms/:roomId/upload'],
  requireRoomAuth,
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const auth = (req as any).roomAuth;
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: 'File buffer required' });
        return;
      }

      const isViewOnce = req.body.isViewOnce === 'true' || req.body.isViewOnce === true;
      const mediaType = req.body.type || 'document';
      const tempId = req.body.tempId;
      const duration = req.body.duration ? parseInt(req.body.duration, 10) : undefined;
      let replyTo: any = null;
      if (req.body.replyTo) {
        try {
          replyTo = JSON.parse(req.body.replyTo);
        } catch (e) {
          // ignore
        }
      }

      const user = await db.getUser(auth.userId);
      const msg = await MediaService.uploadMedia({
        roomId,
        senderId: auth.userId,
        senderName: user?.name || 'Anonymous',
        fileBuffer: file.buffer,
        originalName: file.originalname || 'attachment',
        mimeType: file.mimetype,
        size: file.size,
        type: mediaType,
        duration: isFinite(duration as number) && (duration as number) > 0 ? (duration as number) : undefined,
        isViewOnce,
        replyTo,
        tempId,
      });

      RealtimeService.broadcastToRoom(roomId, 'new_message', msg);
      res.status(201).json({ message: msg });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Upload failed' });
    }
  }
);

router.get('/rooms/:roomId/media/:mediaId', requireRoomAuth, async (req: Request, res: Response) => {
  try {
    const { roomId, mediaId } = req.params;
    const auth = (req as any).roomAuth;

    const stream = await MediaService.getMediaStream(roomId, mediaId, auth.userId);
    const total = stream.buffer.length;

    let mimeType = (stream.mimeType || 'application/octet-stream').split(';')[0].trim();
    if (mimeType === 'application/octet-stream') {
      if (stream.originalName.endsWith('.webm')) mimeType = 'audio/webm';
      else if (stream.originalName.endsWith('.mp4')) mimeType = 'audio/mp4';
      else if (stream.originalName.endsWith('.ogg')) mimeType = 'audio/ogg';
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(stream.originalName)}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Accept-Ranges', 'bytes');

    const range = req.headers.range;
    if (range && range.startsWith('bytes=')) {
      const parts = range.replace(/bytes=/, '').split('-');
      const rawStart = parseInt(parts[0], 10);
      const start = isNaN(rawStart) ? 0 : Math.max(0, Math.min(rawStart, total - 1));
      const rawEnd = parts[1] ? parseInt(parts[1], 10) : total - 1;
      const end = isNaN(rawEnd) ? total - 1 : Math.max(start, Math.min(rawEnd, total - 1));
      const chunk = stream.buffer.subarray(start, end + 1);

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', chunk.length);
      res.send(chunk);
    } else {
      res.setHeader('Content-Length', total);
      res.send(stream.buffer);
    }
  } catch (err: any) {
    res.status(403).json({ error: err.message || 'Media access forbidden' });
  }
});

router.post(
  '/rooms/:roomId/media/:mediaId/consume',
  requireRoomAuth,
  async (req: Request, res: Response) => {
    try {
      const { roomId, mediaId } = req.params;
      const auth = (req as any).roomAuth;

      await MediaService.consumeViewOnce(roomId, mediaId, auth.userId);
      RealtimeService.broadcastToRoom(roomId, 'media_consumed', { mediaId });
      res.json({ success: true, message: 'View Once media consumed and destroyed' });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to consume View Once media' });
    }
  }
);

export default router;
