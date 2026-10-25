import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  FileText,
  Download,
  Trash2,
  Reply,
  Eye,
  EyeOff,
  Headphones,
  Play,
  Pause,
  RotateCcw,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  FileArchive,
  Film,
  Image as ImageIcon,
} from 'lucide-react';
import { MessageRecord } from '../types';
import { api } from '../services/api';

interface MessageItemProps {
  message: MessageRecord;
  currentUserId: string;
  isRoomOwner: boolean;
  onReply: (msg: MessageRecord) => void;
  onDelete: (msgId: string) => void;
  onRetry?: (msg: MessageRecord) => void;
  onScrollToMessage: (msgId: string) => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  currentUserId,
  isRoomOwner,
  onReply,
  onDelete,
  onRetry,
  onScrollToMessage,
}) => {
  const isMine = message.senderId === currentUserId;
  const canDelete = isMine || isRoomOwner;
  const isDeleted = message.isDeleted;

  // View Once & Media states
  const media = message.media;
  const isViewOnce = media?.isViewOnce || false;
  const isConsumed = media?.isConsumed || false;
  const isOptimistic = message.deliveryState === 'sending' || !!media?.id?.startsWith('med_temp_');

  // Local revealed state for recipient opening View Once
  const [isRevealed, setIsRevealed] = useState(false);
  const [revealedUrl, setRevealedUrl] = useState<string | null>(null);
  const recordedDuration = (media as any)?.duration || 0;
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState<number>(recordedDuration);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sync duration if media record updates
  useEffect(() => {
    if (recordedDuration > 0 && audioDuration === 0) {
      setAudioDuration(recordedDuration);
    }
  }, [recordedDuration, audioDuration]);

  const effectiveDuration = audioDuration > 0
    ? audioDuration
    : recordedDuration > 0
    ? recordedDuration
    : (audioRef.current && isFinite(audioRef.current.duration) && audioRef.current.duration > 0
        ? Math.round(audioRef.current.duration)
        : 0);

  // High precision time tracker during playback
  useEffect(() => {
    let animId: number;
    const updateProgress = () => {
      if (audioRef.current) {
        setAudioCurrentTime(audioRef.current.currentTime);
        if (
          isFinite(audioRef.current.duration) &&
          audioRef.current.duration > 0 &&
          audioDuration === 0
        ) {
          setAudioDuration(Math.round(audioRef.current.duration));
        }
      }
      if (isPlayingAudio) {
        animId = requestAnimationFrame(updateProgress);
      }
    };

    if (isPlayingAudio) {
      animId = requestAnimationFrame(updateProgress);
    }
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlayingAudio, audioDuration]);

  // Check if voice message
  const isVoice = message.type === 'voice' || !!(media && media.mimeType?.startsWith('audio/'));
  const voiceUrl = useMemo(() => {
    if (!media || isOptimistic) return '';
    return revealedUrl || api.getMediaUrl(message.roomId, media.id);
  }, [media?.id, message.roomId, revealedUrl, isOptimistic]);

  const handleToggleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = playbackSpeed === 1 ? 1.5 : playbackSpeed === 1.5 ? 2 : 1;
    setPlaybackSpeed(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
  };

  // Tap-and-hold blur state: blurred by default, unblurs only while held down (for non-voice messages)
  const [isHeld, setIsHeld] = useState(false);

  const handleHoldStart = (e?: React.SyntheticEvent) => {
    setIsHeld(true);
  };

  const handleHoldEnd = (e?: React.SyntheticEvent) => {
    setIsHeld(false);
  };

  // Tab blur deterrence: only for sensitive View Once media, close if user switches tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsHeld(false);
        if (isRevealed && isViewOnce) {
          setIsRevealed(false);
          setRevealedUrl(null);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isRevealed, isViewOnce]);

  const handleOpenViewOnce = () => {
    if (isMine) return; // Sender can NEVER view
    if (isConsumed && !isRevealed) return;

    if (!revealedUrl && media) {
      const url = api.getMediaUrl(message.roomId, media.id);
      setRevealedUrl(url);
      setIsRevealed(true);
      // Consume on server
      api.consumeMedia(message.roomId, media.id).catch(() => {});
    }
  };

  const handleCloseViewOnce = () => {
    setIsRevealed(false);
    setRevealedUrl(null);
  };

  // Audio Playback with direct DOM audio ref (supports smooth background/backside play)
  const togglePlayAudio = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    if (!audioRef.current) return;

    if (isViewOnce && isMine) return;
    if (isViewOnce && isConsumed && !revealedUrl) return;

    if (isViewOnce && !isConsumed && media) {
      api.consumeMedia(message.roomId, media.id).catch(() => {});
    }

    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.volume = 1.0;
      audioRef.current.playbackRate = playbackSpeed;
      if (
        audioRef.current.ended ||
        (effectiveDuration > 0 && audioRef.current.currentTime >= effectiveDuration - 0.2)
      ) {
        audioRef.current.currentTime = 0;
        setAudioCurrentTime(0);
      }
      audioRef.current
        .play()
        .then(() => {
          setIsPlayingAudio(true);
        })
        .catch(() => {
          setIsPlayingAudio(false);
        });
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, clickX / rect.width));
    const targetDuration = effectiveDuration > 0 ? effectiveDuration : (isFinite(audioRef.current.duration) ? audioRef.current.duration : 0);
    if (targetDuration > 0) {
      const newTime = fraction * targetDuration;
      audioRef.current.currentTime = newTime;
      setAudioCurrentTime(newTime);
    }
  };

  const formatAudioTime = (sec: number) => {
    if (!isFinite(sec) || isNaN(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Delivery status glyph
  const renderDeliveryState = () => {
    if (!isMine) return null;
    switch (message.deliveryState) {
      case 'sending':
        return (
          <span className="flex items-center gap-0.5 text-[9px] font-mono text-zinc-400" title="Sending...">
            <Clock size={10} />
            <span>Sending</span>
          </span>
        );
      case 'sent':
        return (
          <span className="flex items-center gap-0.5 text-[9px] font-mono text-zinc-500" title="Sent to server">
            <Check size={11} />
            <span>Sent</span>
          </span>
        );
      case 'delivered':
        return (
          <span className="flex items-center gap-0.5 text-[9px] font-mono text-zinc-600 dark:text-zinc-300" title="Delivered to members">
            <CheckCheck size={11} />
            <span>Delivered</span>
          </span>
        );
      case 'seen':
        return (
          <span className="flex items-center gap-0.5 text-[9px] font-mono font-bold text-black dark:text-white" title="Seen by recipient">
            <CheckCheck size={11} />
            <span>Seen</span>
          </span>
        );
      case 'failed':
        return (
          <button
            onClick={() => onRetry && onRetry(message)}
            className="flex items-center gap-1 text-[9px] font-mono text-black dark:text-white border border-black dark:border-white px-1 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800"
            title="Failed to deliver. Click to retry."
          >
            <RotateCcw size={9} />
            <span>Retry</span>
          </button>
        );
      default:
        return null;
    }
  };

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // SYSTEM NOTIFICATION MESSAGES (e.g. Blur Mode toggled)
  if (message.type === 'system') {
    return (
      <div id={`msg-${message.id}`} className="flex justify-center my-3 select-none px-4 w-full">
        <div className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-mono text-[11px] flex items-center gap-2 shadow-2xs">
          <AlertCircle size={13} className="text-zinc-500 shrink-0" />
          <span className="font-semibold">{message.content}</span>
          <span className="text-[10px] text-zinc-400">· {formatTimestamp(message.createdAt)}</span>
        </div>
      </div>
    );
  }

  const isBlurredMessage = !isVoice && (message.isBlurred ?? true);

  return (
    <div
      id={`msg-${message.id}`}
      className={`group flex flex-col my-2 max-w-[85%] sm:max-w-[75%] transition-colors ${
        isMine ? 'ml-auto items-end' : 'mr-auto items-start'
      }`}
    >
      {/* Header: Sender & Timestamp */}
      <div className="flex items-center gap-2 mb-1 px-1 text-[10px] font-mono text-zinc-500">
        <span className="font-semibold text-black dark:text-white">{message.senderName}</span>
        <span>·</span>
        <span>{formatTimestamp(message.createdAt)}</span>
      </div>

      {/* Message Card */}
      <div
        className={`relative border p-3 text-xs font-mono transition-shadow ${
          isMine
            ? 'border-black dark:border-white bg-zinc-50 dark:bg-[#18181b]'
            : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#121214]'
        } ${isDeleted ? 'opacity-60 italic' : ''}`}
        onContextMenu={(e) => {
          if (isViewOnce) {
            e.preventDefault(); // Screenshot / right-click deterrence
          }
        }}
      >
        {/* Reply Reference Preview */}
        {message.replyTo && (
          <button
            type="button"
            onClick={() => onScrollToMessage(message.replyTo!.id)}
            className="w-full text-left mb-2.5 p-1.5 border-l-2 border-black dark:border-white bg-zinc-100 dark:bg-zinc-800/80 text-[10px] block transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700"
          >
            <div className="font-bold text-black dark:text-white truncate">
              ↪ {message.replyTo.senderName}
            </div>
            <div className="text-zinc-600 dark:text-zinc-400 truncate">
              {message.replyTo.text || `[${message.replyTo.type}]`}
            </div>
          </button>
        )}

        {/* DELETED MESSAGE */}
        {isDeleted ? (
          <div className="flex items-center gap-1.5 text-zinc-500 text-[11px]">
            <Trash2 size={12} />
            <span>This message was deleted.</span>
          </div>
        ) : isVoice ? (
          /* VOICE MESSAGE: NEVER BLURRED, NO EYE LOGO, NO HOLD-TO-REVEAL OVERLAY */
          <div className="space-y-2 select-text">
            {voiceUrl && (
              <audio
                ref={audioRef}
                src={voiceUrl}
                preload="auto"
                playsInline
                onPlay={() => setIsPlayingAudio(true)}
                onPause={() => setIsPlayingAudio(false)}
                onTimeUpdate={(e) => {
                  const el = e.currentTarget;
                  setAudioCurrentTime(el.currentTime);
                  if (isFinite(el.duration) && el.duration > 0 && audioDuration === 0) {
                    setAudioDuration(Math.round(el.duration));
                  }
                }}
                onLoadedMetadata={(e) => {
                  const el = e.currentTarget;
                  if (isFinite(el.duration) && el.duration > 0 && audioDuration === 0) {
                    setAudioDuration(Math.round(el.duration));
                  }
                }}
                onDurationChange={(e) => {
                  const el = e.currentTarget;
                  if (isFinite(el.duration) && el.duration > 0 && audioDuration === 0) {
                    setAudioDuration(Math.round(el.duration));
                  }
                }}
                onError={() => {
                  setIsPlayingAudio(false);
                }}
                onEnded={() => {
                  setIsPlayingAudio(false);
                  setAudioCurrentTime(0);
                  if (audioRef.current) {
                    audioRef.current.currentTime = 0;
                  }
                  if (isViewOnce) {
                    setIsRevealed(false);
                  }
                }}
              />
            )}

            {isOptimistic ? (
              <div className="p-3 border border-black dark:border-white bg-white dark:bg-black font-mono flex items-center gap-2.5 text-xs text-zinc-500">
                <div className="w-3.5 h-3.5 border-2 border-black dark:border-white border-t-transparent animate-spin rounded-full shrink-0" />
                <span>Transmitting voice memo...</span>
              </div>
            ) : (
              <div className="p-3 border border-black dark:border-white bg-white dark:bg-black font-mono space-y-2">
                <div className="flex items-center justify-between text-[10px] text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <Headphones size={13} className="text-black dark:text-white" />
                    <span className="font-bold text-black dark:text-white">
                      {isViewOnce ? 'Listen Once Voice Memo' : 'Voice Memo'}
                    </span>
                  </div>
                  {isViewOnce ? (
                    <span className="text-[9px] uppercase px-1.5 py-0.5 border border-zinc-400 text-zinc-600 dark:text-zinc-400 font-mono">
                      1-Play
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {effectiveDuration > 0 ? formatAudioTime(effectiveDuration) : 'Voice Memo'}
                    </span>
                  )}
                </div>

                {isViewOnce && isMine ? (
                  <p className="text-[10px] text-zinc-500 italic">
                    Sender cannot replay Listen Once recording.
                  </p>
                ) : isViewOnce && isConsumed && !isPlayingAudio ? (
                  <p className="text-[10px] text-zinc-400 italic">
                    Recording expired after playback.
                  </p>
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={togglePlayAudio}
                      className="w-9 h-9 flex items-center justify-center border border-black dark:border-white bg-black dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shrink-0 cursor-pointer"
                      aria-label={isPlayingAudio ? 'Pause Voice' : 'Play Voice'}
                    >
                      {isPlayingAudio ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                    </button>
                    <div className="flex-1 space-y-1">
                      {/* Audio waveform / progress bar with seeking */}
                      <div
                        onClick={handleSeek}
                        className="h-3 bg-zinc-200 dark:bg-zinc-800 border border-zinc-400 dark:border-zinc-600 relative overflow-hidden cursor-pointer"
                        title="Click to seek"
                      >
                        <div
                          className="h-full bg-black dark:bg-white transition-all duration-75"
                          style={{
                            width: effectiveDuration > 0
                              ? `${Math.min(100, Math.max(0, (audioCurrentTime / effectiveDuration) * 100))}%`
                              : '0%',
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-zinc-600 dark:text-zinc-400 font-mono">
                        <span className="font-bold text-black dark:text-white">{formatAudioTime(audioCurrentTime)}</span>
                        <span>{effectiveDuration > 0 ? formatAudioTime(effectiveDuration) : '0:00'}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleSpeed}
                      className="px-1.5 py-0.5 border border-zinc-400 dark:border-zinc-600 hover:border-black dark:hover:border-white text-[10px] font-mono text-zinc-600 dark:text-zinc-300 transition-colors shrink-0"
                      title="Toggle playback speed (1x / 1.5x / 2x)"
                    >
                      {playbackSpeed}x
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* OTHER MESSAGES (TEXT, PHOTOS, VIDEOS, DOCUMENTS): TAP-AND-HOLD BLUR ONLY IF isBlurredMessage */
          <div
            className={`relative ${
              isBlurredMessage ? 'select-none cursor-pointer' : 'select-text'
            }`}
            onPointerDown={isBlurredMessage ? handleHoldStart : undefined}
            onPointerUp={isBlurredMessage ? handleHoldEnd : undefined}
            onPointerLeave={isBlurredMessage ? handleHoldEnd : undefined}
            onPointerCancel={isBlurredMessage ? handleHoldEnd : undefined}
            onTouchStart={isBlurredMessage ? handleHoldStart : undefined}
            onTouchEnd={isBlurredMessage ? handleHoldEnd : undefined}
            onTouchCancel={isBlurredMessage ? handleHoldEnd : undefined}
            onMouseDown={isBlurredMessage ? handleHoldStart : undefined}
            onMouseUp={isBlurredMessage ? handleHoldEnd : undefined}
            onMouseLeave={isBlurredMessage ? handleHoldEnd : undefined}
            onContextMenu={isBlurredMessage ? (e) => e.preventDefault() : undefined}
            style={
              isBlurredMessage
                ? {
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    WebkitTouchCallout: 'none',
                  }
                : undefined
            }
          >
            {/* Tap-and-Hold Privacy Indicator Badge (ONLY when message is blurred) */}
            {isBlurredMessage && (
              !isHeld ? (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none p-2">
                  <div className="px-2.5 py-1.5 bg-black/85 dark:bg-white/90 text-white dark:text-black text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md border border-zinc-700 dark:border-zinc-300">
                    <EyeOff size={12} />
                    <span>Hold to Reveal</span>
                  </div>
                </div>
              ) : (
                <div className="absolute -top-2.5 right-0 z-20 pointer-events-none">
                  <div className="px-1.5 py-0.5 bg-black dark:bg-white text-white dark:text-black text-[8px] font-mono font-bold uppercase tracking-wide flex items-center gap-1 shadow">
                    <Eye size={9} />
                    <span>Revealed</span>
                  </div>
                </div>
              )
            )}

            {/* Content with Privacy Blur (only if isBlurredMessage) */}
            <div
              className={`space-y-2 ${
                isBlurredMessage
                  ? `transition-[filter] duration-150 ${isHeld ? 'privacy-unblur' : 'privacy-blur'}`
                  : ''
              }`}
            >
              {/* VIEW ONCE MEDIA (PHOTO / VIDEO) */}
              {media && isViewOnce && (media.mimeType.startsWith('image/') || media.mimeType.startsWith('video/')) && (
                <div className="select-none">
                  {isMine ? (
                    // SENDER RESTRICTION: Sender can never view own View Once
                    <div className="p-3 border border-zinc-400 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-900/60 text-center space-y-1">
                      <div className="flex items-center justify-center gap-1.5 text-zinc-600 dark:text-zinc-400 font-bold uppercase text-[10px]">
                        <EyeOff size={13} />
                        <span>View Once Dispatched</span>
                      </div>
                      <p className="text-[10px] text-zinc-500">
                        Sender cannot access or replay View Once media.
                      </p>
                    </div>
                  ) : isConsumed && !isRevealed ? (
                    // ALREADY CONSUMED
                    <div className="p-3 border border-zinc-300 dark:border-zinc-700 bg-zinc-100/50 dark:bg-zinc-900/30 text-center space-y-1 text-zinc-500">
                      <div className="flex items-center justify-center gap-1 text-[10px] uppercase font-bold">
                        <EyeOff size={13} />
                        <span>Media Expired</span>
                      </div>
                      <p className="text-[10px]">This one-time asset has been consumed and revoked.</p>
                    </div>
                  ) : isRevealed && revealedUrl ? (
                    // REVEALED TO RECIPIENT
                    <div className="space-y-2">
                      <div className="relative border border-black dark:border-white overflow-hidden bg-black flex items-center justify-center">
                        {media.mimeType.startsWith('image/') ? (
                          <img
                            src={revealedUrl}
                            alt="Confidential View Once"
                            className="max-h-80 w-auto object-contain"
                            onContextMenu={(e) => e.preventDefault()}
                          />
                        ) : (
                          <video
                            src={revealedUrl}
                            controls
                            autoPlay
                            playsInline
                            controlsList="nodownload nofullscreen"
                            className="max-h-80 w-auto"
                            onContextMenu={(e) => e.preventDefault()}
                          />
                        )}
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={handleCloseViewOnce}
                          className="px-2 py-1 text-[10px] border border-black dark:border-white font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          Close & Invalidate
                        </button>
                      </div>
                    </div>
                  ) : (
                    // BLURRED OBSCURED PREVIEW (NO "Tap to reveal", NO countdown timer)
                    <button
                      type="button"
                      onClick={handleOpenViewOnce}
                      className="w-full p-4 border border-black dark:border-white bg-zinc-100 dark:bg-zinc-900 flex flex-col items-center justify-center gap-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <div className="w-10 h-10 border border-black dark:border-white flex items-center justify-center bg-white dark:bg-black">
                        <EyeOff size={18} className="text-black dark:text-white" />
                      </div>
                      <span className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider">
                        Protected One-Time Media
                      </span>
                    </button>
                  )}
                </div>
              )}

              {/* NORMAL PHOTO */}
              {media && !isViewOnce && media.mimeType.startsWith('image/') && (
                <div className="relative border border-black dark:border-white bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
                  {isOptimistic ? (
                    <div className="p-4 flex items-center gap-2 text-xs font-mono text-zinc-500">
                      <div className="w-3.5 h-3.5 border-2 border-black dark:border-white border-t-transparent animate-spin rounded-full shrink-0" />
                      <span>Uploading photo...</span>
                    </div>
                  ) : (
                    <img
                      src={api.getMediaUrl(message.roomId, media.id)}
                      alt={media.originalName}
                      className="max-h-80 w-auto object-contain cursor-pointer"
                      onClick={() => window.open(api.getMediaUrl(message.roomId, media.id), '_blank')}
                      loading="lazy"
                    />
                  )}
                </div>
              )}

              {/* NORMAL VIDEO */}
              {media && !isViewOnce && media.mimeType.startsWith('video/') && (
                <div className="relative border border-black dark:border-white bg-black">
                  {isOptimistic ? (
                    <div className="p-4 flex items-center gap-2 text-xs font-mono text-zinc-400">
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent animate-spin rounded-full shrink-0" />
                      <span>Uploading video...</span>
                    </div>
                  ) : (
                    <video
                      src={api.getMediaUrl(message.roomId, media.id)}
                      controls
                      playsInline
                      controlsList="nodownload"
                      className="max-h-80 w-full"
                    />
                  )}
                </div>
              )}

              {/* DOCUMENT / FILE ATTACHMENT */}
              {media && message.type === 'document' && !media.mimeType.startsWith('audio/') && (
                <div className="p-2.5 border border-black dark:border-white bg-zinc-50 dark:bg-zinc-900/70 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div className="w-8 h-8 flex items-center justify-center border border-black dark:border-white bg-white dark:bg-black shrink-0">
                      <FileText size={16} />
                    </div>
                    <div className="truncate">
                      <div className="font-bold text-xs text-black dark:text-white truncate">
                        {media.originalName}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        {isOptimistic ? 'Uploading...' : formatFileSize(media.size)}
                      </div>
                    </div>
                  </div>

                  {!isOptimistic && (
                    <a
                      href={api.getMediaUrl(message.roomId, media.id)}
                      download={media.originalName}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="px-2.5 py-1 text-[11px] font-mono border border-black dark:border-white hover:bg-zinc-200 dark:hover:bg-zinc-800 flex items-center gap-1 shrink-0"
                    >
                      <Download size={11} />
                      <span>Get</span>
                    </a>
                  )}
                </div>
              )}

              {/* TEXT CONTENT */}
              {message.content && (!media || (message.type !== 'voice' && message.type !== 'document' && message.content !== media.originalName)) && (
                <div className="whitespace-pre-wrap break-words leading-relaxed text-black dark:text-white">
                  {message.content}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer: Actions & Delivery state */}
        <div className="mt-2.5 pt-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4 text-[10px]">
          <div className="flex items-center gap-2">
            {!isDeleted && (
              <button
                type="button"
                onClick={() => onReply(message)}
                className="opacity-70 hover:opacity-100 flex items-center gap-1 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-opacity"
                title="Reply"
              >
                <Reply size={11} />
                <span>Reply</span>
              </button>
            )}

            {canDelete && !isDeleted && (
              <button
                type="button"
                onClick={() => onDelete(message.id)}
                className="opacity-60 hover:opacity-100 flex items-center gap-1 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-opacity"
                title="Delete message"
              >
                <Trash2 size={11} />
                <span>Delete</span>
              </button>
            )}
          </div>

          <div className="ml-auto">
            {renderDeliveryState()}
          </div>
        </div>
      </div>
    </div>
  );
};
