'use client';

import { useState } from 'react';
import { Lock, AlertCircle } from 'lucide-react';
import { usePasswordSecurity } from '@/contexts/password-security-context';

export function PasswordLockScreen() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const { unlock } = usePasswordSecurity();

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsUnlocking(true);

    const success = await unlock(password);
    
    if (!success) {
      setError('Incorrect password. Please try again.');
      setPassword('');
    }
    
    setIsUnlocking(false);
  };

  return (
    <div className="fixed inset-0 bg-neutral-900/95 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-800 rounded-lg shadow-xl border border-neutral-700 p-8 w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="p-4 bg-yellow-900/20 rounded-full mb-4">
            <Lock className="h-8 w-8 text-yellow-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Session Expired</h2>
          <p className="text-neutral-400">
            Your password vault session has expired for security. Please enter your password to continue.
          </p>
        </div>

        <form onSubmit={handleUnlock} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-neutral-300 mb-1">
              Your Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Enter your password"
              autoFocus
              required
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-800 rounded-md text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isUnlocking || !password}
            className="w-full py-2 px-4 bg-primary-600 hover:bg-primary-700 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-medium rounded-md transition-colors"
          >
            {isUnlocking ? 'Unlocking...' : 'Unlock Vault'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <p className="text-sm text-neutral-500">
            Sessions automatically lock after 10 minutes of inactivity
          </p>
        </div>
      </div>
    </div>
  );
}