'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Smartphone, Mail, Lock } from 'lucide-react';
import Link from 'next/link';
import { isPWA, getDeviceFingerprint } from '@/lib/utils/device-detection';
import { addCSRFToHeaders } from '@/lib/security/csrf-client';

export default function SmartLoginPage() {
  const router = useRouter();
  const [isAppMode, setIsAppMode] = useState(false);
  const [hasPreviousSession, setHasPreviousSession] = useState(false);
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Check if running as PWA
    setIsAppMode(isPWA());
    
    // Check for previous session
    checkPreviousSession();
  }, []);

  const checkPreviousSession = async () => {
    try {
      const response = await fetch('/api/auth/check-session');
      if (response.ok) {
        const data = await response.json();
        if (data.hasSession && data.user) {
          setHasPreviousSession(true);
          setEmail(data.user.email);
        }
      }
    } catch (error) {

    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const deviceId = await getDeviceFingerprint();
      
      const response = await fetch('/api/auth/loginv2', {
        method: 'POST',
        headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ 
          email,
          pin,
          deviceId,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        router.push('/dashboard');
      } else {
        setError(data.error || 'Invalid PIN');
        setPin('');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      setPin('');
    } finally {
      setIsLoading(false);
    }
  };

  // If running as PWA and has previous session, show PIN login
  if (isAppMode && hasPreviousSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-900 to-neutral-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl p-8">
            <div className="flex items-center justify-center mb-8">
              <div className="bg-primary-600 p-3 rounded-full">
                <Smartphone className="h-8 w-8 text-white" />
              </div>
            </div>
            
            <h1 className="text-2xl font-bold text-center text-white mb-2">
              Welcome Back
            </h1>
            <p className="text-center text-neutral-400 mb-8">
              {email}
            </p>

            <form onSubmit={handlePinSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-3 text-center">
                  Enter Your PIN
                </label>
                <div className="flex justify-center space-x-2">
                  {[0, 1, 2, 3, 4].map((index) => (
                    <input
                      key={index}
                      type="text"
                      maxLength={1}
                      value={pin[index] || ''}
                      onChange={(e) => {
                        const newPin = pin.split('');
                        newPin[index] = e.target.value;
                        setPin(newPin.join(''));
                        
                        // Auto-focus next input
                        if (e.target.value && index < 4) {
                          const nextInput = e.target.nextElementSibling as HTMLInputElement;
                          nextInput?.focus();
                        }
                      }}
                      onKeyDown={(e) => {
                        // Handle backspace
                        if (e.key === 'Backspace' && !pin[index] && index > 0) {
                          const prevInput = (e.target as HTMLElement).previousElementSibling as HTMLInputElement;
                          prevInput?.focus();
                        }
                      }}
                      className="w-12 h-12 text-center text-lg font-semibold bg-neutral-700 border border-neutral-600 rounded-md text-white focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    />
                  ))}
                </div>
              </div>

              {error && (
                <div className="text-red-400 text-sm text-center">{error}</div>
              )}

              <button
                type="submit"
                disabled={pin.length !== 5 || isLoading}
                className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 disabled:bg-neutral-600 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </button>

              <div className="text-center">
                <Link
                  href="/auth/login"
                  className="text-sm text-neutral-400 hover:text-white"
                >
                  Use email & password instead
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Default: redirect to appropriate login page
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-8">
          <div className="flex items-center justify-center mb-8">
            <div className="bg-primary-600 p-3 rounded-full">
              <Shield className="h-8 w-8 text-white" />
            </div>
          </div>
          
          <h1 className="text-2xl font-bold text-center text-white mb-8">
            Johnson Family Office
          </h1>

          <div className="space-y-4">
            <Link
              href="/auth/login"
              className="flex items-center gap-3 w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-md transition-colors"
            >
              <Mail className="h-5 w-5" />
              <span>Sign in with Email</span>
            </Link>

            <Link
              href="/login"
              className="flex items-center gap-3 w-full py-3 px-4 bg-neutral-700 hover:bg-neutral-600 text-white font-medium rounded-md transition-colors"
            >
              <Smartphone className="h-5 w-5" />
              <span>Quick PIN Access</span>
            </Link>
          </div>

          <p className="text-center text-sm text-neutral-400 mt-6">
            New user?{' '}
            <Link href="/auth/register" className="text-primary-400 hover:text-primary-300">
              Contact administrator
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
