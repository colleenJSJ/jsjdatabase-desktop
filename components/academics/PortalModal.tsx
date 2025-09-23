'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal, ModalBody, ModalCloseButton, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { CredentialFormField } from '@/components/credentials/CredentialFormField';

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
    children: selectedChild !== 'all' ? [selectedChild] : [],
    portal_name: '',
    url: '',
    username: '',
    password: '',
    notes: ''
  });

  const [showPassword, setShowPassword] = useState(false);
  const [syncToPasswords, setSyncToPasswords] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingPortal) {
      setFormData({
        children: editingPortal.children || [],
        portal_name: editingPortal.portal_name || '',
        url: editingPortal.portal_url || editingPortal.url || '',
        username: editingPortal.username || '',
        password: editingPortal.password || '',
        notes: editingPortal.notes || ''
      });
      setSyncToPasswords(false); // Don't auto-sync when editing
    } else {
      setFormData({
        children: selectedChild !== 'all' ? [selectedChild] : [],
        portal_name: '',
        url: '',
        username: '',
        password: '',
        notes: ''
      });
      setSyncToPasswords(true);
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
      
      await onSubmit({ ...formData, url: normalizedUrl, syncToPasswords });
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
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData({ ...formData, password });
  };

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
          <CredentialFormField
            id="portal-children"
            label={<span className="inline-flex items-center gap-2"><Users className="h-4 w-4" /> Associated Children</span>}
            description={children.length === 0 ? 'No children available' : undefined}
          >
            <div className="space-y-2 rounded-md border border-gray-600/30 bg-background-primary p-3">
              {children.map(child => (
                <div key={child.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`portal-child-${child.id}`}
                    checked={formData.children.includes(child.id)}
                    onCheckedChange={checked => handleChildToggle(child.id, Boolean(checked))}
                  />
                  <label
                    htmlFor={`portal-child-${child.id}`}
                    className="cursor-pointer text-sm font-medium text-gray-300"
                  >
                    {child.name}
                  </label>
                </div>
              ))}
            </div>
          </CredentialFormField>

          <CredentialFormField id="portal-name" label="Portal Name" required>
            <Input
              id="portal-name"
              value={formData.portal_name}
              onChange={(e) => setFormData({ ...formData, portal_name: e.target.value })}
              required
              placeholder="e.g., PowerSchool, Canvas, Google Classroom"
              className="bg-background-primary border border-gray-600/30 text-text-primary"
            />
          </CredentialFormField>

          <CredentialFormField id="portal-url" label="Portal URL">
            <Input
              id="portal-url"
              type="text"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="e.g., canvas.com or https://canvas.com"
              className="bg-background-primary border border-gray-600/30 text-text-primary"
            />
          </CredentialFormField>

          <CredentialFormField id="portal-username" label="Username">
            <Input
              id="portal-username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="Username or email"
              className="bg-background-primary border border-gray-600/30 text-text-primary"
            />
          </CredentialFormField>

          <CredentialFormField id="portal-password" label="Password">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="portal-password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Password"
                  className="bg-background-primary border border-gray-600/30 pr-10 text-text-primary"
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
              <Button
                type="button"
                variant="outline"
                onClick={generatePassword}
                className="border-gray-600 text-gray-300 hover:bg-gray-800"
              >
                Generate
              </Button>
            </div>
          </CredentialFormField>

          <CredentialFormField id="portal-notes" label="Notes">
            <textarea
              id="portal-notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full rounded-md border border-gray-600/30 bg-background-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              rows={3}
              placeholder="Additional information..."
            />
          </CredentialFormField>

          <div className="flex items-center gap-2">
            <Checkbox
              id="sync-passwords"
              checked={syncToPasswords}
              onCheckedChange={(checked) => setSyncToPasswords(Boolean(checked))}
            />
            <label htmlFor="sync-passwords" className="cursor-pointer text-sm font-medium text-gray-300">
              Sync to Passwords page
            </label>
          </div>
        </ModalBody>

        <ModalFooter className="gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="border-gray-600 text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} className="bg-button-create text-white hover:bg-button-create/90">
            {isSubmitting ? 'Saving...' : editingPortal ? 'Update' : 'Add'} Portal
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
