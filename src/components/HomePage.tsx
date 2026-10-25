import React, { useState, useEffect } from 'react';
import { Search, Key, Plus, Lock, Clock, ArrowRight, Shield } from 'lucide-react';
import { RoomSearchResult, RoomDetails } from '../types';
import { api } from '../services/api';
import { ThemeToggle } from './ThemeToggle';
import { CreateRoomModal } from './CreateRoomModal';
import { UnlockModal } from './UnlockModal';
import { HiddenRoomsModal } from './HiddenRoomsModal';

interface HomePageProps {
  onRoomSelected: (room: RoomDetails) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onRoomSelected }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [secretCode, setSecretCode] = useState('');
  const [results, setResults] = useState<RoomSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isHiddenModalOpen, setIsHiddenModalOpen] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDirectJoinOpen, setIsDirectJoinOpen] = useState(false);
  const [directRoomId, setDirectRoomId] = useState('');

  // Search query execution
  const performSearch = async () => {
    setIsSearching(true);
    try {
      const data = await api.searchRooms(searchQuery, secretCode || undefined);
      setResults(data);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    performSearch();
  }, [searchQuery, secretCode]);

  const formatExpiry = (expiresAt: number) => {
    const diff = expiresAt - Date.now();
    if (diff <= 0) return 'Expired';
    const hrs = Math.floor(diff / (3600 * 1000));
    const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
    if (hrs > 0) return `${hrs}h ${mins}m remaining`;
    return `${mins}m remaining`;
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-black dark:text-white flex flex-col justify-between selection:bg-black selection:text-white dark:selection:bg-white dark:selection:text-black">
      {/* 1. TOP HEADER */}
      <header className="border-b border-black dark:border-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/logo.svg"
            alt="2MinChat Logo"
            className="w-8 h-8 object-contain dark:invert"
          />
          <span className="font-mono font-black text-lg tracking-tight text-black dark:text-white">
            2MinChat
          </span>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </header>

      {/* 2. MAIN CENTER CONTAINER */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-12 flex flex-col justify-center">
        {/* Brand Document Header */}
        <div className="text-center space-y-3 mb-8">
          <div className="flex justify-center">
            <img
              src="/logo.svg"
              alt="2MinChat Document Logo"
              className="w-14 h-14 object-contain dark:invert"
            />
          </div>
          <h1 className="font-mono font-black text-3xl tracking-tight uppercase">
            2MinChat
          </h1>
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">
            Temporary Private Document Registry
          </p>
        </div>

        {/* SEARCH BAR WITH HIDDEN ROOM KEY ICON */}
        <div className="space-y-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
              <Search size={16} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Room Name or Room ID..."
              className="w-full h-12 pl-10 pr-12 text-xs font-mono bg-zinc-50 dark:bg-zinc-900 border-2 border-black dark:border-white text-black dark:text-white placeholder:text-zinc-400 focus:outline-none"
            />
            {/* KEY ICON FOR HIDDEN ROOMS */}
            <button
              type="button"
              onClick={() => setIsHiddenModalOpen(true)}
              className={`absolute inset-y-0 right-0 pr-3.5 pl-2 flex items-center transition-colors ${
                secretCode
                  ? 'text-black dark:text-white font-bold'
                  : 'text-zinc-400 hover:text-black dark:hover:text-white'
              }`}
              title={secretCode ? 'Secret Key Active (Click to modify)' : 'Enter Secret Key for Hidden Rooms'}
              aria-label="Secret Key for Hidden Rooms"
            >
              <Key size={16} className={secretCode ? 'fill-current' : ''} />
            </button>
          </div>

          {secretCode && (
            <div className="flex items-center justify-between px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-[11px] font-mono">
              <span className="flex items-center gap-1.5">
                <Key size={12} />
                <span>Hidden Room Filter Active</span>
              </span>
              <button
                onClick={() => setSecretCode('')}
                className="underline hover:text-black dark:hover:text-white"
              >
                Clear Key
              </button>
            </div>
          )}

          {/* ACTION BUTTONS: CREATE ROOM & DIRECT JOIN */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => setIsCreateOpen(true)}
              className="py-3 px-4 border-2 border-black dark:border-white bg-black dark:bg-white text-white dark:text-black font-mono font-bold text-xs uppercase tracking-wider hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={15} />
              <span>Create Room</span>
            </button>

            <button
              onClick={() => setIsDirectJoinOpen(true)}
              className="py-3 px-4 border-2 border-black dark:border-white bg-white dark:bg-black text-black dark:text-white font-mono font-bold text-xs uppercase tracking-wider hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors flex items-center justify-center gap-2"
            >
              <Lock size={14} />
              <span>Join With Code</span>
            </button>
          </div>
        </div>

        {/* SEARCH RESULTS LIST */}
        <div className="mt-8 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 pb-1 border-b border-zinc-200 dark:border-zinc-800">
            <span>Discovered Rooms ({results.length})</span>
            {isSearching && <span>Querying...</span>}
          </div>

          {results.length === 0 ? (
            <div className="p-8 border border-zinc-200 dark:border-zinc-800 text-center text-xs font-mono text-zinc-500">
              {searchQuery || secretCode
                ? 'No matching active rooms found.'
                : 'No active rooms currently registered. Create one above.'}
            </div>
          ) : (
            <div className="border border-black dark:border-white divide-y divide-zinc-200 dark:divide-zinc-800">
              {results.map((r) => (
                <div
                  key={r.id}
                  onClick={() => setUnlockTarget({ id: r.id, name: r.name })}
                  className="p-4 flex items-center justify-between hover:bg-zinc-100 dark:hover:bg-zinc-900/60 cursor-pointer transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-black dark:text-white">
                        {r.name}
                      </span>
                      {r.isHidden && (
                        <span className="text-[9px] font-mono uppercase px-1 border border-zinc-400 text-zinc-500">
                          Hidden
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-zinc-500 flex items-center gap-2">
                      <span>ID: {r.id}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        <span>{formatExpiry(r.expiresAt)}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-xs font-mono font-bold text-black dark:text-white">
                    <span>Unlock</span>
                    <ArrowRight size={13} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 3. MINIMAL DOCUMENT FOOTER */}
      <footer className="border-t border-black dark:border-white px-6 py-4 flex items-center justify-between text-[11px] font-mono text-zinc-500">
        <div>2MinChat · Strict Monochrome Cryptographic Chat</div>
        <div>Server-Authoritative Expiration</div>
      </footer>

      {/* CREATE ROOM MODAL */}
      <CreateRoomModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onRoomCreated={(room) => {
          setIsCreateOpen(false);
          onRoomSelected(room);
        }}
      />

      {/* HIDDEN ROOMS SECRET CODE MODAL */}
      <HiddenRoomsModal
        isOpen={isHiddenModalOpen}
        onClose={() => setIsHiddenModalOpen(false)}
        currentSecretCode={secretCode}
        onApplySecretCode={(code) => setSecretCode(code)}
      />

      {/* UNLOCK MODAL */}
      {unlockTarget && (
        <UnlockModal
          roomId={unlockTarget.id}
          roomName={unlockTarget.name}
          isOpen={true}
          onClose={() => setUnlockTarget(null)}
          onUnlocked={(room) => {
            setUnlockTarget(null);
            onRoomSelected(room);
          }}
        />
      )}

      {/* DIRECT JOIN WITH CODE MODAL */}
      {isDirectJoinOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="direct-title"
            className="w-full max-w-sm bg-white dark:bg-[#121214] border border-black dark:border-white shadow-2xl p-6"
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <h2 id="direct-title" className="font-mono font-bold text-xs uppercase tracking-wider text-black dark:text-white">
                Direct Room Access
              </h2>
              <button
                onClick={() => setIsDirectJoinOpen(false)}
                className="text-zinc-500 hover:text-black dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (directRoomId.trim()) {
                  const target = directRoomId.trim();
                  setIsDirectJoinOpen(false);
                  setDirectRoomId('');
                  setUnlockTarget({ id: target, name: target });
                }
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="block text-[11px] font-mono uppercase text-zinc-600 dark:text-zinc-400 mb-1">
                  Room ID
                </label>
                <input
                  type="text"
                  value={directRoomId}
                  onChange={(e) => setDirectRoomId(e.target.value)}
                  placeholder="e.g. room-alpha99"
                  className="w-full h-10 px-3 font-mono text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white"
                  autoFocus
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDirectJoinOpen(false)}
                  className="px-3 py-2 text-xs font-mono border border-zinc-300 dark:border-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-mono font-bold bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white"
                >
                  Proceed to Code
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
