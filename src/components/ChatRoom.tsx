import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Settings,
  Paperclip,
  Send,
  Eye,
  EyeOff,
  Mic,
  Copy,
  Check,
  ChevronDown,
  Clock,
  X,
  Users,
} from 'lucide-react';
import { RoomDetails, MessageRecord } from '../types';
import { api, clearRoomToken } from '../services/api';
import { wsClient } from '../services/ws';
import { MessageItem } from './MessageItem';
import { VoiceRecorder } from './VoiceRecorder';
import { OwnerSettingsModal } from './OwnerSettingsModal';
import { ThemeToggle } from './ThemeToggle';

interface ChatRoomProps {
  room: RoomDetails;
  currentUserId: string;
  onLeaveRoom: () => void;
  onRoomDeleted: () => void;
}

export const ChatRoom: React.FC<ChatRoomProps> = ({
  room: initialRoom,
  currentUserId,
  onLeaveRoom,
  onRoomDeleted,
}) => {
  const [room, setRoom] = useState<RoomDetails>(initialRoom);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<MessageRecord | null>(null);

  // Attachments & View Once
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isViewOnce, setIsViewOnce] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);

  // Real-time states
  const [onlineUsers, setOnlineUsers] = useState<{ userId: string; name: string }[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [isOwnerSettingsOpen, setIsOwnerSettingsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  // Scroll & New Messages indicator
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const isNearBottomRef = useRef(true);

  // File input refs
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<any>(null);

  // 1. Authoritative Remaining Lifetime Countdown
  useEffect(() => {
    const updateTime = () => {
      const remainingMs = room.expiresAt - Date.now();
      if (remainingMs <= 0) {
        setTimeRemaining('Expired');
        onRoomDeleted();
        return;
      }
      const hrs = Math.floor(remainingMs / (3600 * 1000));
      const mins = Math.floor((remainingMs % (3600 * 1000)) / (60 * 1000));
      const secs = Math.floor((remainingMs % (60 * 1000)) / 1000);
      setTimeRemaining(`${hrs}h ${mins}m ${secs}s`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [room.expiresAt, onRoomDeleted]);

  // 2. Fetch Initial Messages & Connect WebSocket
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        const msgs = await api.getMessages(room.id);
        if (isMounted) {
          setMessages(msgs);
          scrollToBottom(true);
        }
      } catch (err) {
        console.error('Failed to load initial messages:', err);
      }
    };

    loadData();

    // Connect WebSocket
    const token = localStorage.getItem('2minchat_room_tokens');
    let roomToken = '';
    try {
      if (token) roomToken = JSON.parse(token)[room.id] || '';
    } catch (e) {}

    wsClient.connect(room.id, roomToken);

    // Listeners
    const unsubNewMsg = wsClient.on('new_message', (incoming: any) => {
      setMessages((prev) => {
        // Idempotency check: if tempId matches or already exists
        if (incoming.tempId) {
          const index = prev.findIndex((m) => m.tempId === incoming.tempId || m.id === incoming.id);
          if (index !== -1) {
            const copy = [...prev];
            copy[index] = incoming;
            return copy;
          }
        }
        if (prev.some((m) => m.id === incoming.id)) {
          return prev;
        }
        return [...prev, incoming];
      });

      // Notify delivery if incoming message is from someone else
      if (incoming.senderId !== currentUserId) {
        wsClient.sendDelivered(incoming.id);
        wsClient.sendSeen(incoming.id);
      }

      // Handle auto scroll
      if (isNearBottomRef.current) {
        setTimeout(() => scrollToBottom(false), 50);
      } else {
        setShowScrollBottom(true);
      }
    });

    const unsubMsgUpdated = wsClient.on('message_updated', (updated: MessageRecord) => {
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    });

    const unsubPresence = wsClient.on('presence', (data: any) => {
      if (data?.presence) {
        setOnlineUsers(data.presence);
      }
    });

    const unsubTyping = wsClient.on('typing_update', (data: any) => {
      if (data?.typingUsers) {
        // Exclude current user from typing display
        setTypingUsers(data.typingUsers);
      }
    });

    const unsubDeleted = wsClient.on('message_deleted', (data: any) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId
            ? { ...m, isDeleted: true, content: 'This message was deleted.', media: null }
            : m
        )
      );
    });

    const unsubMediaConsumed = wsClient.on('media_consumed', (data: any) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.media && m.media.id === data.mediaId) {
            return {
              ...m,
              media: { ...m.media, isConsumed: true },
            };
          }
          return m;
        })
      );
    });

    const unsubKicked = wsClient.on('kicked', () => {
      onLeaveRoom();
    });

    const unsubExpired = wsClient.on('room_expired', () => {
      onRoomDeleted();
    });

    const unsubRoomUpdated = wsClient.on('room_updated', (payload: any) => {
      if (payload?.room) {
        setRoom(payload.room);
      }
    });

    return () => {
      isMounted = false;
      unsubNewMsg();
      unsubMsgUpdated();
      unsubPresence();
      unsubTyping();
      unsubDeleted();
      unsubMediaConsumed();
      unsubKicked();
      unsubExpired();
      unsubRoomUpdated();
      wsClient.disconnect();
    };
  }, [room.id, currentUserId, onLeaveRoom, onRoomDeleted]);

  // 3. Auto-scroll logic
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    isNearBottomRef.current = distanceToBottom < 100;
    if (isNearBottomRef.current) {
      setShowScrollBottom(false);
    }
  };

  const scrollToBottom = (instant = false) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: instant ? 'auto' : 'smooth',
      });
      setShowScrollBottom(false);
      isNearBottomRef.current = true;
    }
  };

  // 4. Send Message Handler
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // If file is attached, upload file
    if (selectedFile) {
      await handleUploadFile();
      return;
    }

    if (!inputText.trim()) return;

    const tempId = 'temp_' + Date.now();
    const content = inputText.trim();
    setInputText('');
    const replyRef = replyingTo
      ? {
          id: replyingTo.id,
          senderName: replyingTo.senderName,
          text: replyingTo.content || (replyingTo.media ? `[${replyingTo.type}]` : ''),
          type: replyingTo.type,
        }
      : null;
    setReplyingTo(null);

    // Optimistic UI update
    const optimisticMessage: MessageRecord = {
      id: tempId,
      tempId,
      roomId: room.id,
      senderId: currentUserId,
      senderName: 'You',
      content,
      type: 'text',
      deliveryState: 'sending',
      replyTo: replyRef,
      isDeleted: false,
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    scrollToBottom(false);

    try {
      const serverMsg = await api.sendMessage(room.id, {
        content,
        type: 'text',
        replyTo: replyRef,
        tempId,
      });

      // Update state to sent
      setMessages((prev) =>
        prev.map((m) => (m.tempId === tempId ? { ...serverMsg, deliveryState: 'sent' } : m))
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) => (m.tempId === tempId ? { ...m, deliveryState: 'failed' } : m))
      );
    }
  };

  // 5. File Upload Handler
  const handleUploadFile = async () => {
    if (!selectedFile) return;

    const tempId = 'temp_' + Date.now();
    const file = selectedFile;
    const isVo = isViewOnce;
    const replyRef = replyingTo
      ? {
          id: replyingTo.id,
          senderName: replyingTo.senderName,
          text: replyingTo.content || `[${replyingTo.type}]`,
          type: replyingTo.type,
        }
      : null;

    let mediaType: 'photo' | 'video' | 'document' | 'voice' = 'document';
    if (file.type.startsWith('image/')) mediaType = 'photo';
    else if (file.type.startsWith('video/')) mediaType = 'video';
    else if (file.type.startsWith('audio/')) mediaType = 'voice';

    // Reset composer state immediately
    setSelectedFile(null);
    setIsViewOnce(false);
    setReplyingTo(null);
    setUploadProgress(0);

    // Optimistic item
    const optimisticMsg: MessageRecord = {
      id: tempId,
      tempId,
      roomId: room.id,
      senderId: currentUserId,
      senderName: 'You',
      content: file.name,
      type: mediaType,
      deliveryState: 'sending',
      replyTo: replyRef,
      media: {
        id: 'med_' + tempId,
        roomId: room.id,
        senderId: currentUserId,
        filename: file.name,
        originalName: file.name,
        mimeType: file.type,
        size: file.size,
        isViewOnce: isVo,
        isConsumed: false,
        createdAt: Date.now(),
      },
      isDeleted: false,
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    scrollToBottom(false);

    try {
      const serverMsg = await api.uploadMedia(
        room.id,
        file,
        mediaType,
        isVo,
        replyRef,
        tempId,
        (percent) => {
          setUploadProgress(percent);
        }
      );

      setMessages((prev) =>
        prev.map((m) => (m.tempId === tempId ? { ...serverMsg, deliveryState: 'sent' } : m))
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) => (m.tempId === tempId ? { ...m, deliveryState: 'failed' } : m))
      );
    } finally {
      setUploadProgress(null);
    }
  };

  // 6. Voice Memo Upload Handler
  const handleSendVoice = async (blob: Blob, listenOnce: boolean, duration: number = 0) => {
    setIsRecordingVoice(false);
    const tempId = 'temp_' + Date.now();
    const mime = blob.type || 'audio/webm';
    const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm';
    const filename = `voice_${Date.now()}.${ext}`;
    const voiceFile = new File([blob], filename, { type: mime });

    const optimisticMsg: MessageRecord = {
      id: tempId,
      tempId,
      roomId: room.id,
      senderId: currentUserId,
      senderName: 'You',
      content: 'Voice Memo',
      type: 'voice',
      deliveryState: 'sending',
      media: {
        id: 'med_' + tempId,
        roomId: room.id,
        senderId: currentUserId,
        filename,
        originalName: 'Voice Recording',
        mimeType: mime,
        size: blob.size,
        duration: duration > 0 ? duration : undefined,
        isViewOnce: listenOnce,
        isConsumed: false,
        createdAt: Date.now(),
      },
      isDeleted: false,
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    scrollToBottom(false);

    try {
      const serverMsg = await api.uploadMedia(
        room.id,
        voiceFile,
        'voice',
        listenOnce,
        replyingTo
          ? {
              id: replyingTo.id,
              senderName: replyingTo.senderName,
              text: replyingTo.content || '[Voice]',
              type: 'voice',
            }
          : null,
        tempId,
        undefined,
        duration
      );

      setReplyingTo(null);
      setMessages((prev) =>
        prev.map((m) => (m.tempId === tempId ? { ...serverMsg, deliveryState: 'sent' } : m))
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) => (m.tempId === tempId ? { ...m, deliveryState: 'failed' } : m))
      );
    }
  };

  // 7. Delete Message
  const handleDeleteMessage = async (msgId: string) => {
    try {
      await api.deleteMessage(room.id, msgId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, isDeleted: true, content: 'This message was deleted.', media: null }
            : m
        )
      );
    } catch (err: any) {
      console.error(err.message || 'Unable to delete message');
    }
  };

  // 8. Typing indicator handling
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    wsClient.sendTyping(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      wsClient.sendTyping(false);
    }, 2000);
  };

  // 9. Leave Room Action (Locks room automatically)
  const handleLeave = () => {
    // Notify server asynchronously without blocking navigation
    api.leaveRoom(room.id).catch(() => {});
    onLeaveRoom();
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(room.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const [isTogglingBlur, setIsTogglingBlur] = useState(false);

  const handleToggleBlur = async () => {
    if (isTogglingBlur) return;
    setIsTogglingBlur(true);
    const targetState = !(room.blurEnabled ?? true);
    try {
      const res = await api.toggleRoomBlur(room.id, targetState);
      if (res?.room) {
        setRoom(res.room);
      } else {
        setRoom((prev) => ({ ...prev, blurEnabled: targetState }));
      }
    } catch (err: any) {
      console.error('Failed to toggle blur state:', err);
    } finally {
      setIsTogglingBlur(false);
    }
  };

  const isMediaTypeForViewOnce =
    selectedFile && (selectedFile.type.startsWith('image/') || selectedFile.type.startsWith('video/'));

  return (
    <div className="flex flex-col h-screen max-h-screen bg-white dark:bg-[#0a0a0a] text-black dark:text-white select-text">
      {/* 1. ROOM HEADER */}
      <header className="shrink-0 border-b border-black dark:border-white px-4 py-3 bg-zinc-50 dark:bg-[#121214] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 overflow-hidden">
          <button
            type="button"
            onClick={handleLeave}
            className="p-1.5 border border-black dark:border-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer active:scale-95 flex items-center justify-center shrink-0"
            title="Go Back & Exit Room"
            aria-label="Go Back"
          >
            <ArrowLeft size={16} />
          </button>

          <div className="overflow-hidden">
            <div className="flex items-center gap-2">
              <h1 className="font-mono font-bold text-sm truncate tracking-tight text-black dark:text-white">
                {room.name}
              </h1>
              {room.isHidden && (
                <span className="text-[9px] font-mono uppercase px-1 border border-zinc-400 dark:border-zinc-600 text-zinc-500">
                  Hidden
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
              <button
                onClick={copyRoomId}
                className="flex items-center gap-1 hover:text-black dark:hover:text-white transition-colors"
                title="Copy Room ID"
              >
                <span>ID: {room.id}</span>
                {copiedId ? <Check size={11} /> : <Copy size={11} />}
              </button>
              <span>·</span>
              <span className="flex items-center gap-1 text-black dark:text-white">
                <Clock size={11} />
                <span>{timeRemaining}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Presence & Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-black">
            <span className="w-2 h-2 rounded-full bg-black dark:bg-white animate-pulse" />
            <span>Online: {onlineUsers.length || 1}</span>
          </div>

          {/* Privacy Blur Mode Toggle */}
          <button
            type="button"
            onClick={handleToggleBlur}
            disabled={isTogglingBlur}
            className={`px-2 py-1 border font-mono text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none active:scale-95 ${
              (room.blurEnabled ?? true)
                ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black shadow-2xs'
                : 'border-zinc-400 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:border-black dark:hover:border-white hover:text-black dark:hover:text-white'
            }`}
            title={
              (room.blurEnabled ?? true)
                ? 'Blur Mode is ON: Tap to turn OFF (future messages will not be blurred)'
                : 'Blur Mode is OFF: Tap to turn ON (future messages will be blurred by default)'
            }
          >
            {(room.blurEnabled ?? true) ? (
              <>
                <EyeOff size={13} className="shrink-0" />
                <span>Blur ON</span>
              </>
            ) : (
              <>
                <Eye size={13} className="shrink-0" />
                <span>Blur OFF</span>
              </>
            )}
          </button>

          {room.isOwner && (
            <button
              onClick={() => setIsOwnerSettingsOpen(true)}
              className="p-1.5 border border-black dark:border-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
              title="Room Controls"
              aria-label="Room Controls"
            >
              <Settings size={15} />
            </button>
          )}

          <ThemeToggle />
        </div>
      </header>

      {/* 2. CHAT MESSAGES SCROLL CONTAINER */}
      <main
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-1 relative"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-400 dark:text-zinc-600 font-mono text-xs space-y-2">
            <div className="w-12 h-12 border border-zinc-300 dark:border-zinc-800 flex items-center justify-center text-zinc-400 font-bold text-lg">
              2
            </div>
            <p className="font-semibold text-zinc-600 dark:text-zinc-400">
              Ephemeral Document Registry Opened
            </p>
            <p className="text-[11px] max-w-xs">
              Messages and media submitted to this room will persist authoritatively until expiration or owner deletion.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageItem
              key={msg.id || msg.tempId}
              message={msg}
              currentUserId={currentUserId}
              isRoomOwner={room.isOwner}
              onReply={(m) => setReplyingTo(m)}
              onDelete={handleDeleteMessage}
              onRetry={() => handleSendMessage()}
              onScrollToMessage={(targetId) => {
                const el = document.getElementById(`msg-${targetId}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            />
          ))
        )}

        {/* Real-time Typing Indicator */}
        {typingUsers.length > 0 && (
          <div className="py-1 px-2 text-[10px] font-mono text-zinc-500 italic animate-pulse">
            {typingUsers.length === 1
              ? `${typingUsers[0]} is typing...`
              : 'Several individuals are typing...'}
          </div>
        )}
      </main>

      {/* FLOATING "NEW MESSAGES" JUMP BUTTON */}
      {showScrollBottom && (
        <button
          onClick={() => scrollToBottom(false)}
          className="absolute bottom-24 right-6 z-20 px-3 py-1.5 border border-black dark:border-white bg-black dark:bg-white text-white dark:text-black font-mono text-xs font-bold shadow-lg flex items-center gap-1.5 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
        >
          <span>New messages</span>
          <ChevronDown size={13} />
        </button>
      )}

      {/* 3. MESSAGE COMPOSER FOOTER */}
      <footer className="shrink-0 border-t border-black dark:border-white bg-zinc-50 dark:bg-[#121214] p-3 space-y-2">
        {/* Reply Bar */}
        {replyingTo && (
          <div className="flex items-center justify-between p-2 border border-black dark:border-white bg-white dark:bg-black font-mono text-xs">
            <div className="truncate">
              <span className="font-bold text-black dark:text-white">↪ Replying to {replyingTo.senderName}:</span>{' '}
              <span className="text-zinc-500 truncate">
                {replyingTo.content || `[${replyingTo.type}]`}
              </span>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="text-zinc-400 hover:text-black dark:hover:text-white p-1"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Selected Attachment Bar */}
        {selectedFile && (
          <div className="flex items-center justify-between p-2 border border-black dark:border-white bg-white dark:bg-black font-mono text-xs">
            <div className="flex items-center gap-2 truncate">
              <span className="font-bold text-black dark:text-white truncate">Attached:</span>
              <span className="truncate text-zinc-600 dark:text-zinc-400">{selectedFile.name}</span>
              <span className="text-zinc-400 text-[10px]">
                ({(selectedFile.size / 1024).toFixed(0)} KB)
              </span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {isMediaTypeForViewOnce && (
                <button
                  type="button"
                  onClick={() => setIsViewOnce(!isViewOnce)}
                  className={`px-2 py-0.5 border text-[10px] font-bold uppercase transition-colors flex items-center gap-1 ${
                    isViewOnce
                      ? 'border-black dark:border-white bg-black dark:bg-white text-white dark:text-black'
                      : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {isViewOnce ? <EyeOff size={11} /> : <Eye size={11} />}
                  <span>View Once</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setIsViewOnce(false);
                }}
                className="text-zinc-400 hover:text-black dark:hover:text-white p-1"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        )}

        {/* Upload Progress Bar */}
        {uploadProgress !== null && (
          <div className="space-y-1 font-mono text-[10px]">
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
              <span>Transmitting asset...</span>
              <span>Uploading {uploadProgress}%</span>
            </div>
            <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 border border-zinc-400 dark:border-zinc-600">
              <div
                className="h-full bg-black dark:bg-white transition-all duration-150"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Voice Recorder Mode */}
        {isRecordingVoice ? (
          <VoiceRecorder
            onSendVoice={handleSendVoice}
            onCancel={() => setIsRecordingVoice(false)}
          />
        ) : (
          /* Normal Composer Input */
          <form onSubmit={handleSendMessage} className="flex items-end gap-2">
            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setSelectedFile(e.target.files[0]);
                }
              }}
              className="hidden"
            />

            {/* Attachment Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
              title="Attach File, Photo, Video, or Document"
              aria-label="Attach File"
            >
              <Paperclip size={16} />
            </button>

            {/* Voice Message Button */}
            <button
              type="button"
              onClick={() => setIsRecordingVoice(true)}
              className="p-2 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
              title="Record Voice Memo"
              aria-label="Record Voice Memo"
            >
              <Mic size={16} />
            </button>

            {/* Textarea */}
            <div className="flex-1 relative">
              <textarea
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                rows={1}
                placeholder="Draft message (Enter to dispatch, Shift+Enter for newline)..."
                className="w-full resize-none py-2 px-3 text-xs font-mono bg-white dark:bg-black border border-black dark:border-white text-black dark:text-white focus:outline-none min-h-[38px] max-h-32"
              />
            </div>

            {/* Send Button */}
            <button
              type="submit"
              disabled={(!inputText.trim() && !selectedFile) || uploadProgress !== null}
              className="p-2 border border-black dark:border-white bg-black dark:bg-white text-white dark:text-black font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-40 shrink-0"
              title="Send Message"
              aria-label="Send Message"
            >
              <Send size={16} />
            </button>
          </form>
        )}
      </footer>

      {/* Owner Settings Modal */}
      {room.isOwner && (
        <OwnerSettingsModal
          room={room}
          isOpen={isOwnerSettingsOpen}
          onClose={() => setIsOwnerSettingsOpen(false)}
          onRoomDeleted={onRoomDeleted}
          onRoomUpdated={(upd) => setRoom(upd)}
          onlineUserIds={onlineUsers.map((u) => u.userId)}
        />
      )}
    </div>
  );
};
