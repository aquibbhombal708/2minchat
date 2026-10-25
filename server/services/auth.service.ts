import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config';
import { db } from '../db';
import { UserModel, SessionModel } from '../db/schema';

export interface RoomTokenPayload {
  roomId: string;
  userId: string;
  role: 'owner' | 'member';
  timestamp: number;
}

export class AuthService {
  // Session handling
  static async getOrCreateSession(existingToken?: string): Promise<{ user: UserModel; sessionToken: string }> {
    if (existingToken) {
      const session = await db.getSession(existingToken);
      if (session && session.expires_at > Date.now()) {
        const user = await db.getUser(session.user_id);
        if (user) {
          return { user, sessionToken: session.token };
        }
      }
    }

    const userId = 'usr_' + crypto.randomBytes(6).toString('hex');
    const user: UserModel = {
      id: userId,
      name: `User ${Math.floor(1000 + Math.random() * 9000)}`,
      created_at: Date.now(),
    };
    await db.createUser(user);

    const sessionToken = 'tok_' + crypto.randomBytes(24).toString('hex');
    const session: SessionModel = {
      token: sessionToken,
      user_id: userId,
      created_at: Date.now(),
      expires_at: Date.now() + 30 * 24 * 3600 * 1000, // 30 days
    };
    await db.createSession(session);

    return { user, sessionToken };
  }

  // 4-digit room access code hashing
  static async hashCode(code: string): Promise<string> {
    return bcrypt.hash(code, 10);
  }

  static async verifyCode(code: string, hash: string): Promise<boolean> {
    return bcrypt.compare(code, hash);
  }

  // Secret code hashing for hidden rooms
  static hashSecretCode(secretCode: string): string {
    return crypto.createHmac('sha256', config.appSecret).update(secretCode).digest('hex');
  }

  // Room access token with HMAC signature
  static generateRoomToken(payload: RoomTokenPayload): string {
    const data = `${payload.roomId}:${payload.userId}:${payload.role}:${payload.timestamp}`;
    const sig = crypto.createHmac('sha256', config.appSecret).update(data).digest('hex');
    return Buffer.from(JSON.stringify({ payload: data, signature: sig })).toString('base64');
  }

  static verifyRoomToken(token: string): RoomTokenPayload | null {
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
      const { payload, signature } = decoded;
      const expectedSig = crypto.createHmac('sha256', config.appSecret).update(payload).digest('hex');
      if (signature !== expectedSig) return null;

      const [roomId, userId, role, tsStr] = payload.split(':');
      return {
        roomId,
        userId,
        role: role as 'owner' | 'member',
        timestamp: Number(tsStr),
      };
    } catch (e) {
      return null;
    }
  }

  // Brute-force rate limiting for room unlock
  static async checkRateLimit(
    ip: string,
    roomId: string
  ): Promise<{ isLocked: boolean; remainingSec: number }> {
    const key = `${roomId}_${ip}`;
    const cred = await db.getAccessCredential(key);
    if (!cred) return { isLocked: false, remainingSec: 0 };

    const now = Date.now();
    if (cred.lock_until > now) {
      const remainingSec = Math.ceil((cred.lock_until - now) / 1000);
      return { isLocked: true, remainingSec };
    }

    return { isLocked: false, remainingSec: 0 };
  }

  static async recordFailedAttempt(
    ip: string,
    roomId: string
  ): Promise<{ attempts: number; lockUntil: number }> {
    const key = `${roomId}_${ip}`;
    return await db.recordFailedAttempt(
      key,
      roomId,
      config.rateLimitMaxAttempts,
      config.rateLimitLockoutSeconds
    );
  }

  static async resetRateLimit(ip: string, roomId: string): Promise<void> {
    const key = `${roomId}_${ip}`;
    await db.resetAccessCredential(key);
  }
}
