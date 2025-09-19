'use client';

import { useEffect, useState } from 'react';
import { usePersonFilter } from '@/contexts/person-filter-context';
import { createClient } from '@/lib/supabase/client';

interface FamilyMember {
  id: string;
  name: string;
  type: 'human' | 'pet';
}

interface PersonSelectorProps {
  className?: string;
  showLabel?: boolean;
  labelText?: string;
  includePets?: boolean;
  value?: string | 'all' | null;
  onChange?: (value: string | 'all') => void;
}

export function PersonSelector({ 
  className = '', 
  showLabel = true,
  labelText = "Filter by:",
  includePets = true,
  value,
  onChange,
}: PersonSelectorProps) {
  const { selectedPersonId, setSelectedPersonId } = usePersonFilter();
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchFamilyMembers = async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('family_members')
          .select('id, name, type')
          .eq('is_active', true)
          .order('type', { ascending: false }) // Humans first
          .order('name', { ascending: true });
        
        setFamilyMembers(data || []);
      } catch (error) {
        console.error('Error fetching family members:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchFamilyMembers();
  }, []);
  
  if (loading) {
    return <div className="animate-pulse h-9 bg-gray-700 rounded w-48"></div>;
  }
  
  const humans = familyMembers.filter(m => m.type === 'human');
  const pets = familyMembers.filter(m => m.type === 'pet');
  
  // Separate family members from staff
  const staffNames = ['Colleen Russell', 'Kate McLaren'];
  const staff = humans.filter(m => staffNames.includes(m.name));
  const family = humans.filter(m => !staffNames.includes(m.name));
  
  const currentValue = value ?? (selectedPersonId ?? 'all');
  const selectValue = currentValue === null ? 'all' : currentValue;

  const handleChange = (rawValue: string) => {
    const normalized = rawValue === 'all' ? null : rawValue;
    setSelectedPersonId(normalized);
    onChange?.(rawValue === 'all' ? 'all' : rawValue);
  };

  return (
    <div className="flex items-center gap-2">
      {showLabel && (
        <label htmlFor="person-filter" className="text-sm text-text-muted">
          {labelText}
        </label>
      )}
      <select
        id="person-filter"
        value={selectValue}
        onChange={(e) => handleChange(e.target.value)}
        className={`px-3 py-2 bg-background-primary border border-gray-600/30 
                   rounded-md text-text-primary focus:outline-none 
                   focus:ring-2 focus:ring-gray-700 ${className}`}
      >
        <option value="all">All People</option>
        
        {family.length > 0 && (
          <optgroup label="Family Members">
            {family.map(member => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </optgroup>
        )}
        
        {staff.length > 0 && (
          <optgroup label="Staff">
            {staff.map(member => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </optgroup>
        )}
        
        {includePets && pets.length > 0 && (
          <optgroup label="Pets">
            {pets.map(member => (
              <option key={member.id} value={member.id}>
                {member.name} 🐾
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}
