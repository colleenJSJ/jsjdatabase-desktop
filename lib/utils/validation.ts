/**
 * Comprehensive validation utilities for the Johnson Family Office Database
 */

// Email validation
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Phone validation
export const isValidPhone = (phone: string): boolean => {
  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, '');
  // Check if it's a valid US phone number (10 or 11 digits)
  return cleaned.length === 10 || (cleaned.length === 11 && cleaned[0] === '1');
};

// URL validation
export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Date validation
export const isValidDate = (date: string | Date): boolean => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d instanceof Date && !isNaN(d.getTime());
};

// Future date validation
export const isFutureDate = (date: string | Date): boolean => {
  if (!isValidDate(date)) return false;
  const d = typeof date === 'string' ? new Date(date) : date;
  return d > new Date();
};

// Past date validation
export const isPastDate = (date: string | Date): boolean => {
  if (!isValidDate(date)) return false;
  const d = typeof date === 'string' ? new Date(date) : date;
  return d < new Date();
};

// Date range validation
export const isValidDateRange = (startDate: string | Date, endDate: string | Date): boolean => {
  if (!isValidDate(startDate) || !isValidDate(endDate)) return false;
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  return start <= end;
};

// Currency validation
export const isValidCurrency = (amount: string | number): boolean => {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  return !isNaN(value) && value >= 0;
};

// Password strength validation
export interface PasswordStrength {
  isValid: boolean;
  score: number; // 0-4
  feedback: string[];
}

export const validatePasswordStrength = (password: string): PasswordStrength => {
  const feedback: string[] = [];
  let score = 0;

  if (password.length < 8) {
    feedback.push('Password should be at least 8 characters long');
  } else {
    score++;
  }

  if (!/[a-z]/.test(password)) {
    feedback.push('Add lowercase letters');
  } else {
    score++;
  }

  if (!/[A-Z]/.test(password)) {
    feedback.push('Add uppercase letters');
  } else {
    score++;
  }

  if (!/\d/.test(password)) {
    feedback.push('Add numbers');
  } else {
    score++;
  }

  if (!/[^a-zA-Z\d]/.test(password)) {
    feedback.push('Add special characters');
  } else {
    score++;
  }

  return {
    isValid: score >= 3,
    score: Math.min(score, 4),
    feedback
  };
};

// File validation
export interface FileValidationOptions {
  maxSize?: number; // in bytes
  allowedTypes?: string[]; // MIME types
  allowedExtensions?: string[]; // file extensions
}

export const validateFile = (file: File, options: FileValidationOptions = {}): { isValid: boolean; error?: string } => {
  const { 
    maxSize = 10 * 1024 * 1024, // 10MB default
    allowedTypes = [],
    allowedExtensions = []
  } = options;

  // Check file size
  if (file.size > maxSize) {
    return { 
      isValid: false, 
      error: `File size must be less than ${(maxSize / 1024 / 1024).toFixed(1)}MB` 
    };
  }

  // Check MIME type
  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    return { 
      isValid: false, 
      error: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}` 
    };
  }

  // Check file extension
  if (allowedExtensions.length > 0) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !allowedExtensions.includes(extension)) {
      return { 
        isValid: false, 
        error: `File extension not allowed. Allowed extensions: ${allowedExtensions.join(', ')}` 
      };
    }
  }

  return { isValid: true };
};

// Form validation helper
export interface ValidationRule {
  field: string;
  value: any;
  rules: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    custom?: (value: any) => boolean | string;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export const validateForm = (validations: ValidationRule[]): ValidationResult => {
  const errors: Record<string, string> = {};
  
  for (const validation of validations) {
    const { field, value, rules } = validation;
    
    // Required validation
    if (rules.required && (!value || value === '')) {
      errors[field] = `${field} is required`;
      continue;
    }
    
    // Skip other validations if value is empty and not required
    if (!value && !rules.required) continue;
    
    // Min length validation
    if (rules.minLength && value.length < rules.minLength) {
      errors[field] = `${field} must be at least ${rules.minLength} characters`;
      continue;
    }
    
    // Max length validation
    if (rules.maxLength && value.length > rules.maxLength) {
      errors[field] = `${field} must be at most ${rules.maxLength} characters`;
      continue;
    }
    
    // Pattern validation
    if (rules.pattern && !rules.pattern.test(value)) {
      errors[field] = `${field} format is invalid`;
      continue;
    }
    
    // Custom validation
    if (rules.custom) {
      const result = rules.custom(value);
      if (typeof result === 'string') {
        errors[field] = result;
      } else if (!result) {
        errors[field] = `${field} validation failed`;
      }
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// Sanitization helpers
export const sanitizeEmail = (email: string): string => {
  return email.toLowerCase().trim();
};

export const sanitizePhone = (phone: string): string => {
  // Remove all non-digits and format as US phone
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  } else if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
};

export const sanitizeUrl = (url: string): string => {
  let sanitized = url.trim();
  if (sanitized && !sanitized.match(/^https?:\/\//)) {
    sanitized = `https://${sanitized}`;
  }
  return sanitized;
};

export const sanitizeHtml = (html: string): string => {
  // Basic HTML sanitization - removes script tags and event handlers
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '');
};

// Common validators for specific fields
export const validators = {
  email: (value: string) => isValidEmail(value) || 'Invalid email address',
  phone: (value: string) => isValidPhone(value) || 'Invalid phone number',
  url: (value: string) => isValidUrl(value) || 'Invalid URL',
  futureDate: (value: string) => isFutureDate(value) || 'Date must be in the future',
  pastDate: (value: string) => isPastDate(value) || 'Date must be in the past',
  currency: (value: string | number) => isValidCurrency(value) || 'Invalid amount',
  
  minValue: (min: number) => (value: number) => 
    value >= min || `Value must be at least ${min}`,
  
  maxValue: (max: number) => (value: number) => 
    value <= max || `Value must be at most ${max}`,
  
  between: (min: number, max: number) => (value: number) => 
    (value >= min && value <= max) || `Value must be between ${min} and ${max}`,
  
  oneOf: (options: any[]) => (value: any) => 
    options.includes(value) || `Value must be one of: ${options.join(', ')}`,
};