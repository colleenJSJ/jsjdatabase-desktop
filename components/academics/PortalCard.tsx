'use client';

import { useState } from 'react';
import { Edit2, Trash2, Eye, EyeOff, Copy, Globe, Lock, KeyRound } from 'lucide-react';

interface PortalCardProps {
  portal: any;
  children: { id: string; name: string }[];
  onEdit: () => void;
  onDelete: () => void;
  isAdmin: boolean;
}

export function PortalCard({
  portal,
  children,
  onEdit,
  onDelete,
  isAdmin
}: PortalCardProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const childName = children.find(c => c.id === portal.child_id)?.name || 'Unknown';

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy:', err);
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

  const updateLastAccessed = async () => {
    try {
      const response = await fetch(`/api/academic-portals/${portal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...portal,
          last_accessed: new Date().toISOString()
        })
      });
      
      if (!response.ok) {
        console.error('Failed to update last accessed');
      }
    } catch (error) {
      console.error('Error updating last accessed:', error);
    }
  };

  return (
    <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-medium text-text-primary flex items-center gap-2">
            <Globe className="h-4 w-4 text-text-muted" />
            {portal.portal_name}
          </h3>
          <p className="text-sm text-text-muted mt-1">{childName}</p>
        </div>
        {isAdmin && (
          <div className="flex gap-1">
            <button
              onClick={onEdit}
              className="text-text-muted hover:text-text-primary transition-colors"
              title="Edit portal"
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
              title={showDeleteConfirm ? 'Click again to confirm' : 'Delete portal'}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {portal.url && (
          <div>
            <a
              href={portal.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={updateLastAccessed}
              className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1 transition-colors"
            >
              <Globe className="h-3 w-3" />
              Open Portal
            </a>
          </div>
        )}

        {(portal.username || portal.password) && (
          <div className="mt-3 p-3 bg-background-primary rounded-md border border-gray-600/30">
            <p className="text-xs text-text-muted mb-2 flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Portal Credentials
            </p>
            {portal.username && (
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-text-primary flex items-center gap-1">
                  <KeyRound className="h-3 w-3" />
                  <span className="font-mono">{portal.username}</span>
                </p>
                <button
                  onClick={() => handleCopy(portal.username)}
                  className="text-text-muted hover:text-text-primary transition-colors"
                  title="Copy username"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            )}
            {portal.password && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-text-primary flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  <span className="font-mono">
                    {showPassword ? portal.password : '••••••••'}
                  </span>
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-text-muted hover:text-text-primary transition-colors"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                  <button
                    onClick={() => handleCopy(portal.password)}
                    className="text-text-muted hover:text-text-primary transition-colors"
                    title="Copy password"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {portal.notes && (
          <p className="text-sm text-text-muted/70 italic mt-2">{portal.notes}</p>
        )}

        {portal.last_accessed && (
          <p className="text-xs text-text-muted mt-3">
            Last accessed: {new Date(portal.last_accessed).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
}
