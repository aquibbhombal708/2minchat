import React, { useState, useEffect } from 'react';
import { X, Lock, AlertTriangle, ArrowRight } from 'lucide-react';
import { api } from '../services/api';
import { RoomDetails } from '../types';

interface UnlockModalProps {
  roomId: string;
  roomName?: string;
  isOpen: boolean;
  onClose: () => void;
  onUnlocked: (room: RoomDetails) => void;
}

export const UnlockModal: React.FC<UnlockModalProps> = ({
  roomId,
  roomName,
  isOpen,
  onClose,
  onUnlocked,
}) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lockCountdown, setLockCountdown] = useState<number>(0);

  useEffect(() => {
    if (!isOpen) {
      setCode('');
      setError(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (lockCountdown > 0) {
      const timer = setInterval(() => {
        setLockCountdown((prev) => (prev > 1 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [lockCountdown]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length !== 4 || !/^\d{4}$/.test(code.trim())) {
      setError('Please enter a 4-digit numeric code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await api.unlockRoom(roomId, code.trim());
      onUnlocked(result.room);
    } catch (err: any) {
      if (err.locked && err.remainingSec) {
        setLockCountdown(err.remainingSec);
        setError(`Rate limited. Try again in ${err.remainingSec}s.`);
      } else {
        setError(err.message || 'Incorrect access code');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unlock-title"
        className="w-full max-w-sm bg-white dark:bg-[#121214] border border-black dark:border-white shadow-2xl p-6 relative"
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-black dark:text-white" />
            <h2 id="unlock-title" className="font-mono font-bold text-xs uppercase tracking-wider text-black dark:text-white">
              Room Access Required
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        <div className="mt-3">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
            Room: <span className="font-bold text-black dark:text-white">{roomName || roomId}</span>
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
            Enter the 4-digit access code established by the room creator.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-[11px] font-mono uppercase text-zinc-600 dark:text-zinc-400 mb-1">
              4-Digit Access Code
            </label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={code}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                setCode(val);
                if (error) setError(null);
              }}
              placeholder="••••"
              disabled={lockCountdown > 0 || isLoading}
              className="w-full h-11 px-3 text-center tracking-[0.5em] font-mono text-xl font-bold bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white focus:border-black dark:focus:border-white disabled:opacity-50"
              autoFocus
            />
          </div>

          {error && (
            <div className="p-2.5 border border-zinc-400 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-900 text-xs font-mono text-black dark:text-white flex items-center gap-2">
              <AlertTriangle size={13} />
              <span>{error}</span>
            </div>
          )}

          {lockCountdown > 0 && (
            <p className="text-center font-mono text-xs text-zinc-500">
              Cooling down: {lockCountdown}s remaining
            </p>
          )}

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 py-2 text-xs font-mono border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={code.length !== 4 || lockCountdown > 0 || isLoading}
              className="w-1/2 py-2 text-xs font-mono font-bold bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              <span>{isLoading ? 'Verifying...' : 'Unlock'}</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
