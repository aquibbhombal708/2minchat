import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { config } from '../config';
import {
  UserModel,
  SessionModel,
  RoomModel,
  RoomMemberModel,
  KickedUserModel,
  RoomAccessCredentialModel,
  MessageModel,
  MediaModel,
  DeliveryStateModel,
} from './schema';

export interface DatabaseEngine {
  init(): Promise<void>;
  close(): Promise<void>;

  // Users
  createUser(user: UserModel): Promise<UserModel>;
  getUser(id: string): Promise<UserModel | null>;
  updateUserName(id: string, name: string): Promise<UserModel | null>;

  // Sessions
  createSession(session: SessionModel): Promise<SessionModel>;
  getSession(token: string): Promise<SessionModel | null>;
  deleteSession(token: string): Promise<void>;

  // Rooms
  createRoom(room: RoomModel): Promise<RoomModel>;
  getRoom(id: string): Promise<RoomModel | null>;
  searchRooms(query?: string, secretCodeHash?: string): Promise<RoomModel[]>;
  deleteRoom(id: string): Promise<string[]>; // Returns list of deleted media IDs
  updateRoomExpiry(id: string, expiresAt: number): Promise<void>;
  updateRoomBlur(id: string, blurEnabled: boolean): Promise<void>;
  getExpiredRooms(now: number): Promise<RoomModel[]>;

  // Members
  addMember(roomId: string, userId: string, role: 'owner' | 'member'): Promise<void>;
  getMember(roomId: string, userId: string): Promise<RoomMemberModel | null>;
  getMembers(roomId: string): Promise<RoomMemberModel[]>;
  setMemberLocked(roomId: string, userId: string, isLocked: boolean): Promise<void>;
  removeMember(roomId: string, userId: string): Promise<void>;

  // Kicked
  kickUser(roomId: string, userId: string): Promise<void>;
  isUserKicked(roomId: string, userId: string): Promise<boolean>;

  // Access Credentials
  getAccessCredential(key: string): Promise<RoomAccessCredentialModel | null>;
  recordFailedAttempt(
    key: string,
    roomId: string,
    maxAttempts: number,
    lockoutSec: number
  ): Promise<{ attempts: number; lockUntil: number }>;
  resetAccessCredential(key: string): Promise<void>;

  // Messages
  createMessage(msg: MessageModel): Promise<MessageModel>;
  getMessage(id: string): Promise<MessageModel | null>;
  getMessagesByRoom(roomId: string): Promise<MessageModel[]>;
  deleteMessage(id: string): Promise<{ mediaId?: string } | null>;

  // Media & Blobs
  createMedia(media: MediaModel, blob?: Buffer): Promise<MediaModel>;
  getMedia(id: string): Promise<MediaModel | null>;
  getMediaByMessage(messageId: string): Promise<MediaModel | null>;
  getMediaByRoom(roomId: string): Promise<MediaModel[]>;
  markMediaConsumed(id: string, userId: string): Promise<boolean>;
  deleteMedia(id: string): Promise<void>;
  getMediaBlob(id: string): Promise<Buffer | null>;

  // Delivery States
  setDeliveryStatus(
    messageId: string,
    userId: string,
    status: 'sent' | 'delivered' | 'seen'
  ): Promise<void>;
  getDeliveryStates(messageId: string): Promise<DeliveryStateModel[]>;
}

