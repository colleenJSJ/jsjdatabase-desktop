/**
 * Family member configuration - now using database as source of truth
 * This file provides compatibility layer for legacy code during migration
 * All data comes from the family_members table in the database
 */

import { personService } from '@/lib/services/person.service';

export interface FamilyMember {
  id: string;
  name: string;
  email?: string;
  role?: 'parent' | 'child' | 'pet' | 'admin' | 'member';
  order?: number;
}

// Temporary fallback for components that need synchronous access during migration
// These are the actual UUIDs from the database
export const FAMILY_MEMBERS: FamilyMember[] = [
  // Parents
  { id: 'bf01f873-63e9-4091-b47e-f4d7c5fdf146', name: 'John Johnson', email: 'john@jsjmail.com', role: 'admin', order: 1 },
  { id: '121ccae9-7c2e-4572-bb4f-400b59959542', name: 'Susan Johnson', email: 'susan@jsjmail.com', role: 'parent', order: 2 },
  { id: 'c7eb62c1-80ee-4f49-b569-1ba09bd737c5', name: 'Colleen Russell', email: 'colleen@jsjmail.com', role: 'member', order: 3 },
  { id: '63e51582-0dc1-4918-94d0-e2d455ee27cb', name: 'Kate McLaren', email: 'kate@jsjmail.com', role: 'member', order: 4 },
  
  // Children
  { id: '3343aa54-47e9-44a0-b1ba-b7d0079fc209', name: 'Auggie Johnson', email: 'augie@jsjmail.com', role: 'child', order: 5 },
  { id: 'c22bc2b5-7a5c-4175-b997-29e873bf4328', name: 'Blossom Johnson', email: 'blossom@jsjmail.com', role: 'child', order: 6 },
  { id: 'ee08648e-23b4-40dc-ab08-fc9971859ce1', name: 'Claire Johnson', email: 'claire@jsjmail.com', role: 'child', order: 7 },
  
  // Pets
  { id: '3b6a5095-9659-4d69-b2fc-208a32f53990', name: 'Jack Johnson', role: 'pet', order: 8 },
  { id: 'a81eee10-3180-4e0c-ba0d-b91f5f5956f7', name: 'Daisy Johnson', role: 'pet', order: 9 },
  { id: 'dbbe6bfe-da00-47e6-96b2-674ee4b0bd26', name: 'Kiki Johnson', role: 'pet', order: 10 },
];

// Synchronous helper functions using the fallback data
export const getFamilyMemberById = (id: string): FamilyMember | undefined => {
  return FAMILY_MEMBERS.find(member => member.id === id);
};

export const getFamilyMemberByName = (name: string): FamilyMember | undefined => {
  return FAMILY_MEMBERS.find(member => 
    member.name.toLowerCase() === name.toLowerCase()
  );
};

export const getHumanFamilyMembers = (): FamilyMember[] => {
  return FAMILY_MEMBERS.filter(member => member.role !== 'pet');
};

export const getPetFamilyMembers = (): FamilyMember[] => {
  return FAMILY_MEMBERS.filter(member => member.role === 'pet');
};

export const getParents = (): FamilyMember[] => {
  return FAMILY_MEMBERS.filter(member => member.role === 'parent' || member.role === 'admin');
};

export const getChildren = (): FamilyMember[] => {
  return FAMILY_MEMBERS.filter(member => member.role === 'child');
};

// Async helper functions that use PersonService
export const getFamilyMemberByIdAsync = async (id: string): Promise<FamilyMember | undefined> => {
  const person = await personService.getPersonById(id);
  if (!person) return undefined;
  
  return {
    id: person.id,
    name: person.name,
    email: person.email,
    role: mapRole(person.role),
    order: getOrder(person.name)
  };
};

export const getFamilyMemberByNameAsync = async (name: string): Promise<FamilyMember | undefined> => {
  const person = await personService.getPersonByName(name);
  if (!person) return undefined;
  
  return {
    id: person.id,
    name: person.name,
    email: person.email,
    role: mapRole(person.role),
    order: getOrder(person.name)
  };
};

