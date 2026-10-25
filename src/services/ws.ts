type EventCallback = (data: any) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private roomId: string | null = null;
  private token: string | null = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private reconnectTimeout: any = null;
  private isExplicitlyClosed = false;

  public connect(roomId: string, token: string): void {
    this.roomId = roomId;
    this.token = token;
    this.isExplicitlyClosed = false;

    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // ignore
      }
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.send('join_room', { roomId, token });
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          const { type, payload } = parsed;
          this.emit(type, payload ?? parsed);
        } catch (err) {
          console.error('Failed to parse WebSocket event', err);
        }
      };

      this.ws.onclose = () => {
        if (!this.isExplicitlyClosed && this.roomId && this.token) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = setTimeout(() => {
            if (!this.isExplicitlyClosed && this.roomId && this.token) {
              this.connect(this.roomId, this.token);
            }
          }, 2000);
        }
      };

      this.ws.onerror = () => {
        // Handled via onclose reconnect logic
      };
    } catch (err) {
      console.error('WebSocket connection failed to initiate');
    }
  }

  public send(type: string, payload: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  public sendTyping(isTyping: boolean): void {
    if (this.roomId) {
      this.send('typing', { roomId: this.roomId, isTyping });
    }
  }

  public sendDelivered(messageId: string): void {
    if (this.roomId) {
      this.send('message_delivered', { roomId: this.roomId, messageId });
    }
  }

  public sendSeen(messageId: string): void {
    if (this.roomId) {
      this.send('message_seen', { roomId: this.roomId, messageId });
    }
  }

  public on(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  private emit(event: string, data: any): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const cb of set) {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in event listener for ${event}:`, e);
        }
      }
    }
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    clearTimeout(this.reconnectTimeout);
    if (this.ws) {
      try {
        if (this.roomId) {
          this.send('leave_room', { roomId: this.roomId });
        }
        this.ws.close();
      } catch (e) {
        // ignore
      }
      this.ws = null;
    }
    this.roomId = null;
    this.token = null;
  }
}

export const wsClient = new WebSocketClient();
