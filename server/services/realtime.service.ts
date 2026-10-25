import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { AuthService } from './auth.service';
import { db } from '../db';
import { MessageService } from './message.service';

interface ClientConnection {
  ws: WebSocket;
  userId: string;
  roomId?: string;
  name: string;
  isAlive: boolean;
}

export class RealtimeService {
  private static wss: WebSocketServer | null = null;
  private static clients: Map<WebSocket, ClientConnection> = new Map();
  private static typingTrackers: Map<string, Map<string, any>> = new Map();

  static init(server: HttpServer): void {
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws: WebSocket) => {
      const conn: ClientConnection = {
        ws,
        userId: 'anonymous',
        name: 'Anonymous',
        isAlive: true,
      };
      this.clients.set(ws, conn);

      ws.on('pong', () => {
        conn.isAlive = true;
      });

      ws.on('message', async (data: string) => {
        try {
          const parsed = JSON.parse(data.toString());
          const { type, payload } = parsed;
          await this.handleEvent(ws, type, payload);
        } catch (err) {
          console.error('Error handling WebSocket message:', err);
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      ws.on('error', (err) => {
        console.warn('WebSocket connection error:', err);
        this.handleDisconnect(ws);
      });
    });

    // Heartbeat ping interval to prune stale connections
    setInterval(() => {
      this.clients.forEach((conn, ws) => {
        if (!conn.isAlive) {
          ws.terminate();
          this.handleDisconnect(ws);
          return;
        }
        conn.isAlive = false;
        try {
          ws.ping();
        } catch (e) {
          // ignore
        }
      });
    }, 30000);
  }

  private static async handleEvent(ws: WebSocket, type: string, payload: any): Promise<void> {
    const conn = this.clients.get(ws);
    if (!conn) return;

    switch (type) {
      case 'join_room': {
        const { roomId, token } = payload;
        if (!roomId || !token) return;

        const verified = AuthService.verifyRoomToken(token);
        if (!verified || verified.roomId !== roomId) {
          ws.send(JSON.stringify({ type: 'error', payload: 'Invalid room authorization' }));
          return;
        }

        const isKicked = await db.isUserKicked(roomId, verified.userId);
        if (isKicked) {
          ws.send(JSON.stringify({ type: 'kicked', payload: { roomId } }));
          return;
        }

        const user = await db.getUser(verified.userId);
        conn.userId = verified.userId;
        conn.name = user?.name || 'Anonymous';
        conn.roomId = roomId;

        this.broadcastPresence(roomId);
        break;
      }

      case 'typing': {
        const { roomId, isTyping } = payload;
        if (!conn.roomId || conn.roomId !== roomId) return;

        if (!this.typingTrackers.has(roomId)) {
          this.typingTrackers.set(roomId, new Map());
        }
        const roomTyping = this.typingTrackers.get(roomId)!;

        if (isTyping) {
          if (roomTyping.has(conn.userId)) {
            clearTimeout(roomTyping.get(conn.userId));
          }
          const timeout = setTimeout(() => {
            roomTyping.delete(conn.userId);
            this.broadcastTyping(roomId);
          }, 3000);
          roomTyping.set(conn.userId, timeout);
        } else {
          if (roomTyping.has(conn.userId)) {
            clearTimeout(roomTyping.get(conn.userId));
            roomTyping.delete(conn.userId);
          }
        }

        this.broadcastTyping(roomId);
        break;
      }

      case 'message_delivered': {
        const { roomId, messageId } = payload;
        if (!conn.roomId || conn.roomId !== roomId) return;
        await MessageService.updateDeliveryState(messageId, conn.userId, 'delivered');
        this.broadcastToRoom(roomId, 'message_updated', {
          id: messageId,
          deliveryState: 'delivered',
        });
        break;
      }

      case 'message_seen': {
        const { roomId, messageId } = payload;
        if (!conn.roomId || conn.roomId !== roomId) return;
        await MessageService.updateDeliveryState(messageId, conn.userId, 'seen');
        this.broadcastToRoom(roomId, 'message_updated', {
          id: messageId,
          deliveryState: 'seen',
        });
        break;
      }

      case 'leave_room': {
        if (conn.roomId) {
          const rId = conn.roomId;
          conn.roomId = undefined;
          this.broadcastPresence(rId);
        }
        break;
      }
    }
  }

  private static handleDisconnect(ws: WebSocket): void {
    const conn = this.clients.get(ws);
    if (conn) {
      const roomId = conn.roomId;
      this.clients.delete(ws);
      if (roomId) {
        if (this.typingTrackers.has(roomId)) {
          this.typingTrackers.get(roomId)!.delete(conn.userId);
          this.broadcastTyping(roomId);
        }
        this.broadcastPresence(roomId);
      }
    }
  }

  static broadcastToRoom(roomId: string, type: string, payload: any): void {
    const data = JSON.stringify({ type, payload });
    this.clients.forEach((conn) => {
      if (conn.roomId === roomId && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(data);
      }
    });
  }

  static broadcastPresence(roomId: string): void {
    const active: { userId: string; name: string }[] = [];
    const seen = new Set<string>();

    this.clients.forEach((conn) => {
      if (conn.roomId === roomId && !seen.has(conn.userId)) {
        seen.add(conn.userId);
        active.push({ userId: conn.userId, name: conn.name });
      }
    });

    this.broadcastToRoom(roomId, 'presence', { presence: active });
  }

  static broadcastTyping(roomId: string): void {
    const roomTyping = this.typingTrackers.get(roomId);
    const typingUserIds = roomTyping ? Array.from(roomTyping.keys()) : [];
    const names: string[] = [];

    this.clients.forEach((conn) => {
      if (conn.roomId === roomId && typingUserIds.includes(conn.userId)) {
        if (!names.includes(conn.name)) names.push(conn.name);
      }
    });

    this.broadcastToRoom(roomId, 'typing_update', { typingUsers: names });
  }

  static notifyKick(roomId: string, userId: string): void {
    this.clients.forEach((conn) => {
      if (conn.roomId === roomId && conn.userId === userId) {
        conn.ws.send(JSON.stringify({ type: 'kicked', payload: { roomId } }));
        conn.roomId = undefined;
      }
    });
    this.broadcastPresence(roomId);
  }

  static notifyRoomExpired(roomId: string): void {
    this.broadcastToRoom(roomId, 'room_expired', { roomId });
    this.clients.forEach((conn) => {
      if (conn.roomId === roomId) {
        conn.roomId = undefined;
      }
    });
  }

  static broadcastRoomUpdated(roomId: string, room: any): void {
    this.broadcastToRoom(roomId, 'room_updated', { room });
  }
}
