// Priority colors
export const PRIORITY_COLORS = {
  HIGH: '#E4A5A0',
  MEDIUM: '#E5D4A1',
  LOW: '#A8C4D9'
} as const;

// Status colors
export const STATUS_COLORS = {
  PENDING: '#E5D4A1',
  IN_PROGRESS: '#E4A5A0',
  COMPLETED: '#A8C4D9'
} as const;

// Pagination
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100
} as const;

// Time intervals
export const TIME_INTERVALS = {
  DEBOUNCE_MS: 300,
  AUTO_SAVE_MS: 5000,
  SESSION_CHECK_MS: 60000 // 1 minute
} as const;

// Calendar
export const CALENDAR = {
  START_HOUR: 6,
  END_HOUR: 20,
  HOUR_HEIGHT_PX: 60
} as const;

// File upload
export const FILE_UPLOAD = {
  MAX_SIZE_MB: 10,
  MAX_SIZE_BYTES: 10 * 1024 * 1024,
  ALLOWED_TYPES: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png'
  ]
} as const;

// UI
export const UI = {
  MODAL_Z_INDEX: 50,
  TOAST_DURATION_MS: 3000,
  ANIMATION_DURATION_MS: 200
} as const;

// API
export const API = {
  TIMEOUT_MS: 30000,
  RETRY_COUNT: 3,
  RETRY_DELAY_MS: 1000
} as const;