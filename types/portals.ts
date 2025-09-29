export type PortalType = 'medical' | 'pet' | 'academic' | 'travel';

export interface PortalRecord {
  id: string;
  portal_type: PortalType;
  portal_name: string | null;
  provider_name?: string | null;
  portal_url: string | null;
  portal_url_domain?: string | null;
  username: string | null;
  password: string | null;
  notes: string | null;
  last_accessed?: string | null;
  patient_ids?: string[] | null;
  entity_id?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  password_id?: string | null;
}
