/**
 * Empty State Components
 * Provides helpful messages and actions when no data exists
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { 
  FileText, Search, Calendar, Plane, Lock, Heart, 
  Home, PawPrint, GraduationCap, Users, Plus,
  CheckSquare, FolderOpen, AlertCircle, Sparkles
} from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ 
  icon, 
  title, 
  description, 
  action, 
  className 
}: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-12 px-4 text-center',
      className
    )}>
      {icon && (
        <div className="mb-4 p-3 bg-gray-700/30 rounded-full">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-text-primary mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-text-muted max-w-sm mb-6">
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center gap-2 px-4 py-2 bg-button-create hover:bg-button-create/90 text-white rounded-md transition-colors"
        >
          <Plus className="h-4 w-4" />
          {action.label}
        </button>
      )}
    </div>
  );
}

// Preset empty states for common scenarios

export function EmptyTasks({ onCreateTask }: { onCreateTask?: () => void }) {
  return (
    <EmptyState
      icon={<CheckSquare className="h-12 w-12 text-text-muted" />}
      title="No tasks yet"
      description="Create your first task to start organizing your work and tracking progress."
      action={onCreateTask ? {
        label: "Create Task",
        onClick: onCreateTask
      } : undefined}
    />
  );
}

export function EmptyDocuments({ onUpload }: { onUpload?: () => void }) {
  return (
    <EmptyState
      icon={<FolderOpen className="h-12 w-12 text-text-muted" />}
      title="No documents"
      description="Upload important documents to keep them organized and easily accessible."
      action={onUpload ? {
        label: "Upload Document",
        onClick: onUpload
      } : undefined}
    />
  );
}

export function EmptyCalendar({ onCreateEvent }: { onCreateEvent?: () => void }) {
  return (
    <EmptyState
      icon={<Calendar className="h-12 w-12 text-text-muted" />}
      title="No events scheduled"
      description="Your calendar is clear. Add events to keep track of important dates and appointments."
      action={onCreateEvent ? {
        label: "Create Event",
        onClick: onCreateEvent
      } : undefined}
    />
  );
}

export function EmptyTravel({ onAddTrip }: { onAddTrip?: () => void }) {
  return (
    <EmptyState
      icon={<Plane className="h-12 w-12 text-text-muted" />}
      title="No trips planned"
      description="Start planning your next adventure or business trip."
      action={onAddTrip ? {
        label: "Plan Trip",
        onClick: onAddTrip
      } : undefined}
    />
  );
}

export function EmptyPasswords({ onAddPassword }: { onAddPassword?: () => void }) {
  return (
    <EmptyState
      icon={<Lock className="h-12 w-12 text-text-muted" />}
      title="No passwords saved"
      description="Store your passwords securely in one place."
      action={onAddPassword ? {
        label: "Add Password",
        onClick: onAddPassword
      } : undefined}
    />
  );
}

export function EmptyHealth({ onAddRecord }: { onAddRecord?: () => void }) {
  return (
    <EmptyState
      icon={<Heart className="h-12 w-12 text-text-muted" />}
      title="No health records"
      description="Keep track of medical history, appointments, and medications."
      action={onAddRecord ? {
        label: "Add Health Record",
        onClick: onAddRecord
      } : undefined}
    />
  );
}

export function EmptyPets({ onAddPet }: { onAddPet?: () => void }) {
  return (
    <EmptyState
      icon={<PawPrint className="h-12 w-12 text-text-muted" />}
      title="No pets registered"
      description="Add your furry friends to track their health and care."
      action={onAddPet ? {
        label: "Add Pet",
        onClick: onAddPet
      } : undefined}
    />
  );
}

export function EmptyAcademics() {
  return (
    <EmptyState
      icon={<GraduationCap className="h-12 w-12 text-text-muted" />}
      title="No academic records"
      description="Academic information and records will appear here."
    />
  );
}

export function EmptyContacts({ onAddContact }: { onAddContact?: () => void }) {
  return (
    <EmptyState
      icon={<Users className="h-12 w-12 text-text-muted" />}
      title="No contacts"
      description="Add contacts to keep important information handy."
      action={onAddContact ? {
        label: "Add Contact",
        onClick: onAddContact
      } : undefined}
    />
  );
}

export function EmptyHousehold({ onAddProperty }: { onAddProperty?: () => void }) {
  return (
    <EmptyState
      icon={<Home className="h-12 w-12 text-text-muted" />}
      title="No properties"
      description="Add properties to manage household information and maintenance."
      action={onAddProperty ? {
        label: "Add Property",
        onClick: onAddProperty
      } : undefined}
    />
  );
}

// Search-specific empty states

export function NoSearchResults({ 
  searchTerm,
  onClear 
}: { 
  searchTerm: string;
  onClear?: () => void;
}) {
  return (
    <EmptyState
      icon={<Search className="h-12 w-12 text-text-muted" />}
      title="No results found"
      description={`No items match "${searchTerm}". Try adjusting your search or filters.`}
      action={onClear ? {
        label: "Clear Search",
        onClick: onClear
      } : undefined}
    />
  );
}

// Error empty state

export function EmptyError({ 
  onRetry 
}: { 
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      icon={<AlertCircle className="h-12 w-12 text-red-400" />}
      title="Something went wrong"
      description="We couldn't load your data. Please try again."
      action={onRetry ? {
        label: "Retry",
        onClick: onRetry
      } : undefined}
    />
  );
}

// Filter-specific empty state

export function NoFilterResults({ 
  onClearFilters 
}: { 
  onClearFilters?: () => void;
}) {
  return (
    <EmptyState
      icon={<Sparkles className="h-12 w-12 text-text-muted" />}
      title="No matches"
      description="No items match your current filters. Try adjusting or clearing them."
      action={onClearFilters ? {
        label: "Clear Filters",
        onClick: onClearFilters
      } : undefined}
    />
  );
}

// Generic empty state for custom scenarios

export function EmptyCustom({ 
  icon,
  title,
  description,
  actionLabel,
  onAction 
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      action={actionLabel && onAction ? {
        label: actionLabel,
        onClick: onAction
      } : undefined}
    />
  );
}