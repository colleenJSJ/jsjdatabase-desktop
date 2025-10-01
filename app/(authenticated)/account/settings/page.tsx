'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/contexts/user-context';
import { Shield, Smartphone, Lock, Mail, Trash2, CheckCircle, Palette, Sun, Moon, Eye, EyeOff, User, Clock, ShieldCheck, RefreshCw, Edit2, Save, X, Download } from 'lucide-react';
import { isElectronEnvironment } from '@/lib/is-electron';
import { TrustedDevice } from '@/lib/supabase/types';

export default function AccountSettingsPage() {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'devices' | 'preferences'>('profile');
  const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // PIN change state
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  
  // Profile state
  const [showPassword, setShowPassword] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || ''
  });
  
  // Session and 2FA state
  const [sessionTimeout, setSessionTimeout] = useState('1'); // hours
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [showTwoFactorSetup, setShowTwoFactorSetup] = useState(false);

  // App version and update state (Electron only)
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [updateCheckMessage, setUpdateCheckMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchTrustedDevices();

    // Load theme from localStorage
    const savedTheme = localStorage.getItem('theme') as 'dark' | 'light' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
      document.documentElement.classList.toggle('light', savedTheme === 'light');
    }

    // Load session timeout from localStorage
    const savedTimeout = localStorage.getItem('sessionTimeout') || '1';
    setSessionTimeout(savedTimeout);

    // Update profile form when user data changes
    if (user) {
      setProfileForm({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || ''
      });
    }

    // Get app version if in Electron
    if (isElectronEnvironment() && window.electron?.updates?.getCurrentVersion) {
      window.electron.updates.getCurrentVersion().then((version) => {
        if (version) setAppVersion(version);
      }).catch(() => {});
    }
  }, [user]);

  const fetchTrustedDevices = async () => {
    try {
      const response = await fetch('/api/account/trusted-devices');
      if (response.ok) {
        const data = await response.json();
        setTrustedDevices(data.devices);
      }
    } catch (error) {

    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/account/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (response.ok) {
        setSuccess('Password updated successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update password');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePinChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPin !== confirmPin) {
      setError('New PINs do not match');
      return;
    }

    if (!/^\d{5}$/.test(newPin)) {
      setError('PIN must be exactly 5 digits');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/account/change-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPin, newPin }),
      });

      if (response.ok) {
        setSuccess('PIN updated successfully');
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update PIN');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveDevice = async (deviceId: string) => {
    if (!confirm('Are you sure you want to remove this device?')) return;

    try {
      const response = await fetch(`/api/account/trusted-devices/${deviceId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setTrustedDevices(trustedDevices.filter(d => d.device_id !== deviceId));
        setSuccess('Device removed successfully');
      }
    } catch (error) {

      setError('Failed to remove device');
    }
  };

  const handleThemeChange = (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
    document.documentElement.classList.toggle('light', newTheme === 'light');
    setSuccess(`Theme changed to ${newTheme} mode`);
  };

  const handleCheckForUpdates = async () => {
    if (!isElectronEnvironment() || !window.electron?.updates?.checkForUpdates) {
      return;
    }

    setCheckingForUpdates(true);
    setUpdateCheckMessage(null);

    try {
      const result = await window.electron.updates.checkForUpdates();
      if (result && 'ok' in result) {
        if (result.ok) {
          setUpdateCheckMessage('Checking for updates...');
        } else {
          setUpdateCheckMessage('No updates available. You are on the latest version!');
        }
      }
    } catch (error) {
      setUpdateCheckMessage('Unable to check for updates. Please try again later.');
    } finally {
      setTimeout(() => {
        setCheckingForUpdates(false);
        setTimeout(() => setUpdateCheckMessage(null), 5000);
      }, 1000);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Account Settings</h1>
        <p className="text-neutral-400 mt-1">Manage your security settings and devices</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-neutral-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('profile')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'profile'
                ? 'border-primary-500 text-primary-500'
                : 'border-transparent text-neutral-400 hover:text-white hover:border-neutral-700'
            }`}
          >
            Profile
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'security'
                ? 'border-primary-500 text-primary-500'
                : 'border-transparent text-neutral-400 hover:text-white hover:border-neutral-700'
            }`}
          >
            Security
          </button>
          <button
            onClick={() => setActiveTab('devices')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'devices'
                ? 'border-primary-500 text-primary-500'
                : 'border-transparent text-neutral-400 hover:text-white hover:border-neutral-700'
            }`}
          >
            Trusted Devices
          </button>
          <button
            onClick={() => setActiveTab('preferences')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'preferences'
                ? 'border-primary-500 text-primary-500'
                : 'border-transparent text-neutral-400 hover:text-white hover:border-neutral-700'
            }`}
          >
            Preferences
          </button>
        </nav>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <span className="text-green-500">{success}</span>
        </div>
      )}
      
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <User className="h-5 w-5 text-primary-500" />
              <h2 className="text-lg font-medium text-white">Profile Information</h2>
            </div>
            
            {!isEditingProfile ? (
              <>
                <div className="flex justify-between items-start mb-6">
                  <div>
                    {/* View mode content */}
                  </div>
                  <button
                    onClick={() => setIsEditingProfile(true)}
                    className="p-2 text-neutral-400 hover:text-white transition-colors"
                    title="Edit profile"
                  >
                    <Edit2 className="h-5 w-5" />
                  </button>
                </div>
                <div className="space-y-6">
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-2">
                      NAME
                    </label>
                    <p className="text-white font-medium">{user?.name || 'Not set'}</p>
                  </div>
                  
                  {/* Email/User */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-2">
                      EMAIL
                    </label>
                    <p className="text-white font-medium">{user?.email || 'Not set'}</p>
                  </div>
                  
                  {/* Phone */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-2">
                      PHONE
                    </label>
                    <p className="text-white font-medium">{user?.phone || 'Not set'}</p>
                  </div>
                  
                  {/* Class/Role */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-2">
                      ROLE
                    </label>
                    <p className="text-white font-medium capitalize">
                      {user?.role === 'guest' ? 'Guest (View Only)' : user?.role || 'Member'}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <form onSubmit={async (e) => {
                e.preventDefault();
                setIsLoading(true);
                try {
                  const response = await fetch('/api/account/update-profile', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(profileForm)
                  });
                  if (response.ok) {
                    setSuccess('Profile updated successfully');
                    setIsEditingProfile(false);
                    // Update user context would happen here
                  } else {
                    const data = await response.json();
                    setError(data.error || 'Failed to update profile');
                  }
                } catch (err) {
                  setError('An error occurred. Please try again.');
                } finally {
                  setIsLoading(false);
                }
              }} className="space-y-4">
                <div className="flex justify-end gap-2 mb-4">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="p-2 text-green-400 hover:text-green-300 disabled:opacity-50"
                    title="Save changes"
                  >
                    <Save className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingProfile(false);
                      setProfileForm({
                        name: user?.name || '',
                        email: user?.email || '',
                        phone: user?.phone || ''
                      });
                    }}
                    className="p-2 text-neutral-400 hover:text-white transition-colors"
                    title="Cancel"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-2">
                    NAME
                  </label>
                  <input
                    type="text"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                    className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:border-primary-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-2">
                    EMAIL
                  </label>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                    className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:border-primary-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-2">
                    PHONE
                  </label>
                  <input
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:border-primary-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-2">
                    ROLE
                  </label>
                  <p className="text-white font-medium capitalize bg-neutral-700/50 px-4 py-2 rounded-md">
                    {user?.role === 'guest' ? 'Guest (View Only)' : user?.role || 'Member'}
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">Role cannot be changed here</p>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="space-y-8">
          {/* Session Timeout */}
          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="h-5 w-5 text-primary-500" />
              <h2 className="text-lg font-medium text-white">Session Timeout</h2>
            </div>
            
            <p className="text-sm text-neutral-400 mb-4">
              Automatically log out after a period of inactivity
            </p>
            
            <select
              value={sessionTimeout}
              onChange={(e) => {
                setSessionTimeout(e.target.value);
                localStorage.setItem('sessionTimeout', e.target.value);
                setSuccess('Session timeout updated');
              }}
              className="w-full max-w-xs px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:border-primary-500"
            >
              <option value="1">1 hour</option>
              <option value="24">24 hours</option>
              <option value="48">48 hours</option>
              <option value="168">1 week</option>
              <option value="0">Never</option>
            </select>
          </div>
          
          {/* Two-Factor Authentication */}
          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <ShieldCheck className="h-5 w-5 text-primary-500" />
              <h2 className="text-lg font-medium text-white">Two-Factor Authentication</h2>
            </div>
            
            <p className="text-sm text-neutral-400 mb-4">
              Add an extra layer of security to your account
            </p>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">
                  {twoFactorEnabled ? 'Enabled' : 'Disabled'}
                </p>
                {twoFactorEnabled && (
                  <p className="text-sm text-neutral-400">Your account is protected with 2FA</p>
                )}
              </div>
              
              <button
                onClick={() => {
                  if (twoFactorEnabled) {
                    if (confirm('Are you sure you want to disable two-factor authentication?')) {
                      setTwoFactorEnabled(false);
                      setSuccess('Two-factor authentication disabled');
                    }
                  } else {
                    setShowTwoFactorSetup(true);
                  }
                }}
                className={`px-4 py-2 font-medium rounded-md transition-colors ${
                  twoFactorEnabled 
                    ? 'bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-600/30'
                    : 'bg-primary-600 hover:bg-primary-700 text-white'
                }`}
              >
                {twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}
              </button>
            </div>
            
            {showTwoFactorSetup && !twoFactorEnabled && (
              <div className="mt-6 p-4 bg-neutral-700/50 rounded-lg">
                <p className="text-sm text-neutral-300 mb-4">
                  To enable 2FA, you&apos;ll need to scan a QR code with your authenticator app.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setTwoFactorEnabled(true);
                      setShowTwoFactorSetup(false);
                      setSuccess('Two-factor authentication enabled');
                    }}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-md transition-colors"
                  >
                    Complete Setup
                  </button>
                  <button
                    onClick={() => setShowTwoFactorSetup(false)}
                    className="px-4 py-2 text-neutral-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Change Password */}
          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="h-5 w-5 text-primary-500" />
              <h2 className="text-lg font-medium text-white">Change Password</h2>
            </div>
            
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:border-primary-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:border-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-neutral-600 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
              >
                {isLoading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>

          {/* Change PIN */}
          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <Smartphone className="h-5 w-5 text-primary-500" />
              <h2 className="text-lg font-medium text-white">Change PIN</h2>
            </div>
            
            <form onSubmit={handlePinChange} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Current PIN
                </label>
                <input
                  type="text"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  required
                  maxLength={5}
                  className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white text-center tracking-widest focus:outline-none focus:border-primary-500"
                  placeholder="• • • • •"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    New PIN
                  </label>
                  <input
                    type="text"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    required
                    maxLength={5}
                    className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white text-center tracking-widest focus:outline-none focus:border-primary-500"
                    placeholder="• • • • •"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Confirm New PIN
                  </label>
                  <input
                    type="text"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    required
                    maxLength={5}
                    className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white text-center tracking-widest focus:outline-none focus:border-primary-500"
                    placeholder="• • • • •"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-neutral-600 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
                >
                  {isLoading ? 'Updating...' : 'Update PIN'}
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Are you sure you want to reset your PIN? You will need to set a new one.')) {
                      setCurrentPin('');
                      setNewPin('');
                      setConfirmPin('');
                      setSuccess('PIN reset. Please set a new PIN.');
                    }
                  }}
                  className="px-4 py-2 text-neutral-400 hover:text-white border border-neutral-600 hover:border-neutral-500 rounded-md transition-colors flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reset PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Devices Tab */}
      {activeTab === 'devices' && (
        <div className="space-y-4">
          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <Shield className="h-5 w-5 text-primary-500" />
              <h2 className="text-lg font-medium text-white">Trusted Devices</h2>
            </div>

            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
              </div>
            ) : trustedDevices.length === 0 ? (
              <p className="text-neutral-400 text-center py-8">No trusted devices found</p>
            ) : (
              <div className="space-y-4">
                {trustedDevices.map((device) => (
                  <div
                    key={device.id}
                    className="flex items-center justify-between p-4 bg-neutral-700/50 rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <Smartphone className="h-8 w-8 text-neutral-400" />
                      <div>
                        <p className="font-medium text-white">{device.device_name || 'Unknown Device'}</p>
                        <p className="text-sm text-neutral-400">
                          Last used: {new Date(device.last_used_at).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {device.browser} • {device.os}
                        </p>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleRemoveDevice(device.device_id)}
                      className="p-2 text-neutral-400 hover:text-red-500 transition-colors"
                      title="Remove device"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preferences Tab */}
      {activeTab === 'preferences' && (
        <div className="space-y-8">
          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <Palette className="h-5 w-5 text-primary-500" />
              <h2 className="text-lg font-medium text-white">Theme</h2>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-neutral-400 mb-4">
                Choose your preferred color scheme for the application
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => handleThemeChange('dark')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    theme === 'dark'
                      ? 'border-primary-500 bg-neutral-700'
                      : 'border-neutral-600 bg-neutral-700/50 hover:border-neutral-500'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Moon className="h-6 w-6 text-primary-500" />
                    <div className="text-left">
                      <p className="font-medium text-white">Dark Mode</p>
                      <p className="text-sm text-neutral-400">Current theme - easy on the eyes</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleThemeChange('light')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    theme === 'light'
                      ? 'border-primary-500 bg-neutral-700'
                      : 'border-neutral-600 bg-neutral-700/50 hover:border-neutral-500'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Sun className="h-6 w-6 text-yellow-500" />
                    <div className="text-left">
                      <p className="font-medium text-white">Light Mode</p>
                      <p className="text-sm text-neutral-400">Warm off-whites for bright environments</p>
                    </div>
                  </div>
                </button>
              </div>

              <div className="mt-6 p-4 bg-neutral-700/50 rounded-lg">
                <p className="text-sm text-neutral-400">
                  <span className="font-medium">Note:</span> Theme changes will be applied immediately and saved to your browser.
                </p>
              </div>
            </div>
          </div>

          {/* App Updates Section - Only in Electron */}
          {isElectronEnvironment() && (
            <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-6">
                <Download className="h-5 w-5 text-primary-500" />
                <h2 className="text-lg font-medium text-white">App Updates</h2>
              </div>

              <div className="space-y-4">
                {appVersion && (
                  <div className="flex items-center justify-between p-4 bg-neutral-700/50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-white">Current Version</p>
                      <p className="text-xs text-neutral-400 mt-1 font-mono">{appVersion}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCheckForUpdates}
                    disabled={checkingForUpdates}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-neutral-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    <RefreshCw className={`h-4 w-4 ${checkingForUpdates ? 'animate-spin' : ''}`} />
                    {checkingForUpdates ? 'Checking...' : 'Check for Updates'}
                  </button>

                  {updateCheckMessage && (
                    <p className="text-sm text-neutral-400">{updateCheckMessage}</p>
                  )}
                </div>

                <div className="mt-4 p-4 bg-neutral-700/50 rounded-lg">
                  <p className="text-sm text-neutral-400">
                    <span className="font-medium">Auto-update:</span> The app automatically checks for updates every 6 hours while running. Updates will appear as a banner when available.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}