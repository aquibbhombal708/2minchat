import React, { useState, useRef, useEffect } from 'react';
import { Square, Trash2, Send, Play, Pause, AlertCircle, Headphones, Volume2 } from 'lucide-react';

interface VoiceRecorderProps {
  onSendVoice: (blob: Blob, isListenOnce: boolean, duration: number) => Promise<void>;
  onCancel: () => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onSendVoice,
  onCancel,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [isListenOnce, setIsListenOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const isRecordingRef = useRef<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const mimeTypeRef = useRef<string>('audio/webm');
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    startRecording();
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    isRecordingRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close().catch(() => {});
      } catch (e) {
        // ignore
      }
      audioContextRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        // ignore
      }
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
  };

  const startRecording = async () => {
    setError(null);
    audioChunksRef.current = [];
    setDuration(0);
    durationRef.current = 0;
    setAudioLevel(0);
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Audio recording is not supported in this browser environment.');
      return;
    }

    try {
      // High-fidelity microphone constraints with Auto Gain Control, Noise Suppression & Echo Cancellation
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48000 },
        },
      });
      streamRef.current = stream;
      isRecordingRef.current = true;
      setIsRecording(true);

      // Real-time audio analyser for visual feedback & mic level monitoring
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;
          if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
          }
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.25;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            if (!isRecordingRef.current) return;
            analyser.getByteTimeDomainData(dataArray);
            let sumSquares = 0;
            for (let i = 0; i < dataArray.length; i++) {
              const norm = (dataArray[i] - 128) / 128;
              sumSquares += norm * norm;
            }
            const rms = Math.sqrt(sumSquares / dataArray.length);
            // Boost sensitivity so ordinary speaking registers 30-90%
            const level = Math.min(100, Math.round(rms * 400));
            setAudioLevel(level);
            animFrameRef.current = requestAnimationFrame(tick);
          };
          animFrameRef.current = requestAnimationFrame(tick);
        }
      } catch (e) {
        // AudioContext fallback
      }

      // Determine best audio format
      let preferredMime = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        preferredMime = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        preferredMime = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        preferredMime = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        preferredMime = 'audio/ogg';
      }

      mimeTypeRef.current = preferredMime;

      // 128 kbps high clarity voice bitrate
      const recorderOptions: MediaRecorderOptions = {
        mimeType: preferredMime,
        audioBitsPerSecond: 128000,
      };

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, recorderOptions);
      } catch (optErr) {
        recorder = new MediaRecorder(stream, { mimeType: preferredMime });
      }

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const fullBlob = new Blob(audioChunksRef.current, { type: preferredMime });
        setAudioBlob(fullBlob);
        const url = URL.createObjectURL(fullBlob);
        setAudioUrl(url);

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = null;
        }
        setAudioLevel(0);
      };

      // Start contiguous recording
      recorder.start();
      startTimeRef.current = Date.now();

      timerRef.current = setInterval(() => {
        const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
        setDuration(elapsed);
        durationRef.current = elapsed;
      }, 500);
    } catch (err: any) {
      isRecordingRef.current = false;
      setIsRecording(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Microphone permission denied. Please allow microphone access in browser settings.');
      } else {
        setError('Microphone unavailable or unsupported.');
      }
    }
  };

  const stopRecording = () => {
    isRecordingRef.current = false;
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    const elapsed = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
    setDuration(elapsed);
    durationRef.current = elapsed;

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setAudioLevel(0);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const togglePreview = () => {
    if (!previewAudioRef.current && audioUrl) {
      previewAudioRef.current = new Audio(audioUrl);
      previewAudioRef.current.volume = 1.0;
      previewAudioRef.current.onended = () => setIsPlayingPreview(false);
    }

    if (previewAudioRef.current) {
      if (isPlayingPreview) {
        previewAudioRef.current.pause();
        setIsPlayingPreview(false);
      } else {
        previewAudioRef.current
          .play()
          .then(() => setIsPlayingPreview(true))
          .catch(() => setIsPlayingPreview(false));
      }
    }
  };

  const handleSend = async () => {
    setIsSubmitting(true);
    try {
      let finalBlob = audioBlob;
      let finalDuration = durationRef.current || duration;

      if (!finalBlob && mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        isRecordingRef.current = false;
        finalDuration = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
        await new Promise<void>((resolve) => {
          if (!mediaRecorderRef.current) return resolve();
          mediaRecorderRef.current.onstop = () => {
            finalBlob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });
            setAudioBlob(finalBlob);
            if (streamRef.current) {
              streamRef.current.getTracks().forEach((track) => track.stop());
              streamRef.current = null;
            }
            resolve();
          };
          mediaRecorderRef.current.stop();
          if (timerRef.current) clearInterval(timerRef.current);
          setIsRecording(false);
        });
      }

      if (!finalBlob) {
        setIsSubmitting(false);
        return;
      }

      await onSendVoice(finalBlob, isListenOnce, Math.max(1, finalDuration));
      cleanup();
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch voice memo');
      setIsSubmitting(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="p-3 border border-black dark:border-white bg-zinc-50 dark:bg-zinc-900/90 font-mono text-xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRecording ? (
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 dark:bg-red-500 animate-pulse" />
          ) : (
            <Headphones size={13} className="text-zinc-500" />
          )}
          <span className="font-bold text-black dark:text-white uppercase tracking-wider text-[11px]">
            {isRecording ? 'Recording Voice Memo' : 'Voice Memo Ready'}
          </span>
          <span className="text-zinc-500">[{formatTime(duration)}]</span>
        </div>

        <button
          type="button"
          onClick={() => {
            cleanup();
            onCancel();
          }}
          className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-black dark:hover:text-white"
          title="Discard recording"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Live Voice Level Visualizer Meter */}
      {isRecording && (
        <div className="space-y-1 bg-white dark:bg-black p-2 border border-zinc-300 dark:border-zinc-700">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
            <span className="flex items-center gap-1.5 font-bold text-black dark:text-white">
              <Volume2
                size={12}
                className={audioLevel > 10 ? 'text-emerald-600 dark:text-emerald-400 animate-pulse' : 'text-zinc-400'}
              />
              <span>Live Mic Level</span>
            </span>
            <span className="text-[10px] font-mono">
              {audioLevel > 15 ? '● Voice detected' : 'Speak into mic...'}
            </span>
          </div>

          {/* 16-segment LED audio visualizer */}
          <div className="flex items-center gap-1 h-3.5 w-full">
            {Array.from({ length: 16 }).map((_, i) => {
              const threshold = (i + 1) * 6;
              const isActive = audioLevel >= threshold;
              const isHigh = i >= 12;
              const isMid = i >= 8;
              return (
                <div
                  key={i}
                  className={`flex-1 h-full transition-all duration-75 border ${
                    isActive
                      ? isHigh
                        ? 'bg-red-500 border-red-600'
                        : isMid
                        ? 'bg-yellow-500 border-yellow-600'
                        : 'bg-emerald-500 border-emerald-600'
                      : 'bg-zinc-200 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700'
                  }`}
                />
              );
            })}
          </div>
        </div>
      )}

      {error ? (
        <div className="p-2 border border-black dark:border-white bg-white dark:bg-black text-[11px] text-black dark:text-white flex items-center gap-1.5">
          <AlertCircle size={13} />
          <span>{error}</span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 pt-1">
          {isRecording ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={stopRecording}
                className="px-3 py-1.5 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1.5 font-bold"
              >
                <Square size={11} className="fill-current" />
                <span>Finish</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={togglePreview}
                className="px-3 py-1.5 border border-black dark:border-white bg-white dark:bg-black text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1.5 font-bold"
                title="Preview voice memo before sending"
              >
                {isPlayingPreview ? <Pause size={12} /> : <Play size={12} />}
                <span>{isPlayingPreview ? 'Pause' : 'Listen'}</span>
              </button>
              <button
                type="button"
                onClick={startRecording}
                className="px-2 py-1.5 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-black dark:hover:border-white transition-colors"
              >
                Re-record
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            {/* Listen Once Toggle */}
            <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={isListenOnce}
                onChange={(e) => setIsListenOnce(e.target.checked)}
                className="w-3.5 h-3.5 accent-black dark:accent-white"
              />
              <span>Listen Once</span>
            </label>

            <button
              type="button"
              onClick={handleSend}
              disabled={isSubmitting}
              className="px-4 py-1.5 border border-black dark:border-white bg-black dark:bg-white text-white dark:text-black font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors flex items-center gap-1.5 disabled:opacity-40"
            >
              <span>{isSubmitting ? 'Sending...' : 'Send'}</span>
              <Send size={11} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
