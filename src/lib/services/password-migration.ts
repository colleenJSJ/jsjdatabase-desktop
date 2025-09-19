import { Password } from './password-service-interface';
import { SupabasePasswordService } from './supabase-password-service';

export interface PasswordExport {
  service_name: string;
  username: string;
  password: string;
  url?: string;
  category: string;
  notes?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export class PasswordMigrationService {
  private passwordService: SupabasePasswordService;

  constructor() {
    this.passwordService = new SupabasePasswordService();
  }

  /**
   * Export all passwords to JSON format
   */
  async exportToJSON(userId: string): Promise<PasswordExport[]> {
    const passwords = await this.passwordService.getPasswords(userId);
    
    return passwords.map(password => ({
      service_name: password.service_name,
      username: password.username,
      password: password.password, // Already decrypted by service
      url: password.url,
      category: password.category,
      notes: password.notes,
      tags: password.tags,
      created_at: password.created_at.toISOString(),
      updated_at: password.updated_at.toISOString()
    }));
  }

  /**
   * Export all passwords to CSV format
   */
  async exportToCSV(userId: string): Promise<string> {
    const passwords = await this.passwordService.getPasswords(userId);
    
    // CSV header
    const headers = ['Service', 'Username', 'Password', 'URL', 'Category', 'Notes', 'Tags', 'Created', 'Updated'];
    const csvRows = [headers.join(',')];
    
    // Add password rows
    for (const password of passwords) {
      const row = [
        this.escapeCSV(password.service_name),
        this.escapeCSV(password.username),
        this.escapeCSV(password.password),
        this.escapeCSV(password.url || ''),
        this.escapeCSV(password.category),
        this.escapeCSV(password.notes || ''),
        this.escapeCSV((password.tags || []).join('; ')),
        this.escapeCSV(password.created_at.toISOString()),
        this.escapeCSV(password.updated_at.toISOString())
      ];
      csvRows.push(row.join(','));
    }
    
    return csvRows.join('\n');
  }

  /**
   * Import passwords from 1Password CSV format
   * Expected columns: Title, Username, Password, URL, Notes, Tags, Type
   */
  async importFrom1PasswordCSV(userId: string, csvContent: string): Promise<{ imported: number; failed: number; errors: string[] }> {
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV file is empty or invalid');
    }
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const titleIndex = headers.findIndex(h => h === 'title');
    const usernameIndex = headers.findIndex(h => h === 'username');
    const passwordIndex = headers.findIndex(h => h === 'password');
    const urlIndex = headers.findIndex(h => h === 'url' || h === 'website');
    const notesIndex = headers.findIndex(h => h === 'notes');
    const tagsIndex = headers.findIndex(h => h === 'tags');
    const typeIndex = headers.findIndex(h => h === 'type' || h === 'category');
    
    if (titleIndex === -1 || passwordIndex === -1) {
      throw new Error('CSV must contain at least Title and Password columns');
    }
    
    let imported = 0;
    let failed = 0;
    const errors: string[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = this.parseCSVLine(lines[i]);
        
        const passwordData = {
          service_name: values[titleIndex] || 'Unnamed Service',
          username: usernameIndex !== -1 ? values[usernameIndex] || '' : '',
          password: values[passwordIndex] || '',
          url: urlIndex !== -1 ? values[urlIndex] || undefined : undefined,
          category: this.mapCategoryFrom1Password(typeIndex !== -1 ? values[typeIndex] : 'Login'),
          notes: notesIndex !== -1 ? values[notesIndex] || undefined : undefined,
          tags: tagsIndex !== -1 && values[tagsIndex] ? values[tagsIndex].split(';').map(t => t.trim()) : undefined,
          owner_id: userId,
          is_favorite: false,
          is_shared: false
        };
        
        await this.passwordService.createPassword(passwordData);
        imported++;
      } catch (error) {
        failed++;
        errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    return { imported, failed, errors };
  }

  /**
   * Import passwords from Keeper JSON format
   * Expected structure: { records: [ { title, login, password, login_url, notes, custom_fields } ] }
   */
  async importFromKeeperJSON(userId: string, jsonContent: string): Promise<{ imported: number; failed: number; errors: string[] }> {
    interface KeeperRecord {
      title?: string;
      login?: string;
      password?: string;
      login_url?: string;
      notes?: string;
      type?: string;
      custom_fields?: { tags?: string } | null;
    }

    interface KeeperExport { records: KeeperRecord[] }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonContent);
    } catch {
      throw new Error('Invalid JSON format');
    }

    const data = parsed as Partial<KeeperExport>;
    if (!data || !Array.isArray(data.records)) {
      throw new Error('JSON must contain a "records" array');
    }
    
    let imported = 0;
    let failed = 0;
    const errors: string[] = [];
    
    for (let i = 0; i < data.records.length; i++) {
      const record = data.records[i] as KeeperRecord;
      
      try {
        const passwordData = {
          service_name: record.title || 'Unnamed Service',
          username: record.login || '',
          password: record.password || '',
          url: record.login_url || undefined,
          category: this.mapCategoryFromKeeper(record.type || 'login'),
          notes: record.notes || undefined,
          tags: record.custom_fields?.tags ? record.custom_fields.tags.split(',').map((t) => t.trim()) : undefined,
          owner_id: userId,
          is_favorite: false,
          is_shared: false
        };
        
        await this.passwordService.createPassword(passwordData);
        imported++;
      } catch (error) {
        failed++;
        errors.push(`Record ${i + 1} (${record.title || 'Unnamed'}): ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    return { imported, failed, errors };
  }

  /**
   * Escape CSV values to prevent parsing issues
   */
  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Parse a CSV line handling quoted values
   */
  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    values.push(current);
    return values;
  }

  /**
   * Map 1Password categories to our categories
   */
  private mapCategoryFrom1Password(type: string): string {
    const typeMap: Record<string, string> = {
      'login': 'other',
      'credit card': 'financial',
      'bank account': 'financial',
      'social security number': 'financial',
      'driver license': 'other',
      'passport': 'travel',
      'wireless router': 'household',
      'server': 'work',
      'database': 'work',
      'email account': 'work',
      'membership': 'shopping',
      'reward program': 'shopping',
      'software license': 'apps'
    };
    
    return typeMap[type.toLowerCase()] || 'other';
  }

  /**
   * Map Keeper categories to our categories
   */
  private mapCategoryFromKeeper(type: string): string {
    const typeMap: Record<string, string> = {
      'login': 'other',
      'bank_account': 'financial',
      'credit_card': 'financial',
      'identity': 'other',
      'passport': 'travel',
      'software_license': 'apps',
      'ssh_key': 'work',
      'database': 'work',
      'server': 'work'
    };
    
    return typeMap[type.toLowerCase()] || 'other';
  }
}
