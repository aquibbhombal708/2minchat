import React, { useState } from 'react';
import { X, Plus, Key, Lock, Clock, EyeOff, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { RoomDetails } from '../types';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRoomCreated: (room: RoomDetails) => void;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  isOpen,
  onClose,
  onRoomCreated,
}) => {
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [code, setCode] = useState('');
  const [lifetimeHours, setLifetimeHours] = useState<number>(24); // default 24h as required
  const [isHidden, setIsHidden] = useState(false);
  const [secretCode, setSecretCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const generateAutoId = () => {
    const rand = 'room-' + Math.random().toString(36).substring(2, 8);
    setRoomId(rand);
  };

  const generateRandomCode = () => {
    const c = Math.floor(1000 + Math.random() * 9000).toString();
    setCode(c);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a Room Name');
      return;
    }
    if (!code.trim() || code.trim().length !== 4 || !/^\d{4}$/.test(code.trim())) {
      setError('Access Code must be exactly 4 digits');
      return;
    }
    if (isHidden && !secretCode.trim()) {
      setError('Please provide a Secret Code for your hidden room');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await api.createRoom({
        name: name.trim(),
        roomId: roomId.trim() || undefined,
        code: code.trim(),
        lifetimeHours,
        isHidden,
        secretCode: isHidden ? secretCode.trim() : undefined,
      });
      onRoomCreated(res.room);
    } catch (err: any) {
      setError(err.message || 'Failed to create room');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
        className="w-full max-w-md bg-white dark:bg-[#121214] border border-black dark:border-white shadow-2xl p-6 relative max-h-[95vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Plus size={15} className="text-black dark:text-white" />
            <h2 id="create-title" className="font-mono font-bold text-xs uppercase tracking-wider text-black dark:text-white">
              Initialize New Room
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

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Room Name */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-zinc-600 dark:text-zinc-400 mb-1">
              Room Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Confidential Project Review"
              className="w-full h-10 px-3 font-mono text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white focus:border-black dark:focus:border-white"
              required
            />
          </div>

          {/* Room ID (Custom or Auto) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-mono uppercase text-zinc-600 dark:text-zinc-400">
                Room ID (Unique Handle)
              </label>
              <button
                type="button"
                onClick={generateAutoId}
                className="text-[10px] font-mono flex items-center gap-1 text-zinc-500 hover:text-black dark:hover:text-white transition-colors"
              >
                <RefreshCw size={10} />
                <span>Generate ID</span>
              </button>
            </div>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              placeholder="e.g. briefing-alpha (Leave empty to auto-generate)"
              className="w-full h-10 px-3 font-mono text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white focus:border-black dark:focus:border-white"
            />
          </div>

          {/* 4-Digit Access Code */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-mono uppercase text-zinc-600 dark:text-zinc-400">
                4-Digit Access Code *
              </label>
              <button
                type="button"
                onClick={generateRandomCode}
                className="text-[10px] font-mono flex items-center gap-1 text-zinc-500 hover:text-black dark:hover:text-white transition-colors"
              >
                <Lock size={10} />
                <span>Random PIN</span>
              </button>
            </div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="e.g. 7492"
              className="w-full h-10 px-3 font-mono text-sm tracking-widest bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white focus:border-black dark:focus:border-white text-center font-bold"
              required
            />
            <p className="text-[10px] font-mono text-zinc-400 mt-1">
              Required for all participants to unlock and enter.
            </p>
          </div>

          {/* Room Expiry Duration */}
          <div>
            <div className="flex items-center justify-between text-[11px] font-mono uppercase text-zinc-600 dark:text-zinc-400 mb-1">
              <span className="flex items-center gap-1">
                <Clock size={12} />
                <span>Authoritative Lifetime (Max 24h)</span>
              </span>
              <span className="font-bold text-black dark:text-white">{lifetimeHours} Hours</span>
            </div>
            
            {/* Quick Presets (1h, 2h, 6h, 12h, 24h max - NO 48h) */}
            <div className="grid grid-cols-5 gap-1.5 font-mono text-xs mb-2">
              {[1, 2, 6, 12, 24].map((hours) => (
                <button
                  type="button"
                  key={hours}
                  onClick={() => setLifetimeHours(hours)}
                  className={`py-1.5 border text-center transition-colors ${
                    lifetimeHours === hours
                      ? 'border-black dark:border-white bg-black dark:bg-white text-white dark:text-black font-bold'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400'
                  }`}
                >
                  {hours}h
                </button>
              ))}
            </div>

            {/* Custom Timer Input (1 to 24 hours) */}
            <div className="p-2.5 border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-zinc-600 dark:text-zinc-400">Custom Timer (1–24 Hours):</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={lifetimeHours}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) {
                        setLifetimeHours(Math.max(1, Math.min(24, val)));
                      }
                    }}
                    className="w-14 h-7 text-center font-bold font-mono text-xs bg-white dark:bg-black border border-zinc-300 dark:border-zinc-700 text-black dark:text-white"
                  />
                  <span className="text-[10px] text-zinc-500">hrs</span>
                </div>
              </div>
              <input
                type="range"
                min={1}
                max={24}
                step={1}
                value={lifetimeHours}
                onChange={(e) => setLifetimeHours(parseInt(e.target.value, 10))}
                className="w-full accent-black dark:accent-white cursor-pointer"
              />
              <div className="flex justify-between text-[9px] font-mono text-zinc-400">
                <span>1h (Min)</span>
                <span>12h</span>
                <span className="font-bold text-black dark:text-white">24h (Max Limit)</span>
              </div>
            </div>
          </div>

          {/* Hidden Room Option */}
          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isHidden}
                onChange={(e) => setIsHidden(e.target.checked)}
                className="w-4 h-4 accent-black dark:accent-white"
              />
              <span className="text-xs font-mono font-medium text-black dark:text-white flex items-center gap-1">
                <EyeOff size={13} />
                <span>Hidden Room (Excluded from public search)</span>
              </span>
            </label>

            {isHidden && (
              <div className="mt-3 pl-6 space-y-1">
                <label className="block text-[10px] font-mono uppercase text-zinc-500">
                  Secret Search Code *
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={secretCode}
                    onChange={(e) => setSecretCode(e.target.value)}
                    placeholder="Enter personal secret code"
                    className="w-full h-9 px-3 font-mono text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white"
                  />
                  <Key size={13} className="absolute right-3 top-2.5 text-zinc-400" />
                </div>
                <p className="text-[10px] text-zinc-400">
                  Only individuals entering this secret code via the search bar key icon can view this room.
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="p-2 border border-black dark:border-white bg-zinc-100 dark:bg-zinc-900 text-xs font-mono text-black dark:text-white">
              {error}
            </div>
          )}

          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-mono border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 text-xs font-mono font-bold bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-40"
            >
              {isLoading ? 'Creating...' : 'Create Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
