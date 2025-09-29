import { ReactNode } from 'react';

export type ContactCategory =
  | 'health'
  | 'household'
  | 'pets'
  | 'travel'
  | 'academics'
  | 'j3-academics'
  | 'service'
  | 'other'
  | string;

export type ContactSourceType =
  | 'health'
  | 'household'
  | 'pets'
  | 'travel'
  | 'academics'
  | 'general'
  | 'other'
  | string;

export type ContactFieldKey =
  | 'company'
  | 'emails'
  | 'phones'
  | 'addresses'
  | 'website'
  | 'portal'
  | 'notes'
  | 'tags'
  | 'relatedTo'
  | 'category'
  | 'favorite'
  | 'emergency'
  | 'preferred'
  | 'assignedEntities'
  | 'metadata';

export interface ContactIdentifier {
  id: string;
  label: string;
}

export interface ContactMetadataValue {
  key: string;
  label: string;
  value: string | number | boolean | null;
  icon?: ReactNode;
}

export interface ContactRecord {
  id: string;
  name: string;
  category?: ContactCategory | null;
  contact_type?: string | null;
  contact_subtype?: string | null;
  module?: string | null;
  source_page?: string | null;
  source_type?: ContactSourceType | null;
  source_id?: string | null;
  emails?: string[] | null;
  email?: string | null;
  phones?: string[] | null;
  phone?: string | null;
  addresses?: string[] | null;
  address?: string | null;
  company?: string | null;
  website?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  related_to?: string[] | null;
  pets?: string[] | null;
  trip_id?: string | null;
  assigned_entities?: ContactIdentifier[] | null;
  is_favorite?: boolean | null;
  is_emergency?: boolean | null;
  is_emergency_contact?: boolean | null;
  is_preferred?: boolean | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  portal_url?: string | null;
  portal_username?: string | null;
  portal_password?: string | null;
  business_name?: string | null;
  role?: string | null;
  services_provided?: string[] | null;
  specialties?: string[] | null;
  hours_of_operation?: string | null;
  accepts_emergencies?: boolean | null;
  preferred_for_emergencies?: boolean | null;
  [key: string]: unknown;
}

export interface ContactCardBadge {
  id: string;
  label: string;
  tone?: 'primary' | 'neutral' | 'danger' | 'success' | 'warning';
  icon?: ReactNode;
}

export interface ContactCardActionConfig {
  onEdit?: () => void;
  onDelete?: () => void;
  onCopyAll?: () => void;
  onToggleFavorite?: (next: boolean) => void;
  onOpenDetails?: () => void;
  onEmail?: (email: string) => void;
  onCall?: (phone: string) => void;
}

export interface ContactCardProps {
  contact: ContactRecord;
  canManage?: boolean;
  assignedToLabel?: string | null;
  subtitle?: string | null;
  badges?: ContactCardBadge[];
  meta?: ContactMetadataValue[];
  extraContent?: ReactNode;
  footerContent?: ReactNode;
  actionConfig?: ContactCardActionConfig;
  showFavoriteToggle?: boolean;
  layout?: 'auto' | 'compact';
}

export interface ContactModalFieldVisibility {
  hidden?: boolean;
  required?: boolean;
}

export type ContactModalFieldVisibilityMap = Partial<
  Record<ContactFieldKey, ContactModalFieldVisibility>
>;

export interface ContactModalLabelOverrides {
  nameLabel?: string;
  companyLabel?: string;
  emailsLabel?: string;
  phonesLabel?: string;
  addressesLabel?: string;
  websiteLabel?: string;
  relatedToLabel?: string;
  tagsLabel?: string;
  notesLabel?: string;
  portalLabel?: string;
  categoryLabel?: string;
  favoriteLabel?: string;
  emergencyLabel?: string;
  preferredLabel?: string;
  assignedEntitiesLabel?: string;
}

export interface ContactModalContextDefaults {
  category?: ContactCategory;
  sourceType?: ContactSourceType;
  sourcePage?: string;
  contactType?: string;
  contactSubtype?: string;
  assignedEntityIds?: string[];
  relatedToIds?: string[];
  petIds?: string[];
  tags?: string[];
  isFavorite?: boolean;
  isEmergency?: boolean;
  isPreferred?: boolean;
}

export interface ContactFormValues {
  id?: string;
  name: string;
  company?: string;
  emails: string[];
  phones: string[];
  addresses: string[];
  website?: string;
  notes?: string;
  tags: string[];
  related_to: string[];
  category?: ContactCategory;
  source_type?: ContactSourceType;
  source_page?: string;
  contact_type?: string;
  contact_subtype?: string;
  assigned_entities: string[];
  pets: string[];
  trip_id?: string | null;
  portal_url?: string;
  portal_username?: string;
  portal_password?: string;
  is_favorite?: boolean;
  is_emergency?: boolean;
  is_preferred?: boolean;
  accepted_emergencies?: boolean;
  accepts_emergencies?: boolean;
  preferred_for_emergencies?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ContactModalOptionSelectors {
  categories?: ContactCategory[];
  relatedEntities?: ContactIdentifier[];
  assignedEntities?: ContactIdentifier[];
  tags?: string[];
}

export interface ContactModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  initialValues?: Partial<ContactFormValues>;
  defaults?: ContactModalContextDefaults;
  visibility?: ContactModalFieldVisibilityMap;
  labels?: ContactModalLabelOverrides;
  optionSelectors?: ContactModalOptionSelectors;
  extraSections?: ReactNode;
  renderCustomFields?: (args: {
    values: ContactFormValues;
    setValues: (values: Partial<ContactFormValues> | ((prev: ContactFormValues) => Partial<ContactFormValues>)) => void;
  }) => ReactNode;
  footerContent?: ReactNode;
  busy?: boolean;
  canSubmit?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  onSubmit: (values: ContactFormValues) => Promise<void> | void;
  onCancel: () => void;
}
