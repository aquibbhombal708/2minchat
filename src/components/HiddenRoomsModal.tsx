import React, { useState } from 'react';
import { X, Key, ArrowRight, EyeOff } from 'lucide-react';

interface HiddenRoomsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplySecretCode: (secretCode: string) => void;
  currentSecretCode: string;
}

export const HiddenRoomsModal: React.FC<HiddenRoomsModalProps> = ({
  isOpen,
  onClose,
  onApplySecretCode,
  currentSecretCode,
}) => {
  const [code, setCode] = useState(currentSecretCode);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApplySecretCode(code.trim());
    onClose();
  };

  const handleClear = () => {
    setCode('');
    onApplySecretCode('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hidden-title"
        className="w-full max-w-sm bg-white dark:bg-[#121214] border border-black dark:border-white shadow-2xl p-6 relative"
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Key size={14} className="text-black dark:text-white" />
            <h2 id="hidden-title" className="font-mono font-bold text-xs uppercase tracking-wider text-black dark:text-white">
              Hidden Room Key
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

        <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-400 space-y-2">
          <p>
            Hidden rooms are isolated and invisible to standard discovery. Enter your personal secret key to reveal matching rooms.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-[11px] font-mono uppercase text-zinc-600 dark:text-zinc-400 mb-1">
              Secret Access Key
            </label>
            <div className="relative">
              <input
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter secret key..."
                className="w-full h-10 px-3 font-mono text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white focus:border-black dark:focus:border-white pr-9"
                autoFocus
              />
              <EyeOff size={14} className="absolute right-3 top-3 text-zinc-400" />
            </div>
          </div>

          <div className="pt-2 flex gap-2">
            {currentSecretCode && (
              <button
                type="button"
                onClick={handleClear}
                className="w-1/2 py-2 text-xs font-mono border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Clear Key
              </button>
            )}
            <button
              type="submit"
              className={`${
                currentSecretCode ? 'w-1/2' : 'w-full'
              } py-2 text-xs font-mono font-bold bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors flex items-center justify-center gap-1.5`}
            >
              <span>Authenticate Key</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
