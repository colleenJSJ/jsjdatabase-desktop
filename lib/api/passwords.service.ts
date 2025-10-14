/**
 * Passwords API Service
 * Centralized service for all password-related API operations
 */

import ApiClient from './api-client';
import { Password, PasswordCategory } from '@/lib/supabase/types';

export interface PasswordFilters {
  category?: PasswordCategory | 'all';
  owner_id?: string;
  is_shared?: boolean;
  is_favorite?: boolean;
  search?: string;
  strength?: 'weak' | 'medium' | 'strong';
}

export interface CreatePasswordData {
  service_name: string;
  username?: string;
  password: string;
  website_url?: string;
  category: PasswordCategory;
  notes?: string;
  is_shared?: boolean;
  is_favorite?: boolean;
  owner_id?: string;
  tags?: string[];
}

export interface UpdatePasswordData extends Partial<CreatePasswordData> {
  id: string;
}

export interface PasswordsResponse {
  passwords: Password[];
  total: number;
  page?: number;
  limit?: number;
}

class PasswordsService {
  private baseUrl = '/api/passwords';
  
  /**
   * Fetch passwords with filters
   */
  async getPasswords(filters: PasswordFilters = {}): Promise<PasswordsResponse> {
    const response = await ApiClient.get<PasswordsResponse>(this.baseUrl, filters);
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to fetch passwords');
    }
    
    return response.data!;
  }
  
  /**
   * Get a single password by ID
   */
  async getPassword(id: string): Promise<Password> {
    const response = await ApiClient.get<Password>(`${this.baseUrl}/${id}`);
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to fetch password');
    }
    
    return response.data!;
  }
  
  /**
   * Create a new password
   */
  async createPassword(data: CreatePasswordData): Promise<Password> {
    const response = await ApiClient.post<Password>(this.baseUrl, data);
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to create password');
    }
    
    return response.data!;
  }
  
  /**
   * Update an existing password
   */
  async updatePassword(id: string, data: Partial<UpdatePasswordData>): Promise<Password> {
    const response = await ApiClient.put<Password>(`${this.baseUrl}/${id}`, data);
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to update password');
    }
    
    return response.data!;
  }
  
  /**
   * Delete a password
   */
  async deletePassword(id: string): Promise<void> {
    const response = await ApiClient.delete(`${this.baseUrl}/${id}`);
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to delete password');
    }
  }
  
  /**
   * Toggle favorite status
   */
  async toggleFavorite(id: string, isFavorite: boolean): Promise<Password> {
    const response = await ApiClient.patch<Password>(`${this.baseUrl}/${id}`, { 
      is_favorite: isFavorite 
    });
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to update favorite status');
    }
    
    return response.data!;
  }
  
  /**
   * Export passwords (admin only)
   */
  async exportPasswords(): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/export`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to export passwords');
    }
    
    return response.blob();
  }
  
  /**
   * Check password strength
   */
  checkPasswordStrength(password: string): 'weak' | 'medium' | 'strong' {
    if (!password) return 'weak';
    
    const hasLowerCase = /[a-z]/.test(password);
    const hasUpperCase = /[A-Z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const isLongEnough = password.length >= 12;
    
    const criteriaMet = [hasLowerCase, hasUpperCase, hasNumbers, hasSpecialChar, isLongEnough]
      .filter(Boolean).length;
    
    if (criteriaMet >= 4) return 'strong';
    if (criteriaMet >= 3) return 'medium';
    return 'weak';
  }
  
  /**
   * Generate secure password
   */
  generatePassword(options: {
    length?: number;
    uppercase?: boolean;
    lowercase?: boolean;
    numbers?: boolean;
    symbols?: boolean;
  } = {}): string {
    const {
      length = 16,
      uppercase = true,
      lowercase = true,
      numbers = true,
      symbols = true,
    } = options;
    
    let charset = '';
    if (lowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (uppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (numbers) charset += '0123456789';
    if (symbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    if (!charset) {
      charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    }
    
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    return password;
  }
}

// Export singleton instance
export const passwordsService = new PasswordsService();

// Export class for testing
export default PasswordsService;