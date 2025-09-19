export type UserRole = 'admin' | 'user'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  avatar?: string
  createdAt: Date
  updatedAt: Date
}

export interface Task {
  id: string
  title: string
  description?: string
  category: 'medical' | 'travel' | 'household' | 'personal' | 'administrative' | 'pets'
  priority: 'high' | 'medium' | 'low'
  dueDate?: Date
  assignedTo: string[]
  requireAll: boolean
  completedBy: { userId: string; completedAt: Date }[]
  status: 'pending' | 'partial' | 'complete'
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface CalendarEvent {
  id: string
  title: string
  description?: string
  startTime: Date
  endTime: Date
  location?: string
  attendees: string[]
  category: 'medical' | 'travel' | 'personal' | 'work' | 'family'
  visibility: 'private' | 'family' | 'all'
  createdBy: string
  googleEventId?: string
}

export interface Document {
  id: string
  title: string
  description?: string
  file_name: string
  file_url: string
  file_size: number
  file_type: string
  category: 'legal' | 'financial' | 'medical' | 'education' | 'travel' | 'property' | 'vehicles' | 'personal' | 'work' | 'household' | 'other'
  tags?: string[]
  uploaded_by: string
  created_at: Date
  updated_at: Date
  expiration_date?: Date
  is_archived: boolean
  is_starred?: boolean
  assigned_to?: string[]
  source_page?: 'tasks' | 'travel' | 'health' | 'calendar' | 'j3-academics' | 'pets' | 'household' | 'manual'
  source_id?: string
  source_title?: string
  shared_with?: string[]
  related_to?: string[]
  source_item_id?: string
}

export interface Pet {
  id: string
  name: string
  species: 'dog' | 'cat' | 'other'
  breed?: string
  birthDate?: Date
  weight?: number
  microchipNumber?: string
  notes?: string
}

export interface Trip {
  id: string
  destination: string
  startDate: Date
  endDate: Date
  travelers: string[]
  status: 'planning' | 'booked' | 'ongoing' | 'completed'
  notes?: string
}

export interface InventoryItem {
  id: string
  name: string
  category: 'furniture' | 'art' | 'rug' | 'decorative' | 'antique'
  location: 'unit1' | 'unit2' | 'unit3' | 'home'
  locationDetails?: string
  description?: string
  value?: number
  purchaseDate?: Date
  condition?: string
  photos: string[]
  createdBy: string
  createdAt: Date
}
