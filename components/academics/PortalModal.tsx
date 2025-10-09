'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, Users } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal, ModalBody, ModalCloseButton, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { CredentialFormField } from '@/components/credentials/CredentialFormField';
import { Slider } from '@/components/ui/slider';
import { smartUrlComplete } from '@/lib/utils/url-helper';
import { getPasswordStrength } from '@/lib/passwords/utils';

interface PortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  editingPortal?: any;
  children: { id: string; name: string }[];
  selectedChild: string;
}

export function PortalModal({
  isOpen,
  onClose,
  onSubmit,
  editingPortal,
  children,
  selectedChild
}: PortalModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    username: '',
    password: '',
    url: '',
    children: selectedChild !== 'all' ? [selectedChild] : [],
    notes: ''
  });

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passwordLength, setPasswordLength] = useState(16);
  const [includeUppercase, setIncludeUppercase] = useState(true);
  const [includeLowercase, setIncludeLowercase] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);

  useEffect(() => {
    if (editingPortal) {
      setFormData({
        title: editingPortal.portal_name || editingPortal.title || '',
        username: editingPortal.username || '',
        password: editingPortal.password || '',
        url: editingPortal.portal_url || editingPortal.url || '',
        children: editingPortal.children || [],
        notes: editingPortal.notes || ''
      });
    } else {
      setFormData({
        title: '',
        username: '',
        password: '',
        url: '',
        children: selectedChild !== 'all' ? [selectedChild] : [],
        notes: ''
      });
    }
  }, [editingPortal, selectedChild]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // Normalize URL if provided
      let normalizedUrl = formData.url;
      if (normalizedUrl && !normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }
      
      await onSubmit({
        title: formData.title,
        username: formData.username,
        password: formData.password,
        url: normalizedUrl,
        children: formData.children,
        notes: formData.notes
      });
      onClose();
    } catch (error) {
      console.error('Error submitting portal:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChildToggle = (childId: string, checked: boolean) => {
    if (checked) {
      setFormData({ ...formData, children: [...formData.children, childId] });
    } else {
      setFormData({ 
        ...formData, 
        children: formData.children.filter(id => id !== childId) 
      });
    }
  };

  const generatePassword = () => {
    let charset = '';
    if (includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (includeNumbers) charset += '0123456789';
    if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (!charset) {
      charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    }

    let password = '';
    for (let i = 0; i < passwordLength; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    setFormData({ ...formData, password });
  };

  const passwordStrength = getPasswordStrength(formData.password || '');

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" ariaLabel="Portal form">
      <form onSubmit={handleSubmit} className="flex flex-col">
        <ModalHeader>
          <div className="flex w-full items-start justify-between gap-4">
            <ModalTitle>{editingPortal ? 'Edit Portal' : 'Add Portal'}</ModalTitle>
            <ModalCloseButton onClose={onClose} />
          </div>
        </ModalHeader>

        <ModalBody className="space-y-5">
          <CredentialFormField id="portal-title" label="Title" required>
            <input
              id="portal-title"
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              placeholder="e.g., Canvas Portal"
              className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white focus:outline-none focus:border-primary-500"
            />
          </CredentialFormField>

          <CredentialFormField id="portal-username" label="Username">
            <input
              id="portal-username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="Username or email"
              className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white focus:outline-none focus:border-primary-500"
            />
          </CredentialFormField>

          <CredentialFormField id="portal-password" label="Password">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  id="portal-password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Password"
                  className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 pr-10 text-white focus:outline-none focus:border-primary-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-300"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button
                type="button"
                onClick={generatePassword}
                className="rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white transition-colors hover:bg-neutral-600"
              >
                Generate
              </button>
            </div>
          </CredentialFormField>

          <div className="space-y-3 rounded-xl border border-neutral-600 bg-neutral-800/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-300">Password Length: {passwordLength}</span>
              <Slider
                value={passwordLength}
                onValueChange={(value) => setPasswordLength(value[0])}
                min={8}
                max={32}
                step={1}
                className="w-32"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={includeUppercase}
                  onCheckedChange={(checked) => setIncludeUppercase(Boolean(checked))}
                />
                <span className="text-sm text-neutral-300">Uppercase</span>
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={includeLowercase}
                  onCheckedChange={(checked) => setIncludeLowercase(Boolean(checked))}
                />
                <span className="text-sm text-neutral-300">Lowercase</span>
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={includeNumbers}
                  onCheckedChange={(checked) => setIncludeNumbers(Boolean(checked))}
                />
                <span className="text-sm text-neutral-300">Numbers</span>
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={includeSymbols}
                  onCheckedChange={(checked) => setIncludeSymbols(Boolean(checked))}
                />
                <span className="text-sm text-neutral-300">Symbols</span>
              </label>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm text-neutral-300">Strength:</span>
                <span
                  className={`text-sm capitalize ${
                    passwordStrength === 'strong'
                      ? 'text-green-500'
                      : passwordStrength === 'medium'
                      ? 'text-yellow-500'
                      : 'text-red-500'
                  }`}
                >
                  {passwordStrength}
                </span>
              </div>
              <div className="h-2 w-full rounded bg-neutral-600">
                <div
                  className={`h-full rounded transition-all ${
                    passwordStrength === 'strong'
                      ? 'w-full bg-green-500'
                      : passwordStrength === 'medium'
                      ? 'w-2/3 bg-yellow-500'
                      : 'w-1/3 bg-red-500'
                  }`}
                />
              </div>
            </div>
          </div>

          <CredentialFormField
            id="portal-url"
            label="URL"
            helperText={formData.url ? `Will be saved as: ${smartUrlComplete(formData.url)}` : undefined}
          >
            <input
              id="portal-url"
              type="text"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="example.com or https://example.com"
              className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white focus:outline-none focus:border-primary-500"
            />
          </CredentialFormField>

          <CredentialFormField
            id="portal-children"
            label={<span className="inline-flex items-center gap-2"><Users className="h-4 w-4" /> Associated Children</span>}
          >
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                {children.map(child => {
                  const isSelected = formData.children.includes(child.id);
                  return (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => handleChildToggle(child.id, !isSelected)}
                      className={`px-3.5 py-1.5 text-sm rounded-full border transition-colors whitespace-nowrap ${
                        isSelected
                          ? 'bg-[#3b4e76] border-[#3b4e76] text-white'
                          : 'bg-[#2a2a2a] border-neutral-600/60 text-neutral-200 hover:border-[#3b4e76]'
                      }`}
                    >
                      {child.name}
                    </button>
                  );
                })}
              </div>
              {children.length === 0 && (
                <p className="text-sm text-neutral-400">No students available.</p>
              )}
            </div>
          </CredentialFormField>

          <CredentialFormField id="portal-notes" label="Notes">
            <textarea
              id="portal-notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white focus:outline-none focus:border-primary-500"
              rows={3}
              placeholder="Additional information..."
            />
          </CredentialFormField>
        </ModalBody>

        <ModalFooter className="gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 rounded-md border border-neutral-600 bg-neutral-700 px-4 py-2 text-white transition-colors hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-70 sm:flex-initial"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 rounded-md bg-button-create px-4 py-2 text-white transition-colors hover:bg-button-create/90 disabled:cursor-not-allowed disabled:bg-neutral-600 sm:flex-initial"
          >
            {isSubmitting ? 'Saving...' : editingPortal ? 'Update' : 'Add'} Portal
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
