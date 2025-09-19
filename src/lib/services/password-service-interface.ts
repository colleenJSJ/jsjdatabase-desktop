export enum PasswordStrength {
  WEAK = 'weak',
  FAIR = 'fair',
  STRONG = 'strong',
  EXCELLENT = 'excellent'
}

export interface Password {
  id: string
  service_name: string
  username: string
  password: string
  url?: string
  category: string
  notes?: string
  tags?: string[]
  owner_id: string
  shared_with?: string[]
  is_favorite: boolean
  is_shared: boolean
  last_changed: Date
  strength?: PasswordStrength
  created_at: Date
  updated_at: Date
  source_page?: string | null
}

export interface PasswordInput {
  service_name: string
  username: string
  password: string
  url?: string
  category: string
  notes?: string
  tags?: string[]
  owner_id: string
  shared_with?: string[]
  is_favorite?: boolean
  is_shared?: boolean
}

export interface PasswordUpdate {
  service_name?: string
  username?: string
  password?: string
  url?: string
  category?: string
  notes?: string
  tags?: string[]
  shared_with?: string[]
  is_favorite?: boolean
  is_shared?: boolean
}

export interface PasswordFilter {
  category?: string
  owner_id?: string
  is_shared?: boolean
  is_favorite?: boolean
  search?: string
  strength?: PasswordStrength
}

export interface IPasswordService {
  getPasswords(userId: string, filter?: PasswordFilter): Promise<Password[]>
  getPassword(id: string, userId: string): Promise<Password>
  createPassword(data: PasswordInput): Promise<Password>
  updatePassword(id: string, userId: string, data: PasswordUpdate): Promise<Password>
  deletePassword(id: string, userId: string): Promise<void>
  searchPasswords(userId: string, query: string): Promise<Password[]>
  bulkDelete(ids: string[], userId: string): Promise<void>
  calculatePasswordStrength(password: string): PasswordStrength
}
