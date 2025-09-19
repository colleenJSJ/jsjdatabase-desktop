'use client';

import { useState, useEffect } from 'react';
import { X, Eye, EyeOff, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background-secondary rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-600/30">
        <div className="flex justify-between items-center p-6 border-b border-gray-600/30">
          <h2 className="text-xl font-semibold text-gray-100">
            {editingPortal ? 'Edit Portal' : 'Add Portal'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <Users className="inline h-4 w-4 mr-1" />
              Associated Children
            </label>
            <div className="space-y-2 border border-gray-600/30 rounded-md p-3 bg-background-primary">
              {children.map((child) => (
                <div key={child.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`portal-child-${child.id}`}
                    checked={formData.children.includes(child.id)}
                    onCheckedChange={(checked) => 
                      handleChildToggle(child.id, checked as boolean)
                    }
                  />
                  <label
                    htmlFor={`portal-child-${child.id}`}
                    className="text-sm font-medium text-gray-300 cursor-pointer"
                  >
                    {child.name}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Portal Name *
            </label>
            <Input
              value={formData.portal_name}
              onChange={(e) => setFormData({ ...formData, portal_name: e.target.value })}
              required
              placeholder="e.g., PowerSchool, Canvas, Google Classroom"
              className="bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Portal URL
            </label>
            <Input
              type="text"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="e.g., canvas.com or https://canvas.com"
              className="bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Username
            </label>
            <Input
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="Username or email"
              className="bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Password
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Password"
                  className="bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
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
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 text-text-primary rounded-md focus:outline-none focus:ring-2 focus:ring-gray-700"
              rows={3}
              placeholder="Additional information..."
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="sync-passwords"
              checked={syncToPasswords}
              onCheckedChange={(checked) => setSyncToPasswords(checked as boolean)}
            />
            <label
              htmlFor="sync-passwords"
              className="text-sm font-medium text-gray-300 cursor-pointer"
            >
              Sync to Passwords page
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-button-create hover:bg-button-create/90 text-white">
              {isSubmitting ? 'Saving...' : editingPortal ? 'Update' : 'Add'} Portal
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}