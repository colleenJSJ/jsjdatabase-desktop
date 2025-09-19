'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { addCSRFToHeaders } from '@/lib/security/csrf-client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Trim whitespace
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail) {
      setError('Please enter your email');
      return;
    }
    
    if (!trimmedPassword) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);
    setError('');

    try {

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ 
          email: trimmedEmail, 
          password: trimmedPassword, 
          rememberMe 
        }),
      });

      const data = await response.json();

      if (response.ok) {

        router.push('/dashboard');
      } else {

        setError(data.error || 'Invalid email or password');
        setPassword('');
      }
    } catch (err) {

      setError('An error occurred. Please try again.');
      setPassword('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-background-secondary border border-gray-600/30 rounded-lg shadow-xl p-8">
          <div className="flex items-center justify-center mb-8">
            <div className="bg-gray-700 p-3 rounded-full">
              <Shield className="h-8 w-8 text-text-primary" />
            </div>
          </div>
          
          <h1 className="text-2xl font-bold text-center text-text-primary mb-2">
            Johnson Family Office
          </h1>
          <p className="text-sm text-text-muted text-center mb-8">
            Sign in to your account
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text-muted mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-text-muted" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full pl-10 pr-3 py-3 bg-gray-700 border border-gray-600 rounded-md text-text-primary placeholder-text-muted/50 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400/20"
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text-muted mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-text-muted" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-10 py-3 bg-gray-700 border border-gray-600 rounded-md text-text-primary placeholder-text-muted/50 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400/20"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 bg-gray-700 border-gray-600 rounded text-gray-400 focus:ring-gray-400/20 focus:ring-offset-0"
                />
                <span className="ml-2 text-sm text-text-muted">
                  Remember me for 30 days
                </span>
              </label>
            </div>

            {error && (
              <div className="text-urgent text-sm text-center bg-red-500/10 border border-red-500/20 rounded-md py-2 px-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-text-primary font-medium rounded-md transition-colors flex items-center justify-center"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-text-primary mr-2"></div>
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
