import { RoomDetails, RoomSearchResult, MessageRecord, UserSession } from '../types';

let currentSessionToken: string = localStorage.getItem('2minchat_session_token') || '';
let currentRoomTokens: Record<string, string> = {};

try {
  const saved = localStorage.getItem('2minchat_room_tokens');
  if (saved) currentRoomTokens = JSON.parse(saved);
} catch (e) {
  currentRoomTokens = {};
}

export function setSessionToken(token: string) {
  currentSessionToken = token;
  localStorage.setItem('2minchat_session_token', token);
}

export function getSessionToken(): string {
  return currentSessionToken;
}

export function saveRoomToken(roomId: string, token: string) {
  currentRoomTokens[roomId] = token;
  localStorage.setItem('2minchat_room_tokens', JSON.stringify(currentRoomTokens));
}

export function getRoomToken(roomId: string): string | undefined {
  return currentRoomTokens[roomId];
}

export function clearRoomToken(roomId: string) {
  delete currentRoomTokens[roomId];
  localStorage.setItem('2minchat_room_tokens', JSON.stringify(currentRoomTokens));
}

function authHeaders(roomId?: string): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (currentSessionToken) {
    headers['x-session-token'] = currentSessionToken;
  }
  if (roomId && currentRoomTokens[roomId]) {
    headers['x-room-token'] = currentRoomTokens[roomId];
  }
  return headers;
}

export const api = {
  async getSession(): Promise<{ user: UserSession; sessionToken: string }> {
    const res = await fetch('/api/session', {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Failed to get session');
    const data = await res.json();
    setSessionToken(data.sessionToken);
    return data;
  },

  async updateSessionName(name: string): Promise<UserSession> {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error('Failed to update name');
    const data = await res.json();
    return data.user;
  },

  async searchRooms(query: string = '', secretCode?: string): Promise<RoomSearchResult[]> {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (secretCode) params.set('secretCode', secretCode);

    const res = await fetch(`/api/rooms?${params.toString()}`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Failed to search rooms');
    const data = await res.json();
    return data.rooms;
  },

  async createRoom(params: {
    name: string;
    roomId?: string;
    code: string;
    lifetimeHours: number;
    isHidden?: boolean;
    secretCode?: string;
  }): Promise<{ room: RoomDetails; roomToken: string }> {
    const res = await fetch('/api/rooms/create', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create room');
    }
    saveRoomToken(data.room.id, data.roomToken);
    return data;
  },

  async unlockRoom(roomId: string, code: string): Promise<{ room: RoomDetails; roomToken: string }> {
    const res = await fetch(`/api/rooms/${roomId}/unlock`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || 'Incorrect access code') as any;
      err.locked = data.locked;
      err.remainingSec = data.remainingSec;
      throw err;
    }
    saveRoomToken(roomId, data.roomToken);
    return data;
  },

  async getRoom(roomId: string): Promise<RoomDetails> {
    const res = await fetch(`/api/rooms/${roomId}`, {
      headers: authHeaders(roomId),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Unable to access room');
    }
    const data = await res.json();
    return data.room || data;
  },

  async getMessages(roomId: string): Promise<MessageRecord[]> {
    const res = await fetch(`/api/rooms/${roomId}/messages`, {
      headers: authHeaders(roomId),
    });
    if (!res.ok) throw new Error('Failed to load messages');
    const data = await res.json();
    return data.messages;
  },

  async sendMessage(roomId: string, payload: {
    content: string;
    type?: string;
    replyTo?: any;
    tempId?: string;
  }): Promise<MessageRecord> {
    const res = await fetch(`/api/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: authHeaders(roomId),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send message');
    return data.message;
  },

  async uploadMedia(
    roomId: string,
    file: File | Blob,
    type: 'photo' | 'video' | 'document' | 'voice',
    isViewOnce: boolean,
    replyTo?: any,
    tempId?: string,
    onProgress?: (percent: number) => void,
    duration?: number
  ): Promise<MessageRecord> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file, (file as File).name || `recording_${Date.now()}.webm`);
      formData.append('type', type);
      formData.append('isViewOnce', String(isViewOnce));
      if (duration && duration > 0) formData.append('duration', String(duration));
      if (replyTo) formData.append('replyTo', JSON.stringify(replyTo));
      if (tempId) formData.append('tempId', tempId);

      xhr.open('POST', `/api/rooms/${roomId}/upload`);
      const token = currentRoomTokens[roomId];
      if (token) xhr.setRequestHeader('x-room-token', token);
      if (currentSessionToken) xhr.setRequestHeader('x-session-token', currentSessionToken);

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data.message);
          } catch (e) {
            reject(new Error('Invalid response from server'));
          }
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            reject(new Error(data.error || 'Upload failed'));
          } catch {
            reject(new Error(`Upload failed (${xhr.status})`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(formData);
    });
  },

  getMediaUrl(roomId: string, mediaId: string): string {
    const token = currentRoomTokens[roomId] || '';
    const sessionToken = currentSessionToken || '';
    const params: string[] = [];
    if (token) params.push(`roomToken=${encodeURIComponent(token)}`);
    if (sessionToken) params.push(`sessionToken=${encodeURIComponent(sessionToken)}`);
    return `/api/rooms/${roomId}/media/${mediaId}${params.length ? `?${params.join('&')}` : ''}`;
  },

  async consumeMedia(roomId: string, mediaId: string): Promise<void> {
    await fetch(`/api/rooms/${roomId}/media/${mediaId}/consume`, {
      method: 'POST',
      headers: authHeaders(roomId),
    });
  },

  async deleteMessage(roomId: string, messageId: string): Promise<void> {
    const res = await fetch(`/api/rooms/${roomId}/messages/${messageId}`, {
      method: 'DELETE',
      headers: authHeaders(roomId),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to delete message');
    }
  },

  async toggleRoomBlur(roomId: string, blurEnabled: boolean): Promise<any> {
    const res = await fetch(`/api/rooms/${roomId}/blur`, {
      method: 'POST',
      headers: {
        ...authHeaders(roomId),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ blurEnabled }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to toggle blur state');
    }
    return res.json();
  },

  async leaveRoom(roomId: string): Promise<void> {
    try {
      await fetch(`/api/rooms/${roomId}/leave`, {
        method: 'POST',
        headers: authHeaders(roomId),
      });
    } finally {
      clearRoomToken(roomId);
    }
  },

  async deleteRoom(roomId: string): Promise<void> {
    const res = await fetch(`/api/rooms/${roomId}`, {
      method: 'DELETE',
      headers: authHeaders(roomId),
    });
    clearRoomToken(roomId);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to delete room');
    }
  },

  async kickMember(roomId: string, targetUserId: string): Promise<void> {
    const res = await fetch(`/api/rooms/${roomId}/kick`, {
      method: 'POST',
      headers: authHeaders(roomId),
      body: JSON.stringify({ targetUserId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to kick member');
    }
  },

  async updateRoomSettings(roomId: string, settings: {
    name?: string;
    isHidden?: boolean;
    secretCode?: string;
    extendHours?: number;
    newLifetimeHours?: number;
    remainingMinutes?: number;
    newExpiresAt?: number;
  }): Promise<RoomDetails> {
    const res = await fetch(`/api/rooms/${roomId}/settings`, {
      method: 'POST',
      headers: authHeaders(roomId),
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update settings');
    return (data.room || data) as RoomDetails;
  },
};
