'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/user-context';
import { Lock, Smartphone, Shield, Check } from 'lucide-react';
import { UI } from '@/constants';

export default function AccountSetupPage() {
  const router = useRouter();
  const { user, loading } = useUser();
  const [step, setStep] = useState<'password' | 'pin' | 'complete'>('password');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // If user is loaded and has completed setup (has a role), redirect to dashboard
    if (!loading && user && user.role !== 'guest') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/account/setup-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        setStep('pin');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to set password');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }

    if (!/^\d{5}$/.test(pin)) {
      setError('PIN must be exactly 5 digits');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/account/setup-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      if (response.ok) {
        setStep('complete');
        setTimeout(() => {
          router.push('/dashboard');
        }, UI.ANIMATION_DURATION_MS * 10);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to set PIN');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-900 to-neutral-800 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-900 to-neutral-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl p-8">
          {/* Progress Indicator */}
          <div className="flex items-center justify-between mb-8">
            <div className={`flex items-center ${step === 'password' ? 'text-primary-500' : 'text-neutral-500'}`}>
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${
                step === 'password' ? 'border-primary-500 bg-primary-500' : 'border-neutral-500'
              }`}>
                {step === 'complete' || step === 'pin' ? (
                  <Check className="h-4 w-4 text-white" />
                ) : (
                  <span className="text-white text-sm">1</span>
                )}
              </div>
              <span className="ml-2 text-sm">Password</span>
            </div>
            
            <div className="flex-1 h-0.5 bg-neutral-700 mx-4"></div>
            
            <div className={`flex items-center ${step === 'pin' ? 'text-primary-500' : 'text-neutral-500'}`}>
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${
                step === 'pin' ? 'border-primary-500 bg-primary-500' : 'border-neutral-500'
              }`}>
                {step === 'complete' ? (
                  <Check className="h-4 w-4 text-white" />
                ) : (
                  <span className="text-white text-sm">2</span>
                )}
              </div>
              <span className="ml-2 text-sm">PIN</span>
            </div>
          </div>

          {step === 'password' && (
            <>
              <div className="text-center mb-8">
                <Lock className="h-12 w-12 text-primary-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white">Set Your Password</h2>
                <p className="text-neutral-400 mt-2">Create a secure password for your account</p>
              </div>

              <form onSubmit={handlePasswordSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full px-4 py-3 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:border-primary-500"
                    placeholder="••••••••"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full px-4 py-3 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:border-primary-500"
                    placeholder="••••••••"
                  />
                </div>

                {error && (
                  <div className="text-red-400 text-sm">{error}</div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || !password || !confirmPassword}
                  className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 disabled:bg-neutral-600 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
                >
                  {isLoading ? 'Setting password...' : 'Continue'}
                </button>
              </form>
            </>
          )}

          {step === 'pin' && (
            <>
              <div className="text-center mb-8">
                <Smartphone className="h-12 w-12 text-primary-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white">Set Your PIN</h2>
                <p className="text-neutral-400 mt-2">Create a 5-digit PIN for quick mobile access</p>
              </div>

              <form onSubmit={handlePinSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    5-Digit PIN
                  </label>
                  <input
                    type="text"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    required
                    maxLength={5}
                    className="w-full px-4 py-3 bg-neutral-700 border border-neutral-600 rounded-md text-white text-center text-2xl tracking-widest focus:outline-none focus:border-primary-500"
                    placeholder="• • • • •"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Confirm PIN
                  </label>
                  <input
                    type="text"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    required
                    maxLength={5}
                    className="w-full px-4 py-3 bg-neutral-700 border border-neutral-600 rounded-md text-white text-center text-2xl tracking-widest focus:outline-none focus:border-primary-500"
                    placeholder="• • • • •"
                  />
                </div>

                {error && (
                  <div className="text-red-400 text-sm">{error}</div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || pin.length !== 5 || confirmPin.length !== 5}
                  className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 disabled:bg-neutral-600 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
                >
                  {isLoading ? 'Setting PIN...' : 'Complete Setup'}
                </button>
              </form>
            </>
          )}

          {step === 'complete' && (
            <div className="text-center">
              <Shield className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Setup Complete!</h2>
              <p className="text-neutral-400">Redirecting to your dashboard...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}