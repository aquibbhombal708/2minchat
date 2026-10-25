import React from 'react';
import { X, Shield, Lock, Clock, EyeOff, AlertCircle } from 'lucide-react';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-title"
        className="w-full max-w-lg bg-white dark:bg-[#121214] border border-black dark:border-white shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              Protocol Reference
            </span>
            <span className="text-xs text-zinc-400">·</span>
            <h2 id="info-title" className="font-mono font-bold text-sm tracking-tight text-black dark:text-white">
              2MinChat System Rules
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent hover:border-black dark:hover:border-white transition-colors"
            aria-label="Close Information"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
          <div className="p-3 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
            <div className="flex items-center gap-2 font-mono font-semibold text-black dark:text-white mb-1">
              <Lock size={13} />
              <span>4-Digit Access Code & Auto-Lock</span>
            </div>
            <p>
              Every room requires a strict 4-digit code verified server-side with brute-force rate limiting.
              Leaving a room does not delete it; it automatically locks the room for your session. You must
              enter the code again upon returning.
            </p>
          </div>

          <div className="p-3 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
            <div className="flex items-center gap-2 font-mono font-semibold text-black dark:text-white mb-1">
              <Clock size={13} />
              <span>Server-Authoritative Lifetime</span>
            </div>
            <p>
              Rooms default to 24 hours (or selected 2h, 6h, 12h, 48h). Expiration is enforced by authoritative
              database timestamps. Server restarts, browser closures, or disconnects never reset or shorten room lifetime.
              When expired, all messages and media are permanently purged.
            </p>
          </div>

          <div className="p-3 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
            <div className="flex items-center gap-2 font-mono font-semibold text-black dark:text-white mb-1">
              <EyeOff size={13} />
              <span>View Once & Listen Once Media</span>
            </div>
            <p>
              Senders can never view or replay their own View Once media. Recipients can access it once;
              subsequent attempts are revoked and server storage is permanently deleted.
            </p>
          </div>

          <div className="p-3 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
            <div className="flex items-center gap-2 font-mono font-semibold text-black dark:text-white mb-1">
              <Shield size={13} />
              <span>Server-Side Media Authorization</span>
            </div>
            <p>
              Media files are never exposed through permanent public URLs. Access requires authenticated session
              tokens and active room membership checked on every chunk request.
            </p>
          </div>

          <div className="p-3 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
            <div className="flex items-center gap-2 font-mono font-semibold text-black dark:text-white mb-1">
              <AlertCircle size={13} />
              <span>Screenshot Deterrence Notice</span>
            </div>
            <p>
              Web screenshot prevention utilizes context-menu restrictions, blur protection, and instant token invalidation.
              Web technology cannot guarantee absolute hardware capture prevention; deterrence is best-effort.
            </p>
          </div>
        </div>

        <div className="mt-5 pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-mono font-semibold bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );
};
