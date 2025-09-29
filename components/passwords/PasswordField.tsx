'use client';

import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';

interface PasswordFieldProps {
  password: string;
  className?: string;
  showCopyButton?: boolean;
  autoHideDelay?: number;
  onReveal?: () => void;
}

const REVEAL_COOLDOWN = 2000; // 2 seconds between reveals
const AUTO_HIDE_DELAY = 30000; // 30 seconds
const CLIPBOARD_CLEAR_DELAY = 60000; // 60 seconds

export function PasswordField({ 
  password, 
  className = '', 
  showCopyButton = true,
  autoHideDelay = AUTO_HIDE_DELAY,
  onReveal
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canReveal, setCanReveal] = useState(true);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cooldownTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const clipboardTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-hide password after delay
  useEffect(() => {
    if (isVisible && autoHideDelay > 0) {
      hideTimeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, autoHideDelay);
    }

    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [isVisible, autoHideDelay]);

  // Clean up all timeouts on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      if (cooldownTimeoutRef.current) clearTimeout(cooldownTimeoutRef.current);
      if (clipboardTimeoutRef.current) clearTimeout(clipboardTimeoutRef.current);
    };
  }, []);

  const handleToggleVisibility = () => {
    if (!canReveal && !isVisible) return;

    if (!isVisible) {
      setIsVisible(true);
      setCanReveal(false);
      
      if (onReveal) {
        onReveal();
      }

      // Set cooldown for next reveal
      cooldownTimeoutRef.current = setTimeout(() => {
        setCanReveal(true);
      }, REVEAL_COOLDOWN);
    } else {
      setIsVisible(false);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      
      // Clear clipboard after delay
      clipboardTimeoutRef.current = setTimeout(async () => {
        try {
          // Only clear if the clipboard still contains our password
          const currentClipboard = await navigator.clipboard.readText();
          if (currentClipboard === password) {
            await navigator.clipboard.writeText('');
          }
        } catch {
          // Ignore errors - clipboard API might not be available
        }
      }, CLIPBOARD_CLEAR_DELAY);

      // Reset copy indicator
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy password:', error);
    }
  };

  const maskedPassword = '•'.repeat(Math.min(password.length, 12));

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="font-mono text-sm">
        {isVisible ? password : maskedPassword}
      </span>
      
      <div className="flex items-center gap-1">
        <button
          onClick={handleToggleVisibility}
          disabled={!canReveal && !isVisible}
          className={`p-1.5 rounded transition-all ${
            canReveal || isVisible
              ? 'text-neutral-400 hover:text-white hover:bg-neutral-700' 
              : 'text-neutral-600 cursor-not-allowed'
          }`}
          title={isVisible ? 'Hide password' : canReveal ? 'Show password' : 'Please wait...'}
        >
          {isVisible ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>

        {showCopyButton && (
          <button
            onClick={handleCopy}
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded transition-all"
            title="Copy password"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}