// -------------------------------------------------------------
// POSTGRESQL IMPLEMENTATION (For Render & Production)
// -------------------------------------------------------------
class PostgresDatabaseEngine implements DatabaseEngine {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    });
  }

  async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(128) NOT NULL,
          created_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          token VARCHAR(128) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at BIGINT NOT NULL,
          expires_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS rooms (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(128) NOT NULL,
          code_hash VARCHAR(256) NOT NULL,
          secret_code_hash VARCHAR(256),
          is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
          owner_id VARCHAR(64) NOT NULL REFERENCES users(id),
          lifetime_hours INT NOT NULL,
          blur_enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at BIGINT NOT NULL,
          expires_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_rooms_expires_at ON rooms(expires_at);
        ALTER TABLE rooms ADD COLUMN IF NOT EXISTS blur_enabled BOOLEAN NOT NULL DEFAULT TRUE;

        CREATE TABLE IF NOT EXISTS room_members (
          room_id VARCHAR(64) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role VARCHAR(16) NOT NULL,
          is_locked BOOLEAN NOT NULL DEFAULT FALSE,
          joined_at BIGINT NOT NULL,
          PRIMARY KEY (room_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS kicked_users (
          room_id VARCHAR(64) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kicked_at BIGINT NOT NULL,
          PRIMARY KEY (room_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS room_access_credentials (
          key VARCHAR(128) PRIMARY KEY,
          room_id VARCHAR(64) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          failed_attempts INT NOT NULL DEFAULT 0,
          lock_until BIGINT NOT NULL DEFAULT 0,
          last_attempt_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
          id VARCHAR(64) PRIMARY KEY,
          room_id VARCHAR(64) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          sender_id VARCHAR(64) NOT NULL REFERENCES users(id),
          sender_name VARCHAR(128) NOT NULL,
          content TEXT NOT NULL,
          type VARCHAR(16) NOT NULL,
          reply_to_id VARCHAR(64),
          is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
          is_blurred BOOLEAN NOT NULL DEFAULT TRUE,
          created_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
        ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_blurred BOOLEAN NOT NULL DEFAULT TRUE;

        CREATE TABLE IF NOT EXISTS media (
          id VARCHAR(64) PRIMARY KEY,
          room_id VARCHAR(64) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          message_id VARCHAR(64) NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          sender_id VARCHAR(64) NOT NULL REFERENCES users(id),
          filename VARCHAR(256) NOT NULL,
          original_name VARCHAR(256) NOT NULL,
          mime_type VARCHAR(128) NOT NULL,
          size BIGINT NOT NULL,
          duration INTEGER,
          storage_key VARCHAR(256) NOT NULL,
          is_view_once BOOLEAN NOT NULL DEFAULT FALSE,
          is_consumed BOOLEAN NOT NULL DEFAULT FALSE,
          consumed_at BIGINT,
          created_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_media_room_id ON media(room_id);
        ALTER TABLE media ADD COLUMN IF NOT EXISTS duration INTEGER;

        CREATE TABLE IF NOT EXISTS media_blobs (
          media_id VARCHAR(64) PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
          data BYTEA NOT NULL,
          mime_type VARCHAR(128) NOT NULL
        );

        CREATE TABLE IF NOT EXISTS delivery_states (
          message_id VARCHAR(64) NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          user_id VARCHAR(64) NOT NULL REFERENCES users(id),
          status VARCHAR(16) NOT NULL,
          delivered_at BIGINT,
          seen_at BIGINT,
          PRIMARY KEY (message_id, user_id)
        );
      `);
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createUser(u: UserModel): Promise<UserModel> {
    await this.pool.query(
      `INSERT INTO users (id, name, created_at) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = $2`,
      [u.id, u.name, u.created_at]
    );
    return u;
  }

  async getUser(id: string): Promise<UserModel | null> {
    const res = await this.pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
    return res.rows[0] || null;
  }

  async updateUserName(id: string, name: string): Promise<UserModel | null> {
    const res = await this.pool.query(
      `UPDATE users SET name = $1 WHERE id = $2 RETURNING *`,
      [name, id]
    );
    return res.rows[0] || null;
  }

  async createSession(s: SessionModel): Promise<SessionModel> {
    await this.pool.query(
      `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)`,
      [s.token, s.user_id, s.created_at, s.expires_at]
    );
    return s;
  }

  async getSession(token: string): Promise<SessionModel | null> {
    const res = await this.pool.query(`SELECT * FROM sessions WHERE token = $1`, [token]);
    return res.rows[0] || null;
  }

  async deleteSession(token: string): Promise<void> {
    await this.pool.query(`DELETE FROM sessions WHERE token = $1`, [token]);
  }

  async createRoom(r: RoomModel): Promise<RoomModel> {
    const blurEnabled = r.blur_enabled ?? true;
    await this.pool.query(
      `INSERT INTO rooms (id, name, code_hash, secret_code_hash, is_hidden, owner_id, lifetime_hours, created_at, expires_at, blur_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        r.id,
        r.name,
        r.code_hash,
        r.secret_code_hash || null,
        r.is_hidden,
        r.owner_id,
        r.lifetime_hours,
        r.created_at,
        r.expires_at,
        blurEnabled,
      ]
    );
    r.blur_enabled = blurEnabled;
    return r;
  }

  async getRoom(id: string): Promise<RoomModel | null> {
    const res = await this.pool.query(`SELECT * FROM rooms WHERE id = $1`, [id]);
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      name: row.name,
      code_hash: row.code_hash,
      secret_code_hash: row.secret_code_hash,
      is_hidden: row.is_hidden,
      owner_id: row.owner_id,
      lifetime_hours: Number(row.lifetime_hours),
      blur_enabled: row.blur_enabled ?? true,
      created_at: Number(row.created_at),
      expires_at: Number(row.expires_at),
    };
  }

  async searchRooms(query?: string, secretCodeHash?: string): Promise<RoomModel[]> {
    const now = Date.now();
    let sql = `SELECT * FROM rooms WHERE expires_at > $1`;
    const params: any[] = [now];

    if (secretCodeHash) {
      sql += ` AND (is_hidden = FALSE OR secret_code_hash = $2)`;
      params.push(secretCodeHash);
    } else {
      sql += ` AND is_hidden = FALSE`;
    }

    if (query && query.trim()) {
      const q = `%${query.trim().toLowerCase()}%`;
      const pIndex = params.length + 1;
      sql += ` AND (LOWER(name) LIKE $${pIndex} OR LOWER(id) LIKE $${pIndex})`;
      params.push(q);
    }

    sql += ` ORDER BY created_at DESC`;
    const res = await this.pool.query(sql, params);
    return res.rows.map((row) => ({
      id: row.id,
      name: row.name,
      code_hash: row.code_hash,
      secret_code_hash: row.secret_code_hash,
      is_hidden: row.is_hidden,
      owner_id: row.owner_id,
      lifetime_hours: Number(row.lifetime_hours),
      blur_enabled: row.blur_enabled ?? true,
      created_at: Number(row.created_at),
      expires_at: Number(row.expires_at),
    }));
  }

  async deleteRoom(id: string): Promise<string[]> {
    const mediaRes = await this.pool.query(`SELECT id FROM media WHERE room_id = $1`, [id]);
    const mediaIds = mediaRes.rows.map((r) => r.id);
    await this.pool.query(`DELETE FROM rooms WHERE id = $1`, [id]);
    return mediaIds;
  }

  async updateRoomExpiry(id: string, expiresAt: number): Promise<void> {
    await this.pool.query(`UPDATE rooms SET expires_at = $1 WHERE id = $2`, [expiresAt, id]);
  }

  async updateRoomBlur(id: string, blurEnabled: boolean): Promise<void> {
    await this.pool.query(`UPDATE rooms SET blur_enabled = $1 WHERE id = $2`, [blurEnabled, id]);
  }

  async getExpiredRooms(now: number): Promise<RoomModel[]> {
    const res = await this.pool.query(`SELECT * FROM rooms WHERE expires_at <= $1`, [now]);
    return res.rows.map((row) => ({
      id: row.id,
      name: row.name,
      code_hash: row.code_hash,
      secret_code_hash: row.secret_code_hash,
      is_hidden: row.is_hidden,
      owner_id: row.owner_id,
      lifetime_hours: Number(row.lifetime_hours),
      blur_enabled: row.blur_enabled ?? true,
      created_at: Number(row.created_at),
      expires_at: Number(row.expires_at),
    }));
  }

  async addMember(roomId: string, userId: string, role: 'owner' | 'member'): Promise<void> {
    await this.pool.query(
      `INSERT INTO room_members (room_id, user_id, role, is_locked, joined_at)
       VALUES ($1, $2, $3, FALSE, $4)
       ON CONFLICT (room_id, user_id) DO UPDATE SET is_locked = FALSE, role = $3`,
      [roomId, userId, role, Date.now()]
    );
  }

  async getMember(roomId: string, userId: string): Promise<RoomMemberModel | null> {
    const res = await this.pool.query(
      `SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId]
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      room_id: r.room_id,
      user_id: r.user_id,
      role: r.role,
      is_locked: r.is_locked,
      joined_at: Number(r.joined_at),
    };
  }

  async getMembers(roomId: string): Promise<RoomMemberModel[]> {
    const res = await this.pool.query(
      `SELECT * FROM room_members WHERE room_id = $1 ORDER BY joined_at ASC`,
      [roomId]
    );
    return res.rows.map((r) => ({
      room_id: r.room_id,
      user_id: r.user_id,
      role: r.role,
      is_locked: r.is_locked,
      joined_at: Number(r.joined_at),
    }));
  }

  async setMemberLocked(roomId: string, userId: string, isLocked: boolean): Promise<void> {
    await this.pool.query(
      `UPDATE room_members SET is_locked = $1 WHERE room_id = $2 AND user_id = $3`,
      [isLocked, roomId, userId]
    );
  }

  async removeMember(roomId: string, userId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM room_members WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId]
    );
  }

  async kickUser(roomId: string, userId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO kicked_users (room_id, user_id, kicked_at) VALUES ($1, $2, $3)
       ON CONFLICT (room_id, user_id) DO UPDATE SET kicked_at = $3`,
      [roomId, userId, Date.now()]
    );
    await this.removeMember(roomId, userId);
  }

  async isUserKicked(roomId: string, userId: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM kicked_users WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId]
    );
    return res.rowCount !== null && res.rowCount > 0;
  }

  async getAccessCredential(key: string): Promise<RoomAccessCredentialModel | null> {
    const res = await this.pool.query(
      `SELECT * FROM room_access_credentials WHERE key = $1`,
      [key]
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      key: r.key,
      room_id: r.room_id,
      failed_attempts: Number(r.failed_attempts),
      lock_until: Number(r.lock_until),
      last_attempt_at: Number(r.last_attempt_at),
    };
  }

  async recordFailedAttempt(
    key: string,
    roomId: string,
    maxAttempts: number,
    lockoutSec: number
  ): Promise<{ attempts: number; lockUntil: number }> {
    const now = Date.now();
    const existing = await this.getAccessCredential(key);
    let attempts = (existing?.failed_attempts || 0) + 1;
    let lockUntil = 0;
    if (attempts >= maxAttempts) {
      lockUntil = now + lockoutSec * 1000;
      attempts = 0;
    }
    await this.pool.query(
      `INSERT INTO room_access_credentials (key, room_id, failed_attempts, lock_until, last_attempt_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (key) DO UPDATE SET failed_attempts = $3, lock_until = $4, last_attempt_at = $5`,
      [key, roomId, attempts, lockUntil, now]
    );
    return { attempts, lockUntil };
  }

  async resetAccessCredential(key: string): Promise<void> {
    await this.pool.query(`DELETE FROM room_access_credentials WHERE key = $1`, [key]);
  }

  async createMessage(msg: MessageModel): Promise<MessageModel> {
    const isBlurred = msg.is_blurred ?? true;
    await this.pool.query(
      `INSERT INTO messages (id, room_id, sender_id, sender_name, content, type, reply_to_id, is_deleted, is_blurred, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        msg.id,
        msg.room_id,
        msg.sender_id,
        msg.sender_name,
        msg.content,
        msg.type,
        msg.reply_to_id || null,
        msg.is_deleted,
        isBlurred,
        msg.created_at,
      ]
    );
    msg.is_blurred = isBlurred;
    return msg;
  }

  async getMessage(id: string): Promise<MessageModel | null> {
    const res = await this.pool.query(`SELECT * FROM messages WHERE id = $1`, [id]);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      room_id: r.room_id,
      sender_id: r.sender_id,
      sender_name: r.sender_name,
      content: r.content,
      type: r.type,
      reply_to_id: r.reply_to_id,
      is_deleted: r.is_deleted,
      is_blurred: Boolean(r.is_blurred ?? true),
      created_at: Number(r.created_at),
    };
  }

  async getMessagesByRoom(roomId: string): Promise<MessageModel[]> {
    const res = await this.pool.query(
      `SELECT * FROM messages WHERE room_id = $1 ORDER BY created_at ASC`,
      [roomId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      room_id: r.room_id,
      sender_id: r.sender_id,
      sender_name: r.sender_name,
      content: r.content,
      type: r.type,
      reply_to_id: r.reply_to_id,
      is_deleted: r.is_deleted,
      is_blurred: Boolean(r.is_blurred ?? true),
      created_at: Number(r.created_at),
    }));
  }

  async deleteMessage(id: string): Promise<{ mediaId?: string } | null> {
    const media = await this.getMediaByMessage(id);
    await this.pool.query(
      `UPDATE messages SET is_deleted = TRUE, content = 'This message was deleted.' WHERE id = $1`,
      [id]
    );
    if (media) {
      await this.deleteMedia(media.id);
      return { mediaId: media.id };
    }
    return null;
  }

  async createMedia(media: MediaModel, blob?: Buffer): Promise<MediaModel> {
    await this.pool.query(
      `INSERT INTO media (id, room_id, message_id, sender_id, filename, original_name, mime_type, size, duration, storage_key, is_view_once, is_consumed, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        media.id,
        media.room_id,
        media.message_id,
        media.sender_id,
        media.filename,
        media.original_name,
        media.mime_type,
        media.size,
        media.duration || null,
        media.storage_key,
        media.is_view_once,
        media.is_consumed,
        media.created_at,
      ]
    );
    if (blob) {
      await this.pool.query(
        `INSERT INTO media_blobs (media_id, data, mime_type) VALUES ($1, $2, $3)
         ON CONFLICT (media_id) DO UPDATE SET data = $2`,
        [media.id, blob, media.mime_type]
      );
    }
    return media;
  }

  async getMedia(id: string): Promise<MediaModel | null> {
    const res = await this.pool.query(`SELECT * FROM media WHERE id = $1`, [id]);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      room_id: r.room_id,
      message_id: r.message_id,
      sender_id: r.sender_id,
      filename: r.filename,
      original_name: r.original_name,
      mime_type: r.mime_type,
      size: Number(r.size),
      duration: r.duration ? Number(r.duration) : null,
      storage_key: r.storage_key,
      is_view_once: r.is_view_once,
      is_consumed: r.is_consumed,
      consumed_at: r.consumed_at ? Number(r.consumed_at) : null,
      created_at: Number(r.created_at),
    };
  }

  async getMediaByMessage(messageId: string): Promise<MediaModel | null> {
    const res = await this.pool.query(`SELECT * FROM media WHERE message_id = $1`, [messageId]);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      room_id: r.room_id,
      message_id: r.message_id,
      sender_id: r.sender_id,
      filename: r.filename,
      original_name: r.original_name,
      mime_type: r.mime_type,
      size: Number(r.size),
      duration: r.duration ? Number(r.duration) : null,
      storage_key: r.storage_key,
      is_view_once: r.is_view_once,
      is_consumed: r.is_consumed,
      consumed_at: r.consumed_at ? Number(r.consumed_at) : null,
      created_at: Number(r.created_at),
    };
  }

  async getMediaByRoom(roomId: string): Promise<MediaModel[]> {
    const res = await this.pool.query(`SELECT * FROM media WHERE room_id = $1`, [roomId]);
    return res.rows.map((r) => ({
      id: r.id,
      room_id: r.room_id,
      message_id: r.message_id,
      sender_id: r.sender_id,
      filename: r.filename,
      original_name: r.original_name,
      mime_type: r.mime_type,
      size: Number(r.size),
      duration: r.duration ? Number(r.duration) : null,
      storage_key: r.storage_key,
      is_view_once: r.is_view_once,
      is_consumed: r.is_consumed,
      consumed_at: r.consumed_at ? Number(r.consumed_at) : null,
      created_at: Number(r.created_at),
    }));
  }

  async markMediaConsumed(id: string, _userId: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE media SET is_consumed = TRUE, consumed_at = $1 WHERE id = $2 AND is_consumed = FALSE RETURNING *`,
      [Date.now(), id]
    );
    // Delete blob immediately for View Once
    await this.pool.query(`DELETE FROM media_blobs WHERE media_id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async deleteMedia(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM media WHERE id = $1`, [id]);
  }

  async getMediaBlob(id: string): Promise<Buffer | null> {
    const res = await this.pool.query(`SELECT data FROM media_blobs WHERE media_id = $1`, [id]);
    if (!res.rows[0]) return null;
    return res.rows[0].data;
  }

  async setDeliveryStatus(
    messageId: string,
    userId: string,
    status: 'sent' | 'delivered' | 'seen'
  ): Promise<void> {
    const now = Date.now();
    await this.pool.query(
      `INSERT INTO delivery_states (message_id, user_id, status, delivered_at, seen_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (message_id, user_id) DO UPDATE SET
         status = $3,
         delivered_at = CASE WHEN $3 = 'delivered' OR $3 = 'seen' THEN COALESCE(delivery_states.delivered_at, $4) ELSE delivery_states.delivered_at END,
         seen_at = CASE WHEN $3 = 'seen' THEN COALESCE(delivery_states.seen_at, $5) ELSE delivery_states.seen_at END`,
      [messageId, userId, status, now, now]
    );
  }

  async getDeliveryStates(messageId: string): Promise<DeliveryStateModel[]> {
    const res = await this.pool.query(
      `SELECT * FROM delivery_states WHERE message_id = $1`,
      [messageId]
    );
    return res.rows.map((r) => ({
      message_id: r.message_id,
      user_id: r.user_id,
      status: r.status,
      delivered_at: r.delivered_at ? Number(r.delivered_at) : null,
      seen_at: r.seen_at ? Number(r.seen_at) : null,
    }));
  }
}

// -------------------------------------------------------------
// EMBEDDED RELATIONAL ENGINE (Local Development & Fallback)
// -------------------------------------------------------------
interface LocalDatabaseState {
  users: Record<string, UserModel>;
  sessions: Record<string, SessionModel>;
  rooms: Record<string, RoomModel>;
  room_members: Record<string, RoomMemberModel>; // key: `${roomId}_${userId}`
  kicked_users: Record<string, KickedUserModel>; // key: `${roomId}_${userId}`
  room_access_credentials: Record<string, RoomAccessCredentialModel>; // key
  messages: Record<string, MessageModel>;
  media: Record<string, MediaModel>;
  media_blobs: Record<string, string>; // base64
  delivery_states: Record<string, DeliveryStateModel>; // key: `${messageId}_${userId}`
}

class EmbeddedDatabaseEngine implements DatabaseEngine {
  private dbPath: string;
  private state: LocalDatabaseState = {
    users: {},
    sessions: {},
    rooms: {},
    room_members: {},
    kicked_users: {},
    room_access_credentials: {},
    messages: {},
    media: {},
    media_blobs: {},
    delivery_states: {},
  };
  private isSaving = false;
  private pendingSave = false;

  constructor() {
    this.dbPath = path.join(config.dataDir, 'database.relational.json');
  }

  async init(): Promise<void> {
    if (!fs.existsSync(config.dataDir)) {
      fs.mkdirSync(config.dataDir, { recursive: true });
    }
    if (fs.existsSync(this.dbPath)) {
      try {
        const raw = fs.readFileSync(this.dbPath, 'utf-8');
        this.state = JSON.parse(raw);
      } catch (err) {
        console.error('Failed to parse existing relational DB, starting fresh:', err);
      }
    }
  }

  async close(): Promise<void> {
    await this.persist();
  }

  private async persist(): Promise<void> {
    if (this.isSaving) {
      this.pendingSave = true;
      return;
    }
    this.isSaving = true;
    try {
      const tempPath = `${this.dbPath}.tmp`;
      await fs.promises.writeFile(tempPath, JSON.stringify(this.state, null, 2), 'utf-8');
      await fs.promises.rename(tempPath, this.dbPath);
    } catch (err) {
      console.error('Failed to persist database to disk:', err);
    } finally {
      this.isSaving = false;
      if (this.pendingSave) {
        this.pendingSave = false;
        this.persist();
      }
    }
  }

  async createUser(user: UserModel): Promise<UserModel> {
    this.state.users[user.id] = user;
    this.persist();
    return user;
  }

  async getUser(id: string): Promise<UserModel | null> {
    return this.state.users[id] || null;
  }

  async updateUserName(id: string, name: string): Promise<UserModel | null> {
    const user = this.state.users[id];
    if (user) {
      user.name = name;
      this.persist();
      return user;
    }
    return null;
  }

  async createSession(session: SessionModel): Promise<SessionModel> {
    this.state.sessions[session.token] = session;
    this.persist();
    return session;
  }

  async getSession(token: string): Promise<SessionModel | null> {
    return this.state.sessions[token] || null;
  }

  async deleteSession(token: string): Promise<void> {
    delete this.state.sessions[token];
    this.persist();
  }

  async createRoom(room: RoomModel): Promise<RoomModel> {
    room.blur_enabled = room.blur_enabled ?? true;
    this.state.rooms[room.id] = room;
    this.persist();
    return room;
  }

  async getRoom(id: string): Promise<RoomModel | null> {
    const r = this.state.rooms[id];
    if (!r) return null;
    if (r.blur_enabled === undefined) {
      r.blur_enabled = true;
    }
    return r;
  }

  async searchRooms(query?: string, secretCodeHash?: string): Promise<RoomModel[]> {
    const now = Date.now();
    let rooms = Object.values(this.state.rooms).filter((r) => r.expires_at > now);

    if (secretCodeHash) {
      rooms = rooms.filter((r) => !r.is_hidden || r.secret_code_hash === secretCodeHash);
    } else {
      rooms = rooms.filter((r) => !r.is_hidden);
    }

    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      rooms = rooms.filter(
        (r) => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)
      );
    }

    return rooms
      .map((r) => {
        if (r.blur_enabled === undefined) r.blur_enabled = true;
        return r;
      })
      .sort((a, b) => b.created_at - a.created_at);
  }

  async deleteRoom(id: string): Promise<string[]> {
    const mediaIds: string[] = [];
    // Cascade delete media
    for (const [mId, m] of Object.entries(this.state.media)) {
      if (m.room_id === id) {
        mediaIds.push(mId);
        delete this.state.media[mId];
        delete this.state.media_blobs[mId];
      }
    }

    // Cascade delete messages
    for (const [msgId, msg] of Object.entries(this.state.messages)) {
      if (msg.room_id === id) {
        delete this.state.messages[msgId];
      }
    }

    // Cascade delete members
    for (const [key, mem] of Object.entries(this.state.room_members)) {
      if (mem.room_id === id) {
        delete this.state.room_members[key];
      }
    }

    // Cascade delete kicked users
    for (const [key, ku] of Object.entries(this.state.kicked_users)) {
      if (ku.room_id === id) {
        delete this.state.kicked_users[key];
      }
    }

    // Cascade delete credentials
    for (const [key, cred] of Object.entries(this.state.room_access_credentials)) {
      if (cred.room_id === id) {
        delete this.state.room_access_credentials[key];
      }
    }

    delete this.state.rooms[id];
    this.persist();
    return mediaIds;
  }

  async updateRoomExpiry(id: string, expiresAt: number): Promise<void> {
    if (this.state.rooms[id]) {
      this.state.rooms[id].expires_at = expiresAt;
      this.persist();
    }
  }

  async updateRoomBlur(id: string, blurEnabled: boolean): Promise<void> {
    if (this.state.rooms[id]) {
      this.state.rooms[id].blur_enabled = blurEnabled;
      this.persist();
    }
  }

  async getExpiredRooms(now: number): Promise<RoomModel[]> {
    return Object.values(this.state.rooms).filter((r) => r.expires_at <= now);
  }

  async addMember(roomId: string, userId: string, role: 'owner' | 'member'): Promise<void> {
    const key = `${roomId}_${userId}`;
    this.state.room_members[key] = {
      room_id: roomId,
      user_id: userId,
      role,
      is_locked: false,
      joined_at: Date.now(),
    };
    this.persist();
  }

  async getMember(roomId: string, userId: string): Promise<RoomMemberModel | null> {
    const key = `${roomId}_${userId}`;
    return this.state.room_members[key] || null;
  }

  async getMembers(roomId: string): Promise<RoomMemberModel[]> {
    return Object.values(this.state.room_members)
      .filter((m) => m.room_id === roomId)
      .sort((a, b) => a.joined_at - b.joined_at);
  }

  async setMemberLocked(roomId: string, userId: string, isLocked: boolean): Promise<void> {
    const key = `${roomId}_${userId}`;
    if (this.state.room_members[key]) {
      this.state.room_members[key].is_locked = isLocked;
      this.persist();
    }
  }

  async removeMember(roomId: string, userId: string): Promise<void> {
    const key = `${roomId}_${userId}`;
    delete this.state.room_members[key];
    this.persist();
  }

  async kickUser(roomId: string, userId: string): Promise<void> {
    const key = `${roomId}_${userId}`;
    this.state.kicked_users[key] = {
      room_id: roomId,
      user_id: userId,
      kicked_at: Date.now(),
    };
    delete this.state.room_members[key];
    this.persist();
  }

  async isUserKicked(roomId: string, userId: string): Promise<boolean> {
    const key = `${roomId}_${userId}`;
    return !!this.state.kicked_users[key];
  }

  async getAccessCredential(key: string): Promise<RoomAccessCredentialModel | null> {
    return this.state.room_access_credentials[key] || null;
  }

  async recordFailedAttempt(
    key: string,
    roomId: string,
    maxAttempts: number,
    lockoutSec: number
  ): Promise<{ attempts: number; lockUntil: number }> {
    const now = Date.now();
    const cred = this.state.room_access_credentials[key] || {
      key,
      room_id: roomId,
      failed_attempts: 0,
      lock_until: 0,
      last_attempt_at: now,
    };
    cred.failed_attempts += 1;
    cred.last_attempt_at = now;
    if (cred.failed_attempts >= maxAttempts) {
      cred.lock_until = now + lockoutSec * 1000;
      cred.failed_attempts = 0;
    }
    this.state.room_access_credentials[key] = cred;
    this.persist();
    return { attempts: cred.failed_attempts, lockUntil: cred.lock_until };
  }

  async resetAccessCredential(key: string): Promise<void> {
    delete this.state.room_access_credentials[key];
    this.persist();
  }

  async createMessage(msg: MessageModel): Promise<MessageModel> {
    msg.is_blurred = msg.is_blurred ?? true;
    this.state.messages[msg.id] = msg;
    this.persist();
    return msg;
  }

  async getMessage(id: string): Promise<MessageModel | null> {
    const m = this.state.messages[id];
    if (!m) return null;
    if (m.is_blurred === undefined) m.is_blurred = true;
    return m;
  }

  async getMessagesByRoom(roomId: string): Promise<MessageModel[]> {
    return Object.values(this.state.messages)
      .filter((m) => m.room_id === roomId)
      .map((m) => ({
        ...m,
        is_blurred: m.is_blurred ?? true,
      }))
      .sort((a, b) => a.created_at - b.created_at);
  }

  async deleteMessage(id: string): Promise<{ mediaId?: string } | null> {
    const msg = this.state.messages[id];
    if (msg) {
      msg.is_deleted = true;
      msg.content = 'This message was deleted.';
      const media = Object.values(this.state.media).find((m) => m.message_id === id);
      if (media) {
        delete this.state.media[media.id];
        delete this.state.media_blobs[media.id];
        this.persist();
        return { mediaId: media.id };
      }
      this.persist();
    }
    return null;
  }

  async createMedia(media: MediaModel, blob?: Buffer): Promise<MediaModel> {
    this.state.media[media.id] = media;
    if (blob) {
      this.state.media_blobs[media.id] = blob.toString('base64');
    }
    this.persist();
    return media;
  }

  async getMedia(id: string): Promise<MediaModel | null> {
    return this.state.media[id] || null;
  }

  async getMediaByMessage(messageId: string): Promise<MediaModel | null> {
    return Object.values(this.state.media).find((m) => m.message_id === messageId) || null;
  }

  async getMediaByRoom(roomId: string): Promise<MediaModel[]> {
    return Object.values(this.state.media).filter((m) => m.room_id === roomId);
  }

  async markMediaConsumed(id: string, _userId: string): Promise<boolean> {
    const media = this.state.media[id];
    if (media && !media.is_consumed) {
      media.is_consumed = true;
      media.consumed_at = Date.now();
      delete this.state.media_blobs[id];
      this.persist();
      return true;
    }
    return false;
  }

  async deleteMedia(id: string): Promise<void> {
    delete this.state.media[id];
    delete this.state.media_blobs[id];
    this.persist();
  }

  async getMediaBlob(id: string): Promise<Buffer | null> {
    const b64 = this.state.media_blobs[id];
    if (b64) {
      return Buffer.from(b64, 'base64');
    }
    return null;
  }

  async setDeliveryStatus(
    messageId: string,
    userId: string,
    status: 'sent' | 'delivered' | 'seen'
  ): Promise<void> {
    const key = `${messageId}_${userId}`;
    const now = Date.now();
    const existing = this.state.delivery_states[key] || {
      message_id: messageId,
      user_id: userId,
      status: 'sent',
    };
    existing.status = status;
    if (status === 'delivered' || status === 'seen') {
      existing.delivered_at = existing.delivered_at || now;
    }
    if (status === 'seen') {
      existing.seen_at = existing.seen_at || now;
    }
    this.state.delivery_states[key] = existing;
    this.persist();
  }

  async getDeliveryStates(messageId: string): Promise<DeliveryStateModel[]> {
    return Object.values(this.state.delivery_states).filter((d) => d.message_id === messageId);
  }
}

// -------------------------------------------------------------
// SINGLETON DATABASE INSTANCE EXPORT
// -------------------------------------------------------------
export const db: DatabaseEngine = config.databaseUrl
  ? new PostgresDatabaseEngine(config.databaseUrl)
  : new EmbeddedDatabaseEngine();
