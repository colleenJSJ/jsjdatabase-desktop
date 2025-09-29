import { useMemo } from 'react';
import { useFamilyMembers as useDbFamilyMembers, FamilyMember } from './useFamilyMembers';

interface UseFamilyMembersOptions {
  includePets?: boolean;
  includeExtended?: boolean;
  role?: 'parent' | 'child' | 'pet' | 'all';
}

export function useFamilyMembers(options: UseFamilyMembersOptions = {}) {
  const { 
    includePets = true, 
    includeExtended = true, 
    role = 'all' 
  } = options;

  // Use the database-driven family members hook
  const { familyMembers, loading, error } = useDbFamilyMembers();

  const members = useMemo(() => {
    if (!familyMembers || familyMembers.length === 0) {
      return [];
    }

    let filtered = [...familyMembers];
    
    // Map database roles to expected roles
    const mapRole = (member: FamilyMember): string => {
      if (member.type === 'pet') return 'pet';
      if (member.role === 'admin' || member.role === 'parent') return 'parent';
      if (member.role === 'child') return 'child';
      return member.role || 'member';
    };
    
    // Filter by role
    if (role !== 'all') {
      filtered = filtered.filter(member => mapRole(member) === role);
    }
    
    // Exclude pets if requested
    if (!includePets) {
      filtered = filtered.filter(member => member.type !== 'pet');
    }
    
    // Exclude extended family if requested (Colleen and Kate)
    if (!includeExtended) {
      filtered = filtered.filter(member => 
        !['Colleen Russell', 'Kate McLaren'].includes(member.name)
      );
    }
    
    // Sort by a predefined order
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
    
    return filtered.sort((a, b) => {
      const orderA = orderMap[a.name] || 999;
      const orderB = orderMap[b.name] || 999;
      return orderA - orderB;
    });
  }, [familyMembers, includePets, includeExtended, role]);

  const memberOptions = useMemo(() => {
    return [
      { value: 'all', label: 'All Members' },
      ...members.map(member => ({
        value: member.id,
        label: member.display_name || member.name
      }))
    ];
  }, [members]);

  const getMemberName = (id: string): string => {
    const member = familyMembers?.find(m => m.id === id);
    return member?.display_name || member?.name || id;
  };

  const getMembersByIds = (ids: string[]): FamilyMember[] => {
    if (!familyMembers) return [];
    return ids
      .map(id => familyMembers.find(m => m.id === id))
      .filter((member): member is FamilyMember => member !== undefined);
  };

  const getMembersByNames = (names: string[]): FamilyMember[] => {
    if (!familyMembers) return [];
    return names
      .map(name => familyMembers.find(m => 
        m.name.toLowerCase() === name.toLowerCase() ||
        m.display_name?.toLowerCase() === name.toLowerCase()
      ))
      .filter((member): member is FamilyMember => member !== undefined);
  };

  const getFamilyMemberById = (id: string): FamilyMember | undefined => {
    return familyMembers?.find(m => m.id === id);
  };

  const getFamilyMemberByName = (name: string): FamilyMember | undefined => {
    return familyMembers?.find(m => 
      m.name.toLowerCase() === name.toLowerCase() ||
      m.display_name?.toLowerCase() === name.toLowerCase()
    );
  };

  const getHumanFamilyMembers = (): FamilyMember[] => {
    return familyMembers?.filter(m => m.type !== 'pet') || [];
  };

  const getPetFamilyMembers = (): FamilyMember[] => {
    return familyMembers?.filter(m => m.type === 'pet') || [];
  };

  const getParents = (): FamilyMember[] => {
    return familyMembers?.filter(m => 
      m.role === 'admin' || m.role === 'parent'
    ) || [];
  };

  const getChildren = (): FamilyMember[] => {
    return familyMembers?.filter(m => m.role === 'child') || [];
  };

  return {
    members,
    memberOptions,
    getMemberName,
    getMembersByIds,
    getMembersByNames,
    allMembers: familyMembers || [],
    humanMembers: getHumanFamilyMembers(),
    pets: getPetFamilyMembers(),
    parents: getParents(),
    children: getChildren(),
    loading,
    error,
    // Additional helper methods
    getFamilyMemberById,
    getFamilyMemberByName,
  };
}