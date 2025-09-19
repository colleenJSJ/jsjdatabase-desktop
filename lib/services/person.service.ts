import { createClient } from '@/lib/supabase/client';

export interface Person {
  id: string;
  name: string;
  display_name: string;
  email?: string;
  type: 'human' | 'pet';
  role: 'admin' | 'parent' | 'child' | 'member' | 'pet';
  is_active: boolean;
  avatar_url?: string;
}

class PersonService {
  private cache: Map<string, Person> = new Map();
  private nameToIdCache: Map<string, string> = new Map();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._doInitialize();
    await this.initPromise;
    this.initialized = true;
  }

  private async _doInitialize(): Promise<void> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('family_members')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Failed to initialize PersonService:', error);
      throw error;
    }

    if (data) {
      data.forEach(member => {
        const person: Person = {
          id: member.id,
          name: member.name,
          display_name: member.display_name || member.name,
          email: member.email,
          type: member.type || 'human',
          role: member.role || 'member',
          is_active: member.is_active ?? true,
          avatar_url: member.avatar_url
        };
        
        this.cache.set(member.id, person);
        this.nameToIdCache.set(member.name.toLowerCase(), member.id);
        if (member.display_name && member.display_name !== member.name) {
          this.nameToIdCache.set(member.display_name.toLowerCase(), member.id);
        }
      });
    }
  }

  async getPersonById(id: string): Promise<Person | null> {
    await this.initialize();
    return this.cache.get(id) || null;
  }

  async getPersonByName(name: string): Promise<Person | null> {
    await this.initialize();
    const id = this.nameToIdCache.get(name.toLowerCase());
    if (!id) return null;
    return this.cache.get(id) || null;
  }

  async getAllPeople(type?: 'human' | 'pet'): Promise<Person[]> {
    await this.initialize();
    const people = Array.from(this.cache.values());
    
    if (type) {
      return people.filter(p => p.type === type);
    }
    
    return people;
  }

  async getActivePeople(type?: 'human' | 'pet'): Promise<Person[]> {
    await this.initialize();
    const people = Array.from(this.cache.values()).filter(p => p.is_active);
    
    if (type) {
      return people.filter(p => p.type === type);
    }
    
    return people;
  }

  async resolvePersonReference(ref: string | string[] | null | undefined): Promise<string | string[] | null> {
    if (!ref) return null;
    
    await this.initialize();
    
    if (Array.isArray(ref)) {
      const resolved = await Promise.all(
        ref.map(r => this.resolvePersonReference(r))
      );
      return resolved.filter(Boolean) as string[];
    }
    
    // Check if it's already a UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(ref)) {
      // Verify the UUID exists
      if (this.cache.has(ref)) {
        return ref;
      }
      return null;
    }
    
    // Try to resolve as a name
    const id = this.nameToIdCache.get(ref.toLowerCase());
    return id || null;
  }

  async expandPersonReferences(ids: string | string[] | null | undefined): Promise<Person | Person[] | null> {
    if (!ids) return null;
    
    await this.initialize();
    
    if (Array.isArray(ids)) {
      const expanded = await Promise.all(
        ids.map(id => this.getPersonById(id))
      );
      return expanded.filter(Boolean) as Person[];
    }
    
    return this.getPersonById(ids);
  }

  async convertNameToId(name: string): Promise<string | null> {
    const person = await this.getPersonByName(name);
    return person?.id || null;
  }

  async convertIdToName(id: string): Promise<string | null> {
    const person = await this.getPersonById(id);
    return person?.display_name || person?.name || null;
  }

  async convertNamesToIds(names: string[]): Promise<string[]> {
    const ids = await Promise.all(
      names.map(name => this.convertNameToId(name))
    );
    return ids.filter(Boolean) as string[];
  }

  async convertIdsToNames(ids: string[]): Promise<string[]> {
    const names = await Promise.all(
      ids.map(id => this.convertIdToName(id))
    );
    return names.filter(Boolean) as string[];
  }

  clearCache(): void {
    this.cache.clear();
    this.nameToIdCache.clear();
    this.initialized = false;
    this.initPromise = null;
  }

  async refreshCache(): Promise<void> {
    this.clearCache();
    await this.initialize();
  }
}

export const personService = new PersonService();