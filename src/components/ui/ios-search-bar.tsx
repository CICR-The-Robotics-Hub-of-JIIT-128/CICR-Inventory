'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { motionTransitions } from '../../lib/motion-tokens';

export interface IOSSearchBarProps {
  /** Current search input value. */
  value: string;
  /** Text change handler. */
  onChange: (value: string) => void;
  /** Submit handler fired on Enter. */
  onSubmit?: (value: string) => void;
  /** Optional clear handler. */
  onClear?: () => void;
  /** Placeholder text. Default is "Search...". */
  placeholder?: string;
  /** Disables input. */
  disabled?: boolean;
  /** Auto focus on mount. */
  autoFocus?: boolean;
  /** Collapsed default width in pixels or CSS string. Default is '220px'. */
  collapsedWidth?: number | string;
  /** Expanded width in pixels or CSS string. Default is '340px'. */
  expandedWidth?: number | string;
  /** Custom CSS class names. */
  className?: string;
}

export const IOSSearchBar: React.FC<IOSSearchBarProps> = ({
  value,
  onChange,
  onSubmit,
  onClear,
  placeholder = 'Search...',
  disabled = false,
  autoFocus = false,
  collapsedWidth = '220px',
  expandedWidth = '340px',
  className,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClear = () => {
    onChange('');
    if (onClear) onClear();
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSubmit) {
      e.preventDefault();
      onSubmit(value);
    } else if (e.key === 'Escape') {
      inputRef.current?.blur();
    }
  };

  const isExpanded = isFocused || value.length > 0;

  return (
    <motion.div
      animate={{
        width: isExpanded ? expandedWidth : collapsedWidth,
      }}
      transition={motionTransitions.springSmooth}
      className={cn('relative flex items-center group', className)}
    >
      <div
        className={cn(
          'relative w-full flex items-center h-10 px-3.5 rounded-2xl transition-all duration-200',
          isFocused
            ? 'bg-white dark:bg-[#161624] border-2 border-blue-600 dark:border-purple-500 shadow-sm shadow-blue-500/10 dark:shadow-purple-500/20 ring-2 ring-blue-500/10 dark:ring-purple-500/20'
            : 'bg-slate-100/90 dark:bg-[#13131c] border-2 border-slate-200 dark:border-[#222232] hover:border-slate-300 dark:hover:border-[#323248]'
        )}
      >
        <Search
          className={cn(
            'w-4 h-4 shrink-0 transition-colors mr-2.5',
            isFocused
              ? 'text-blue-600 dark:text-purple-400'
              : 'text-slate-400 dark:text-zinc-400 group-hover:text-slate-600 dark:group-hover:text-zinc-300'
          )}
        />

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-w-0 flex-1 bg-transparent text-xs sm:text-[13px] text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder-zinc-500 placeholder:text-xs sm:placeholder:text-[13px] focus:outline-none focus:ring-0 pr-2 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:hidden [&::-webkit-search-results-button]:hidden [&::-webkit-search-results-decoration]:hidden disabled:opacity-40 disabled:cursor-not-allowed font-medium"
        />

        {/* Clear Button */}
        <AnimatePresence>
          {value.length > 0 && (
            <motion.button
              type="button"
              onClick={handleClear}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              aria-label="Clear search"
              className="p-1 rounded-full bg-slate-200/80 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:text-slate-900 hover:bg-slate-300 dark:hover:text-white dark:hover:bg-zinc-700 transition-colors shrink-0 ml-1.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 dark:ring-purple-600 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </motion.button>
          )}
        </AnimatePresence>

      </div>
    </motion.div>
  );
};
