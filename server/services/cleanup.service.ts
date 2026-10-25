import { db } from '../db';
import { storage } from '../storage';
import { config } from '../config';

export class CleanupService {
  private static timer: any = null;
  private static isRunning = false;

  static start(): void {
    // Run initial sweep on boot
    this.sweep();

    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.sweep();
    }, config.cleanupIntervalMs);
  }

  static stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  static async sweep(): Promise<number> {
    if (this.isRunning) return 0;
    this.isRunning = true;

    try {
      const now = Date.now();
      const expiredRooms = await db.getExpiredRooms(now);

      for (const room of expiredRooms) {
        console.log(`[2MinChat Cleanup] Authoritative expiration reached for room: ${room.id}`);
        const mediaIds = await db.deleteRoom(room.id);
        for (const mId of mediaIds) {
          try {
            await storage.delete(mId);
          } catch (e) {
            console.error(`Failed to delete storage file ${mId}:`, e);
          }
        }
        await storage.deleteByPrefix(`${room.id}_`);
      }

      return expiredRooms.length;
    } catch (err) {
      console.error('[2MinChat Cleanup] Error sweeping expired rooms:', err);
      return 0;
    } finally {
      this.isRunning = false;
    }
  }
}
