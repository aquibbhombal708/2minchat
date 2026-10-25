import React from 'react';
import { ShieldCheck, ArrowRight, X } from 'lucide-react';

interface PostUnlockModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  roomName: string;
}

export const PostUnlockModal: React.FC<PostUnlockModalProps> = ({
  isOpen,
  onDismiss,
  roomName,
}) => {
  if (!isOpen) return null;

  return (
    <div
      onClick={onDismiss}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs cursor-pointer"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unlocked-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-[#121214] border-2 border-black dark:border-white shadow-2xl p-6 relative cursor-default"
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-black dark:text-white" />
            <h2 id="unlocked-title" className="font-mono font-bold text-xs uppercase tracking-wider text-black dark:text-white">
              Security Notice · Room Unlocked
            </h2>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Dismiss"
          >
            <X size={15} />
          </button>
        </div>

        <div className="mt-4 space-y-3 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
          <p className="font-mono font-semibold text-black dark:text-white">
            You have accessed &ldquo;{roomName}&rdquo;.
          </p>

          <ul className="space-y-2 border-l-2 border-black dark:border-white pl-3 font-mono text-[11px]">
            <li>
              • <strong className="text-black dark:text-white">Auto-Lock on Exit:</strong> Leaving this room automatically locks it for this browser. You will be prompted for the 4-digit code again if you return.
            </li>
            <li>
              • <strong className="text-black dark:text-white">Authoritative Lifetime:</strong> Leaving or closing the tab does NOT delete the room. It remains alive until its configured expiration.
            </li>
            <li>
              • <strong className="text-black dark:text-white">View Once Discretion:</strong> Single-view photos, videos, and voice memos cannot be recovered once consumed.
            </li>
          </ul>
        </div>

        <div className="mt-6 pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
          <button
            onClick={onDismiss}
            className="px-5 py-2 text-xs font-mono font-bold bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors flex items-center gap-2"
          >
            <span>Enter Room</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
