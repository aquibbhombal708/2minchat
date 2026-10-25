import React, { useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { InfoModal } from './InfoModal';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      {/* Information ⓘ button */}
      <button
        onClick={() => setIsInfoOpen(true)}
        title="Application Information & Security Protocol"
        aria-label="Application Information"
        className="w-7 h-7 flex items-center justify-center font-serif text-sm font-semibold border border-black dark:border-white text-black dark:text-white bg-transparent hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
      >
        ⓘ
      </button>

      {/* Theme switcher: Exactly 1 Sun and 1 Moon, never duplicated */}
      <div
        role="group"
        aria-label="Theme Selection"
        className="flex items-center border border-black dark:border-white p-0.5 bg-zinc-100 dark:bg-zinc-900"
      >
        <button
          type="button"
          onClick={() => theme !== 'light' && toggleTheme()}
          className={`w-6 h-6 flex items-center justify-center transition-colors cursor-pointer ${
            theme === 'light'
              ? 'bg-black text-white dark:bg-white dark:text-black'
              : 'text-zinc-400 hover:text-black dark:hover:text-white'
          }`}
          title="Light Mode"
          aria-label="Light Mode"
          aria-pressed={theme === 'light'}
        >
          <Sun size={13} />
        </button>
        <button
          type="button"
          onClick={() => theme !== 'dark' && toggleTheme()}
          className={`w-6 h-6 flex items-center justify-center transition-colors cursor-pointer ${
            theme === 'dark'
              ? 'bg-black text-white dark:bg-white dark:text-black'
              : 'text-zinc-400 hover:text-black dark:hover:text-white'
          }`}
          title="Dark Mode"
          aria-label="Dark Mode"
          aria-pressed={theme === 'dark'}
        >
          <Moon size={13} />
        </button>
      </div>

      <InfoModal isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />
    </div>
  );
};
