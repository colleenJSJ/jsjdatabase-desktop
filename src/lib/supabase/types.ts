export type User = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  family_member_id?: string | null;
  phone?: string;
  user_status: 'active' | 'inactive' | 'suspended';
  avatar_url?: string;
  notification_preferences?: Record<string, boolean | string>;
  theme_preference: 'dark' | 'light';
  created_at: string;
  updated_at: string;
};

export type Session = {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  ip_address?: string;
  user_agent?: string;
  device_id?: string;
  remember_me: boolean;
  created_at: string;
  updated_at: string;
};

export type AuditLog = {
  id: string;
  user_id: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
};

export type TaskCategory = 'personal' | 'household' | 'medical' | 'travel' | 'pets' | 'administrative' | 'work' | 'family' | 'documents';
// Align with app-wide usage: active | draft | completed | cancelled
export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'active'
  | 'draft'
  | 'archived'
  | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high';

export type Task = {
  id: string;
  title: string;
  description?: string;
  category: TaskCategory;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: string;
  assigned_to?: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  completed_by?: string;
  pending_at?: string;
  is_pinned?: boolean;
  link?: string;
  assigned_users?: User[];
  created_by_user?: User;
  completed_by_user?: User;
  // Links and documents
  links?: string[];
  document_ids?: string[];
  // Additional fields
  notes?: string;
  attachments?: string[];
  comment_count?: number;
  // Computed property
  is_pending?: boolean;
};

export type TaskAssignment = {
  id: string;
  task_id: string;
  user_id: string;
  assigned_at: string;
};

export type Trip = {
  id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  description?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  participants?: User[];
};

export type TripParticipant = {
  id: string;
  trip_id: string;
  user_id: string;
  added_at: string;
};

export type PasswordCategory = 'financial' | 'household' | 'travel' | 'shopping' | 'social' | 
  'entertainment' | 'medical' | 'education' | 'work' | 'utilities' | 'apps' | 'other';

export type Password = {
  id: string;
  title: string;
  username?: string;
  password: string;
  url?: string;
  category: PasswordCategory;
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  owner_id?: string;
  shared_with?: string[];
  is_favorite?: boolean;
  is_shared?: boolean;
  last_changed?: string;
};

export type TrustedDevice = {
  id: string;
  user_id: string;
  device_id: string;
  device_name?: string;
  device_type?: 'web' | 'mobile-web' | 'pwa';
  browser?: string;
  os?: string;
  last_used_at: string;
  trusted_until: string;
  created_at: string;
};

export type EmailVerificationToken = {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
};

export type PasswordResetToken = {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  used_at?: string;
  created_at: string;
};

export type CalendarEventCategory = 
  | 'administrative' 
  | 'education' 
  | 'family' 
  | 'financial' 
  | 'household' 
  | 'legal' 
  | 'medical' 
  | 'other' 
  | 'personal' 
  | 'pets' 
  | 'school' 
  | 'travel' 
  | 'work';

export type CalendarEvent = {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  category: CalendarEventCategory;
  color?: string;
  location?: string;
  attendees?: string[];
  recurring_pattern?: string;
  google_calendar_id?: string;
  google_sync_enabled?: boolean;
  zoom_link?: string;
  is_virtual?: boolean;
  reminder_minutes?: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  source?: string;
  source_reference?: string;
  google_event_id?: string;
  external_id?: string;
  metadata?: Record<string, any>;
};
