import React, { useState, useMemo } from 'react';
import {
  X,
  Trash2,
  UserX,
  Clock,
  ShieldAlert,
  Check,
  Plus,
  Minus,
  RotateCcw,
  Sliders,
  Eye,
  EyeOff,
} from 'lucide-react';
import { RoomDetails } from '../types';
import { api } from '../services/api';

interface OwnerSettingsModalProps {
  room: RoomDetails;
  isOpen: boolean;
  onClose: () => void;
  onRoomDeleted: () => void;
  onRoomUpdated: (updated: RoomDetails) => void;
  onlineUserIds: string[];
  onLeaveRoom?: () => void;
}

export const OwnerSettingsModal: React.FC<OwnerSettingsModalProps> = ({
  room,
  isOpen,
  onClose,
  onRoomDeleted,
  onRoomUpdated,
  onlineUserIds,
  onLeaveRoom,
}) => {
  const [activeTab, setActiveTab] = useState<'privacy' | 'expiry' | 'members' | 'danger'>('privacy');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isTogglingBlurInModal, setIsTogglingBlurInModal] = useState(false);

  // Lifetime Adjustment State
  // Mode: 'adjust' (relative +/- change) | 'set_remaining' (direct duration from now)
  const [lifetimeMode, setLifetimeMode] = useState<'adjust' | 'set_remaining'>('adjust');
  const [adjustMinutes, setAdjustMinutes] = useState<number>(60); // default +1 hour
  const [setRemainingMinutes, setSetRemainingMinutes] = useState<number>(120); // default 2 hours
  const [customHoursInput, setCustomHoursInput] = useState<string>('2');

  const [isUpdatingLifetime, setIsUpdatingLifetime] = useState(false);
  const [updateSuccessMessage, setUpdateSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live preview calculation
  const previewData = useMemo(() => {
    const now = Date.now();
    let projectedExpiry = room.expiresAt;

    if (lifetimeMode === 'adjust') {
      projectedExpiry = room.expiresAt + adjustMinutes * 60 * 1000;
    } else {
      projectedExpiry = now + setRemainingMinutes * 60 * 1000;
    }

    // Minimum 2 minutes from now
    if (projectedExpiry <= now + 2 * 60 * 1000) {
      projectedExpiry = now + 2 * 60 * 1000;
    }

    const remainingMs = Math.max(0, projectedExpiry - now);
    const totalMins = Math.floor(remainingMs / (60 * 1000));
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    const days = Math.floor(hrs / 24);
    const remHrs = hrs % 24;

    let formattedRemaining = '';
    if (days > 0) {
      formattedRemaining = `${days}d ${remHrs}h ${mins}m`;
    } else if (hrs > 0) {
      formattedRemaining = `${hrs}h ${mins}m`;
    } else {
      formattedRemaining = `${mins}m`;
    }

    return {
      projectedExpiry,
      formattedRemaining,
      dateString: new Date(projectedExpiry).toLocaleString(),
    };
  }, [room.expiresAt, lifetimeMode, adjustMinutes, setRemainingMinutes]);

  if (!isOpen) return null;

  const handleKick = async (targetUserId: string) => {
    try {
      await api.kickMember(room.id, targetUserId);
      const updated = await api.getRoom(room.id);
      onRoomUpdated(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to kick member');
    }
  };

  const handleApplyLifetime = async () => {
    setIsUpdatingLifetime(true);
    setError(null);
    setUpdateSuccessMessage(null);

    try {
      let updated: RoomDetails;

      if (lifetimeMode === 'adjust') {
        const hours = adjustMinutes / 60;
        updated = await api.updateRoomSettings(room.id, {
          extendHours: hours,
        });
      } else {
        updated = await api.updateRoomSettings(room.id, {
          remainingMinutes: setRemainingMinutes,
        });
      }

      onRoomUpdated(updated);
      setUpdateSuccessMessage('Room timer updated successfully!');
      setTimeout(() => setUpdateSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update room timer');
    } finally {
      setIsUpdatingLifetime(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (deleteConfirmation !== room.id) {
      setError(`Type "${room.id}" to confirm permanent destruction.`);
      return;
    }
    setIsDeleting(true);
    try {
      await api.deleteRoom(room.id);
      onRoomDeleted();
    } catch (err: any) {
      setError(err.message || 'Failed to delete room');
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-title"
        className="w-full max-w-lg bg-white dark:bg-[#121214] border border-black dark:border-white shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
              Settings & Privacy
            </span>
            <span className="text-zinc-400">·</span>
            <h2 id="owner-title" className="font-mono font-bold text-xs uppercase tracking-wider text-black dark:text-white">
              Chat Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        {/* Tab selection */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 mt-3 font-mono text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('privacy')}
            className={`px-3 py-2 border-b-2 font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'privacy'
                ? 'border-black dark:border-white text-black dark:text-white font-bold'
                : 'border-transparent text-zinc-500 hover:text-black dark:hover:text-white'
            }`}
          >
            {(room.blurEnabled ?? true) ? <EyeOff size={12} /> : <Eye size={12} />}
            <span>Blur ON / OFF</span>
          </button>
          <button
            onClick={() => setActiveTab('expiry')}
            className={`px-3 py-2 border-b-2 font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'expiry'
                ? 'border-black dark:border-white text-black dark:text-white'
                : 'border-transparent text-zinc-500 hover:text-black dark:hover:text-white'
            }`}
          >
            <Clock size={12} />
            <span>Room Timer</span>
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`px-3 py-2 border-b-2 font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'members'
                ? 'border-black dark:border-white text-black dark:text-white'
                : 'border-transparent text-zinc-500 hover:text-black dark:hover:text-white'
            }`}
          >
            Members ({room.members?.length || 1})
          </button>
          <button
            onClick={() => setActiveTab('danger')}
            className={`px-3 py-2 border-b-2 font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'danger'
                ? 'border-black dark:border-white text-black dark:text-white'
                : 'border-transparent text-zinc-500 hover:text-black dark:hover:text-white'
            }`}
          >
            {room.isOwner ? 'Destruction' : 'Leave Room'}
          </button>
        </div>

        {error && (
          <div className="mt-3 p-2.5 border border-red-500 bg-red-50 dark:bg-red-950/40 text-xs font-mono text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {updateSuccessMessage && (
          <div className="mt-3 p-2.5 border border-green-500 bg-green-50 dark:bg-green-950/40 text-xs font-mono text-green-700 dark:text-green-300 flex items-center gap-2">
            <Check size={14} />
            <span>{updateSuccessMessage}</span>
          </div>
        )}

        {/* TAB 1: ROOM TIMER (KM / ZYADA / SET EXACT) */}
        {activeTab === 'expiry' && (
          <div className="mt-4 space-y-4">
            {/* Current Expiry Information Card */}
            <div className="p-3 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 text-xs font-mono space-y-1">
              <div className="flex items-center justify-between text-zinc-500 text-[11px]">
                <span>CURRENT EXPIRATION</span>
                <span className="font-bold text-black dark:text-white">
                  {room.expiresAt > Date.now()
                    ? `Active (${Math.max(1, Math.round((room.expiresAt - Date.now()) / (60 * 1000)))} mins left)`
                    : 'Expired'}
                </span>
              </div>
              <p className="text-black dark:text-white font-bold">
                {new Date(room.expiresAt).toLocaleString()}
              </p>
            </div>

            {!room.isOwner ? (
              <div className="p-3 border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-xs font-mono text-zinc-600 dark:text-zinc-400 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-black dark:text-white">
                  <Clock size={14} />
                  <span>Participant Timer Notice</span>
                </div>
                <p>
                  This room will automatically self-destruct once the timer hits zero. Only the room creator can add or reduce time.
                </p>
              </div>
            ) : (
              <>
                {/* Mode Toggle: Quick Adjust (+/-) vs Direct Remaining Duration */}
                <div className="flex border border-zinc-300 dark:border-zinc-700 p-0.5 bg-zinc-100 dark:bg-zinc-900 font-mono text-xs">
              <button
                type="button"
                onClick={() => setLifetimeMode('adjust')}
                className={`flex-1 py-1.5 text-center font-bold transition-colors ${
                  lifetimeMode === 'adjust'
                    ? 'bg-white dark:bg-black text-black dark:text-white shadow-xs border border-zinc-300 dark:border-zinc-700'
                    : 'text-zinc-500 hover:text-black dark:hover:text-white'
                }`}
              >
                + / - Quick Adjust Time
              </button>
              <button
                type="button"
                onClick={() => setLifetimeMode('set_remaining')}
                className={`flex-1 py-1.5 text-center font-bold transition-colors ${
                  lifetimeMode === 'set_remaining'
                    ? 'bg-white dark:bg-black text-black dark:text-white shadow-xs border border-zinc-300 dark:border-zinc-700'
                    : 'text-zinc-500 hover:text-black dark:hover:text-white'
                }`}
              >
                Set Exact Lifetime
              </button>
            </div>

            {/* MODE A: QUICK ADJUST (+/-) */}
            {lifetimeMode === 'adjust' && (
              <div className="space-y-3 font-mono">
                {/* Decrease Time */}
                <div>
                  <label className="block text-[11px] font-bold text-red-600 dark:text-red-400 uppercase mb-1.5 flex items-center gap-1">
                    <Minus size={12} />
                    <span>Decrease Lifetime</span>
                  </label>
                  <div className="grid grid-cols-5 gap-1 text-xs">
                    {[
                      { label: '-15m', mins: -15 },
                      { label: '-30m', mins: -30 },
                      { label: '-1h', mins: -60 },
                      { label: '-2h', mins: -120 },
                      { label: '-6h', mins: -360 },
                    ].map((item) => (
                      <button
                        key={item.mins}
                        type="button"
                        onClick={() => setAdjustMinutes(item.mins)}
                        className={`py-1.5 border text-center font-bold transition-colors ${
                          adjustMinutes === item.mins
                            ? 'border-red-600 bg-red-600 text-white dark:bg-red-500'
                            : 'border-zinc-300 dark:border-zinc-700 hover:border-red-400 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Increase Time */}
                <div>
                  <label className="block text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase mb-1.5 flex items-center gap-1">
                    <Plus size={12} />
                    <span>Extend Lifetime</span>
                  </label>
                  <div className="grid grid-cols-6 gap-1 text-xs">
                    {[
                      { label: '+30m', mins: 30 },
                      { label: '+1h', mins: 60 },
                      { label: '+2h', mins: 120 },
                      { label: '+6h', mins: 360 },
                      { label: '+12h', mins: 720 },
                      { label: '+24h', mins: 1440 },
                    ].map((item) => (
                      <button
                        key={item.mins}
                        type="button"
                        onClick={() => setAdjustMinutes(item.mins)}
                        className={`py-1.5 border text-center font-bold transition-colors ${
                          adjustMinutes === item.mins
                            ? 'border-emerald-600 bg-emerald-600 text-white dark:bg-emerald-500'
                            : 'border-zinc-300 dark:border-zinc-700 hover:border-emerald-400 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* MODE B: SET EXACT REMAINING LIFETIME */}
            {lifetimeMode === 'set_remaining' && (
              <div className="space-y-3 font-mono">
                <div>
                  <label className="block text-[11px] font-bold text-black dark:text-white uppercase mb-1.5 flex items-center gap-1">
                    <Sliders size={12} />
                    <span>Select Remaining Lifetime</span>
                  </label>
                  <div className="grid grid-cols-4 gap-1 text-xs mb-2">
                    {[
                      { label: '15 Mins', mins: 15 },
                      { label: '30 Mins', mins: 30 },
                      { label: '1 Hour', mins: 60 },
                      { label: '2 Hours', mins: 120 },
                      { label: '6 Hours', mins: 360 },
                      { label: '12 Hours', mins: 720 },
                      { label: '24 Hours', mins: 1440 },
                      { label: '48 Hours', mins: 2880 },
                    ].map((item) => (
                      <button
                        key={item.mins}
                        type="button"
                        onClick={() => {
                          setSetRemainingMinutes(item.mins);
                          setCustomHoursInput((item.mins / 60).toString());
                        }}
                        className={`py-1.5 border text-center font-bold transition-colors ${
                          setRemainingMinutes === item.mins
                            ? 'border-black dark:border-white bg-black dark:bg-white text-white dark:text-black'
                            : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-500 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Hours Input */}
                <div className="p-2.5 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-600 dark:text-zinc-400">Custom Hours (e.g. 0.5, 3, 18, 72):</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.5"
                        min="0.1"
                        max="720"
                        value={customHoursInput}
                        onChange={(e) => {
                          const valStr = e.target.value;
                          setCustomHoursInput(valStr);
                          const val = parseFloat(valStr);
                          if (!isNaN(val) && val > 0) {
                            setSetRemainingMinutes(Math.round(val * 60));
                          }
                        }}
                        className="w-16 h-7 text-center font-bold font-mono text-xs bg-white dark:bg-black border border-zinc-300 dark:border-zinc-700 text-black dark:text-white"
                      />
                      <span className="text-[10px] text-zinc-500">hrs</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* LIVE PREVIEW BOX */}
            <div className="p-3 border border-black dark:border-white bg-zinc-100 dark:bg-zinc-900 font-mono text-xs space-y-1">
              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                <span className="uppercase font-bold">Projected New Lifetime</span>
                <span className="text-black dark:text-white font-bold">
                  Remaining: {previewData.formattedRemaining}
                </span>
              </div>
              <p className="font-bold text-black dark:text-white text-sm">
                {previewData.dateString}
              </p>
              <p className="text-[10px] text-zinc-500">
                Connected participants will automatically receive the updated timer in real-time.
              </p>
            </div>

            {/* ACTION BUTTON */}
            <button
              type="button"
              onClick={handleApplyLifetime}
              disabled={isUpdatingLifetime}
              className="w-full py-2.5 text-xs font-mono font-bold bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              {isUpdatingLifetime ? (
                <span>Updating Server...</span>
              ) : (
                <>
                  <Check size={14} />
                  <span>
                    Apply {lifetimeMode === 'adjust' && adjustMinutes < 0 ? 'Decreased Lifetime' : 'Updated Lifetime'}
                  </span>
                </>
              )}
            </button>
              </>
            )}
          </div>
        )}

        {/* TAB 1: BLUR PRIVACY CONTROLS (BLUR ON / OFF) */}
        {activeTab === 'privacy' && (
          <div className="py-4 space-y-4 font-mono text-xs">
            {/* Primary Toggle Card */}
            <div className="p-4 border-2 border-black dark:border-white bg-zinc-50 dark:bg-zinc-900/70 space-y-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 border border-black dark:border-white bg-black dark:bg-white text-white dark:text-black shrink-0">
                      {(room.blurEnabled ?? true) ? <EyeOff size={16} /> : <Eye size={16} />}
                    </span>
                    <span className="font-bold text-sm tracking-tight text-black dark:text-white uppercase">
                      Message Blur Mode
                    </span>
                  </div>
                  <p className="text-zinc-600 dark:text-zinc-400 text-xs leading-relaxed">
                    Protect incoming text, photos, and media from shoulder surfing. Choose whether messages are veiled by default.
                  </p>
                </div>
              </div>

              {/* Real-time Status Badge */}
              <div
                className={`p-3 border flex items-center justify-between text-xs font-bold transition-all ${
                  (room.blurEnabled ?? true)
                    ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black shadow-2xs'
                    : 'border-zinc-300 dark:border-zinc-700 bg-zinc-200/70 dark:bg-zinc-800/70 text-zinc-700 dark:text-zinc-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      (room.blurEnabled ?? true) ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-400'
                    }`}
                  />
                  <span>
                    {(room.blurEnabled ?? true)
                      ? 'CURRENT STATUS: BLUR ON (PROTECTED)'
                      : 'CURRENT STATUS: BLUR OFF (UNBLURRED)'}
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-mono opacity-80">
                  {(room.blurEnabled ?? true) ? 'Hold to reveal' : 'Direct reading'}
                </span>
              </div>

              {/* Blur ON / OFF Segmented Switch */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  Select Chat Blur Option:
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isTogglingBlurInModal}
                    onClick={async () => {
                      if (isTogglingBlurInModal) return;
                      setIsTogglingBlurInModal(true);
                      setError(null);
                      try {
                        const res = await api.toggleRoomBlur(room.id, true);
                        if (res?.room) {
                          onRoomUpdated(res.room);
                        }
                        setUpdateSuccessMessage('Message Blur turned ON for this chat.');
                        setTimeout(() => setUpdateSuccessMessage(null), 3000);
                      } catch (e: any) {
                        setError(e.message || 'Failed to turn blur ON');
                      } finally {
                        setIsTogglingBlurInModal(false);
                      }
                    }}
                    className={`py-3 px-3 border font-mono text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer select-none active:scale-98 ${
                      (room.blurEnabled ?? true)
                        ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black ring-2 ring-black dark:ring-white ring-offset-1 shadow-sm'
                        : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:border-black dark:hover:border-white hover:text-black dark:hover:text-white'
                    }`}
                  >
                    <EyeOff size={14} />
                    <span>Blur ON</span>
                    {(room.blurEnabled ?? true) && <Check size={14} className="ml-1" />}
                  </button>

                  <button
                    type="button"
                    disabled={isTogglingBlurInModal}
                    onClick={async () => {
                      if (isTogglingBlurInModal) return;
                      setIsTogglingBlurInModal(true);
                      setError(null);
                      try {
                        const res = await api.toggleRoomBlur(room.id, false);
                        if (res?.room) {
                          onRoomUpdated(res.room);
                        }
                        setUpdateSuccessMessage('Message Blur turned OFF for this chat.');
                        setTimeout(() => setUpdateSuccessMessage(null), 3000);
                      } catch (e: any) {
                        setError(e.message || 'Failed to turn blur OFF');
                      } finally {
                        setIsTogglingBlurInModal(false);
                      }
                    }}
                    className={`py-3 px-3 border font-mono text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer select-none active:scale-98 ${
                      !(room.blurEnabled ?? true)
                        ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black ring-2 ring-black dark:ring-white ring-offset-1 shadow-sm'
                        : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:border-black dark:hover:border-white hover:text-black dark:hover:text-white'
                    }`}
                  >
                    <Eye size={14} />
                    <span>Blur OFF</span>
                    {!(room.blurEnabled ?? true) && <Check size={14} className="ml-1" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Policy & Guidance */}
            <div className="p-3 border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/40 text-zinc-600 dark:text-zinc-400 text-[11px] space-y-2">
              <p className="font-bold text-black dark:text-white uppercase tracking-wider text-[10px]">
                Chat Blur Policy & Behavior:
              </p>
              <ul className="list-disc list-inside space-y-1.5 text-zinc-600 dark:text-zinc-400">
                <li>
                  <strong className="text-black dark:text-white">Blur ON:</strong> All newly sent messages are shielded with blur. Tap and hold any message bubble to read it.
                </li>
                <li>
                  <strong className="text-black dark:text-white">Blur OFF:</strong> Messages sent during this period appear clear and immediately readable.
                </li>
                <li>
                  <strong className="text-black dark:text-white">Historical Protection:</strong> Previous messages sent with Blur ON will always remain blurred for privacy.
                </li>
                <li>
                  <strong className="text-black dark:text-white">Live Broadcast:</strong> A notification is sent into the room notifying everyone who toggled the blur setting.
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* TAB 2: MEMBERS */}
        {activeTab === 'members' && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-zinc-500 font-mono">
              All individuals currently registered to this room session:
            </p>
            <div className="border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800">
              {(room.members || []).map((m) => {
                const isOnline = onlineUserIds.includes(m.userId);
                return (
                  <div key={m.userId} className="p-3 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isOnline ? 'bg-black dark:bg-white' : 'border border-zinc-400 bg-transparent'
                        }`}
                        title={isOnline ? 'Online' : 'Offline'}
                      />
                      <span className="font-semibold text-black dark:text-white">{m.name}</span>
                      {m.role === 'owner' && (
                        <span className="text-[10px] uppercase px-1 border border-zinc-400 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400">
                          Creator
                        </span>
                      )}
                      {m.isKicked && (
                        <span className="text-[10px] uppercase px-1 border border-black dark:border-white bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                          Kicked
                        </span>
                      )}
                    </div>
                    {m.role !== 'owner' && !m.isKicked && (
                      <button
                        onClick={() => handleKick(m.userId)}
                        className="flex items-center gap-1 px-2 py-1 border border-zinc-300 dark:border-zinc-700 hover:border-black dark:hover:border-white text-[10px] uppercase text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors"
                      >
                        <UserX size={11} />
                        <span>Revoke</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: PERMANENT DESTRUCTION */}
        {activeTab === 'danger' && (
          <div className="mt-4 space-y-4">
            <div className="p-3 border border-black dark:border-white bg-zinc-100 dark:bg-zinc-900 text-xs font-mono space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-black dark:text-white uppercase">
                <ShieldAlert size={14} />
                <span>Immediate Permanent Deletion</span>
              </div>
              <p className="text-zinc-600 dark:text-zinc-300 text-[11px]">
                Deleting this room will immediately wipe all database records, chat messages, and stored media files. All connected users will be disconnected. This action cannot be undone.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-zinc-600 dark:text-zinc-400 mb-1">
                Type <strong className="text-black dark:text-white font-mono">{room.id}</strong> to confirm:
              </label>
              <input
                type="text"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder={room.id}
                className="w-full h-10 px-3 font-mono text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white"
              />
            </div>

            <button
              onClick={handleDeleteRoom}
              disabled={deleteConfirmation !== room.id || isDeleting}
              className="w-full py-2.5 text-xs font-mono font-bold bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-30 flex items-center justify-center gap-2"
            >
              <Trash2 size={13} />
              <span>{isDeleting ? 'Purging Room Dataset...' : 'Permanently Delete Room'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
