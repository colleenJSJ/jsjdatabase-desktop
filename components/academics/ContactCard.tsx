'use client';

import { useState } from 'react';
import { Edit2, Trash2, Mail, Phone, User } from 'lucide-react';

interface ContactCardProps {
  contact: any; // TODO: Add proper type
  children: { id: string; name: string }[];
  onEdit: () => void;
  onDelete: () => void;
  isAdmin: boolean;
}

export function ContactCard({
  contact,
  children,
  onEdit,
  onDelete,
  isAdmin
}: ContactCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const childName = children.find(c => c.id === contact.child_id)?.name || 'Unknown';

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'teacher': return 'bg-blue-600/20 text-blue-400';
      case 'admin': return 'bg-purple-600/20 text-purple-400';
      case 'counselor': return 'bg-green-600/20 text-green-400';
      case 'coach': return 'bg-orange-600/20 text-orange-400';
      case 'tutor': return 'bg-yellow-600/20 text-yellow-400';
      default: return 'bg-gray-600/20 text-gray-400';
    }
  };

  const handleDelete = () => {
    if (showDeleteConfirm) {
      onDelete();
      setShowDeleteConfirm(false);
    } else {
      setShowDeleteConfirm(true);
      setTimeout(() => setShowDeleteConfirm(false), 3000);
    }
  };

  return (
    <div className="bg-background-secondary border border-gray-600/30 rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-medium text-text-primary flex items-center gap-2">
            <User className="h-4 w-4 text-text-muted" />
            {contact.contact_name}
          </h3>
          {contact.role && (
            <p className="text-sm text-text-muted mt-1">{contact.role}</p>
          )}
        </div>
        {isAdmin && (
          <div className="flex gap-1">
            <button
              onClick={onEdit}
              className="text-text-muted hover:text-text-primary transition-colors"
              title="Edit contact"
            >
              <Edit2 className="h-4 w-4" />
            </button>
            <button
              onClick={handleDelete}
              className={`transition-colors ${
                showDeleteConfirm 
                  ? 'text-urgent' 
                  : 'text-text-muted hover:text-urgent'
              }`}
              title={showDeleteConfirm ? 'Click again to confirm' : 'Delete contact'}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getCategoryColor(contact.category || 'other')}`}>
            {contact.category || 'Other'}
          </span>
          <span className="text-xs text-text-muted">
            {childName}
          </span>
        </div>

        {contact.email && (
          <p className="text-sm text-text-muted flex items-center gap-1 mt-2">
            <Mail className="h-3 w-3" />
            {contact.email}
          </p>
        )}

        {contact.phone && (
          <p className="text-sm text-text-muted flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {contact.phone}
          </p>
        )}

        {contact.notes && (
          <p className="text-sm text-text-muted/70 mt-2 italic">
            {contact.notes}
          </p>
        )}
      </div>
    </div>
  );
}