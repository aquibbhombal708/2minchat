export interface UserModel {
  id: string;
  name: string;
  created_at: number;
}

export interface SessionModel {
  token: string;
  user_id: string;
  created_at: number;
  expires_at: number;
}

export interface RoomModel {
  id: string;
  name: string;
  code_hash: string;
  secret_code_hash?: string | null;
  is_hidden: boolean;
  owner_id: string;
  lifetime_hours: number;
  blur_enabled?: boolean;
  created_at: number;
  expires_at: number; // authoritative expiration timestamp
}

export interface RoomMemberModel {
  room_id: string;
  user_id: string;
  role: 'owner' | 'member';
  is_locked: boolean;
  joined_at: number;
}

export interface KickedUserModel {
  room_id: string;
  user_id: string;
  kicked_at: number;
}

export interface RoomAccessCredentialModel {
  key: string;
  room_id: string;
  failed_attempts: number;
  lock_until: number;
  last_attempt_at: number;
}

export interface MessageModel {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  type: 'text' | 'photo' | 'video' | 'document' | 'voice' | 'system';
  reply_to_id?: string | null;
  is_deleted: boolean;
  is_blurred?: boolean;
  created_at: number;
}

export interface MediaModel {
  id: string;
  room_id: string;
  message_id: string;
  sender_id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  duration?: number | null;
  storage_key: string;
  is_view_once: boolean;
  is_consumed: boolean;
  consumed_at?: number | null;
  consumed_by?: string[] | null;
  created_at: number;
}

export interface DeliveryStateModel {
  message_id: string;
  user_id: string;
  status: 'sent' | 'delivered' | 'seen';
  delivered_at?: number | null;
  seen_at?: number | null;
}
