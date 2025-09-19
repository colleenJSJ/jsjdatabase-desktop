'use client';

import { useState } from 'react';
import { X, Edit2, Phone, Mail, Globe, MapPin, Building2, Shield, Eye, EyeOff, Copy } from 'lucide-react';

interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  company?: string;
  category?: string;
  related_to?: string[];
  source_type?: 'health' | 'household' | 'pets' | 'academics' | 'other';
  notes?: string;
  website?: string;
  portal_url?: string;
  portal_username?: string;
  portal_password?: string;
  is_emergency: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

interface FamilyMember {
  id: string;
  name: string;
}

interface ViewContactModalProps {
  contact: Contact;
  familyMembers: FamilyMember[];
  onEdit: () => void;
  onClose: () => void;
}

export function ViewContactModal({
  contact,
  familyMembers,
  onEdit,
  onClose
}: ViewContactModalProps) {
  const [showPassword, setShowPassword] = useState(false);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Could add a toast notification here
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const getFamilyMemberName = (memberId: string) => {
    const member = familyMembers.find(m => m.id === memberId);
    return member?.name || '';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-secondary rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-600/30">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-text-primary">{contact.name}</h2>
              {contact.company && (
                <p className="text-text-muted mt-1 flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {contact.company}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onEdit}
                className="p-2 text-text-muted hover:text-text-primary hover:bg-background-tertiary rounded transition-colors"
                title="Edit contact"
              >
                <Edit2 className="h-5 w-5" />
              </button>
              <button
                onClick={onClose}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Status Badges */}
          <div className="flex flex-wrap gap-2 mb-6">
            {contact.category && (
              <span className="px-3 py-1 bg-primary-600/20 text-primary-400 rounded-md text-sm font-medium">
                {contact.category}
              </span>
            )}
            {contact.is_emergency && (
              <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-md text-sm font-medium flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Emergency Contact
              </span>
            )}
            {contact.source_type && contact.source_type !== 'other' && (
              <span className="px-3 py-1 bg-gray-700/50 text-text-muted rounded-md text-sm">
                From {contact.source_type}
              </span>
            )}
          </div>

          {/* Contact Information */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-text-muted uppercase tracking-wider mb-3">
                Contact Information
              </h3>
              <div className="space-y-3">
                {contact.email && (
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-text-muted mt-0.5" />
                    <div className="flex-1">
                      <a
                        href={`mailto:${contact.email}`}
                        className="text-text-primary hover:text-primary-400 transition-colors"
                      >
                        {contact.email}
                      </a>
                    </div>
                  </div>
                )}
                {contact.phone && (
                  <div className="flex items-start gap-3">
                    <Phone className="h-5 w-5 text-text-muted mt-0.5" />
                    <div className="flex-1">
                      <a
                        href={`tel:${contact.phone}`}
                        className="text-text-primary hover:text-primary-400 transition-colors"
                      >
                        {contact.phone}
                      </a>
                    </div>
                  </div>
                )}
                {contact.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-text-muted mt-0.5" />
                    <div className="flex-1">
                      <p className="text-text-primary">{contact.address}</p>
                    </div>
                  </div>
                )}
                {contact.website && (
                  <div className="flex items-start gap-3">
                    <Globe className="h-5 w-5 text-text-muted mt-0.5" />
                    <div className="flex-1">
                      <a
                        href={contact.website.startsWith('http') ? contact.website : `https://${contact.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-text-primary hover:text-primary-400 transition-colors"
                      >
                        {contact.website}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Portal Access */}
            {contact.portal_url && (
              <div className="border-t border-gray-600/30 pt-4">
                <h3 className="text-sm font-medium text-text-muted uppercase tracking-wider mb-3">
                  Portal Access
                </h3>
                <div className="space-y-3 bg-background-primary rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <a
                      href={contact.portal_url.startsWith('http') ? contact.portal_url : `https://${contact.portal_url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-400 hover:text-primary-300 font-medium"
                    >
                      Open Portal →
                    </a>
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-text-muted hover:text-text-primary"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {contact.portal_username && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-muted">Username:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-text-primary font-mono">
                          {contact.portal_username}
                        </span>
                        <button
                          onClick={() => copyToClipboard(contact.portal_username!, 'Username')}
                          className="text-text-muted hover:text-text-primary"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                  {contact.portal_password && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-muted">Password:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-text-primary font-mono">
                          {showPassword ? contact.portal_password : '••••••••'}
                        </span>
                        <button
                          onClick={() => copyToClipboard(contact.portal_password!, 'Password')}
                          className="text-text-muted hover:text-text-primary"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Related To */}
            {contact.related_to && contact.related_to.length > 0 && (
              <div className="border-t border-gray-600/30 pt-4">
                <h3 className="text-sm font-medium text-text-muted uppercase tracking-wider mb-3">
                  Related To
                </h3>
                <div className="flex flex-wrap gap-2">
                  {contact.related_to.map(memberId => {
                    const memberName = getFamilyMemberName(memberId);
                    if (!memberName) return null;
                    return (
                      <span
                        key={memberId}
                        className="px-3 py-1 bg-gray-700/50 text-text-primary rounded-md text-sm"
                      >
                        {memberName}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Notes */}
            {contact.notes && (
              <div className="border-t border-gray-600/30 pt-4">
                <h3 className="text-sm font-medium text-text-muted uppercase tracking-wider mb-3">
                  Notes
                </h3>
                <p className="text-text-primary whitespace-pre-wrap">{contact.notes}</p>
              </div>
            )}

            {/* Metadata */}
            <div className="border-t border-gray-600/30 pt-4">
              <div className="flex justify-between text-xs text-text-muted">
                <span>Created: {formatDate(contact.created_at)}</span>
                <span>Updated: {formatDate(contact.updated_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}