export interface UserSession {
  id: string;
  name: string;
  sessionToken: string;
  createdAt: number;
}

export interface MediaRecord {
  id: string;
  roomId: string;
  senderId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  duration?: number;
  isViewOnce: boolean;
  isConsumed: boolean;
  consumedAt?: number;
  consumedBy?: string[];
  createdAt: number;
}

export interface MessageRecord {
  id: string;
  tempId?: string;
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  type: 'text' | 'photo' | 'video' | 'document' | 'voice' | 'system';
  deliveryState: 'sending' | 'sent' | 'delivered' | 'seen' | 'failed';
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
    type: string;
  } | null;
  media?: MediaRecord | null;
  isDeleted: boolean;
  isBlurred?: boolean;
  createdAt: number;
  deliveredTo?: string[];
  seenBy?: string[];
}

export interface RoomMember {
  userId: string;
  name: string;
  role: 'owner' | 'member';
  joinedAt: number;
  isKicked?: boolean;
}

export interface RoomDetails {
  id: string;
  name: string;
  lifetimeHours: number;
  createdAt: number;
  expiresAt: number;
  isHidden: boolean;
  isOwner: boolean;
  blurEnabled?: boolean;
  members?: RoomMember[];
}

export interface RoomSearchResult {
  id: string;
  name: string;
  expiresAt: number;
  createdAt: number;
  isHidden: boolean;
}
