'use client';

import { useFamilyMembers } from '@/hooks/use-family-members';

export function TravelersPicker({
  selectedIds,
  onChange,
  includePets = true,
  includeExtended = true,
  title = 'Assign To'
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  includePets?: boolean;
  includeExtended?: boolean;
  title?: string;
}) {
  const { members } = useFamilyMembers({ includePets, includeExtended });

  const order = ['john','susan','auggie','claire','blossom','kate','colleen'];
  const rankOf = (m: any) => {
    const first = (m.display_name || m.name || '').split(' ')[0].toLowerCase();
    if (m.type === 'pet') return 200 + first.charCodeAt(0);
    const idx = order.indexOf(first);
    return idx >= 0 ? idx : 100 + first.charCodeAt(0);
  };
  const sorted = [...(members || [])].sort((a: any, b: any) => {
    const ra = rankOf(a); const rb = rankOf(b);
    if (ra !== rb) return ra - rb;
    return (a.display_name || a.name || '').localeCompare(b.display_name || b.name || '');
  });

  return (
    <div>
      <div className="text-sm mb-1">{title}</div>
      <div className="grid grid-cols-2 gap-2 p-2 bg-background-primary rounded border border-gray-600/30">
        {sorted.map((m: any) => (
          <label key={m.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selectedIds.includes(m.id)}
              onChange={() => {
                onChange(selectedIds.includes(m.id) ? selectedIds.filter(x => x !== m.id) : [...selectedIds, m.id]);
              }}
            />
            <span className="text-text-primary">{m.name}</span>
            {m.type === 'pet' && <span className="text-xs">🐾</span>}
          </label>
        ))}
      </div>
    </div>
  );
}