export const getHumanFamilyMembersAsync = async (): Promise<FamilyMember[]> => {
  const people = await personService.getActivePeople('human');
  return people.map(p => ({
    id: p.id,
    name: p.name,
    email: p.email,
    role: mapRole(p.role),
    order: getOrder(p.name)
  }));
};

export const getPetFamilyMembersAsync = async (): Promise<FamilyMember[]> => {
  const pets = await personService.getActivePeople('pet');
  return pets.map(p => ({
    id: p.id,
    name: p.name,
    email: p.email,
    role: 'pet' as const,
    order: getOrder(p.name)
  }));
};

export const getParentsAsync = async (): Promise<FamilyMember[]> => {
  const people = await personService.getActivePeople('human');
  return people
    .filter(p => p.role === 'parent' || p.role === 'admin')
    .map(p => ({
      id: p.id,
      name: p.name,
      email: p.email,
      role: 'parent' as const,
      order: getOrder(p.name)
    }));
};

export const getChildrenAsync = async (): Promise<FamilyMember[]> => {
  const people = await personService.getActivePeople('human');
  return people
    .filter(p => p.role === 'child')
    .map(p => ({
      id: p.id,
      name: p.name,
      email: p.email,
      role: 'child' as const,
      order: getOrder(p.name)
    }));
};

// Synchronous options for immediate use
export const FAMILY_MEMBER_OPTIONS = [
  { value: 'all', label: 'All Family Members' },
  ...FAMILY_MEMBERS.map(member => ({
    value: member.id,
    label: member.name
  }))
];

// For dropdown/select components (async version)
export const getFamilyMemberOptions = async () => {
  const people = await personService.getActivePeople();
  return [
    { value: 'all', label: 'All Family Members' },
    ...people.map(person => ({
      value: person.id,
      label: person.display_name || person.name
    }))
  ];
};

// Synchronous name options for immediate use
export const FAMILY_MEMBER_NAME_OPTIONS = [
  { value: 'all', label: 'All' },
  ...FAMILY_MEMBERS.map(member => ({
    value: member.name.toLowerCase().replace(' ', '_'),
    label: member.name
  }))
];

// For documents and other modules that need name-based options (async version)
export const getFamilyMemberNameOptions = async () => {
  const people = await personService.getActivePeople();
  return [
    { value: 'all', label: 'All' },
    ...people.map(person => ({
      value: person.name.toLowerCase().replace(' ', '_'),
      label: person.display_name || person.name
    }))
  ];
};

// Legacy ID mapping for backward compatibility
export const LEGACY_ID_MAP: Record<string, string> = {
  'john-id': 'bf01f873-63e9-4091-b47e-f4d7c5fdf146',
  'susan-id': '121ccae9-7c2e-4572-bb4f-400b59959542',
  'colleen-id': 'c7eb62c1-80ee-4f49-b569-1ba09bd737c5',
  'kate-id': '63e51582-0dc1-4918-94d0-e2d455ee27cb',
  'auggie-id': '3343aa54-47e9-44a0-b1ba-b7d0079fc209',
  'blossom-id': 'c22bc2b5-7a5c-4175-b997-29e873bf4328',
  'claire-id': 'ee08648e-23b4-40dc-ab08-fc9971859ce1',
  'john': 'bf01f873-63e9-4091-b47e-f4d7c5fdf146',
  'susan': '121ccae9-7c2e-4572-bb4f-400b59959542',
  'colleen': 'c7eb62c1-80ee-4f49-b569-1ba09bd737c5',
  'kate': '63e51582-0dc1-4918-94d0-e2d455ee27cb',
  'auggie': '3343aa54-47e9-44a0-b1ba-b7d0079fc209',
  'blossom': 'c22bc2b5-7a5c-4175-b997-29e873bf4328',
  'claire': 'ee08648e-23b4-40dc-ab08-fc9971859ce1'
};

// Map for auto-sync document assignment (for backwards compatibility)
export const FAMILY_NAME_MAP: Record<string, string> = {
  'colleen': 'Colleen Russell',
  'kate': 'Kate McLaren',
  'john': 'John Johnson',
  'susan': 'Susan Johnson',
  'auggie': 'Auggie Johnson',
  'blossom': 'Blossom Johnson',
  'claire': 'Claire Johnson',
  'jack': 'Jack Johnson',
  'daisy': 'Daisy Johnson',
  'kiki': 'Kiki Johnson'
};

// Synchronous normalization using legacy map
export const normalizeFamilyMemberId = (id: string): string => {
  return LEGACY_ID_MAP[id] || LEGACY_ID_MAP[id.toLowerCase()] || id;
};

// Async normalization using PersonService
export const normalizeFamilyMemberIdAsync = async (id: string): Promise<string> => {
  // Try to resolve the reference to a UUID
  const resolved = await personService.resolvePersonReference(id);
  return (resolved && typeof resolved === 'string') ? resolved : id;
};

// Synchronous mapping
export const mapIdsToNames = (ids: string[]): string[] => {
  return ids.map(id => {
    const normalizedId = normalizeFamilyMemberId(id);
    const member = getFamilyMemberById(normalizedId);
    return member?.name || FAMILY_NAME_MAP[id.toLowerCase()] || id;
  });
};

// Async mapping
export const mapIdsToNamesAsync = async (ids: string[]): Promise<string[]> => {
  const names = await personService.convertIdsToNames(ids);
  return names;
};

// Synchronous processRelatedTo for backward compatibility
export const processRelatedTo = (tags: string[]): {
  assignedTo: string[];
  otherTags: string[];
} => {
  const assignedTo: string[] = [];
  const otherTags: string[] = [];
  
  tags.forEach(tag => {
    if (tag === 'all') {
      // Add all family member names
      assignedTo.push(...FAMILY_MEMBERS.map(m => m.name));
    } else if (FAMILY_NAME_MAP[tag.toLowerCase()]) {
      // It's a family member short name
      assignedTo.push(FAMILY_NAME_MAP[tag.toLowerCase()]);
    } else if (getFamilyMemberByName(tag)) {
      // It's a full name
      assignedTo.push(tag);
    } else {
      // It's a custom tag
      otherTags.push(tag);
    }
  });
  
  // Remove duplicates
  const uniqueAssignedTo = [...new Set(assignedTo)];
  
  return {
    assignedTo: uniqueAssignedTo,
    otherTags
  };
};

// Async processRelatedTo
export const processRelatedToAsync = async (tags: string[]): Promise<{
  assignedTo: string[];
  otherTags: string[];
}> => {
  const assignedToIds: string[] = [];
  const otherTags: string[] = [];
  
  for (const tag of tags) {
    if (tag === 'all') {
      // Add all family member IDs
      const allPeople = await personService.getActivePeople();
      assignedToIds.push(...allPeople.map(p => p.id));
    } else {
      // Try to resolve as a person reference
      const personId = await personService.resolvePersonReference(tag);
      if (personId && typeof personId === 'string') {
        assignedToIds.push(personId);
      } else {
        // It's a custom tag
        otherTags.push(tag);
      }
    }
  }
  
  // Remove duplicates
  const uniqueAssignedTo = [...new Set(assignedToIds)];
  
  return {
    assignedTo: uniqueAssignedTo,
    otherTags
  };
};

// Helper functions
function mapRole(role: string): 'parent' | 'child' | 'pet' | 'admin' | 'member' {
  switch (role) {
    case 'admin':
    case 'parent':
      return 'parent';
    case 'child':
      return 'child';
    case 'pet':
      return 'pet';
    default:
      return 'member';
  }
}

function getOrder(name: string): number {
  // Define order based on name for backwards compatibility
  const orderMap: Record<string, number> = {
    'John Johnson': 1,
    'Susan Johnson': 2,
    'Colleen Russell': 3,
    'Kate McLaren': 4,
    'Auggie Johnson': 5,
    'Blossom Johnson': 6,
    'Claire Johnson': 7,
    'Jack Johnson': 8,
    'Daisy Johnson': 9,
    'Kiki Johnson': 10
  };
  
  return orderMap[name] || 999;
}