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

  const showTitle = Boolean(title?.trim());

  return (
    <div className="space-y-2">
      {showTitle && <div className="text-sm font-medium text-text-primary">{title}</div>}
      <div className="flex flex-wrap gap-2">
        {sorted.map((m: any) => {
          const selected = selectedIds.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onChange(selected ? selectedIds.filter((x) => x !== m.id) : [...selectedIds, m.id]);
              }}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm border transition-colors ${
                selected
                  ? 'border-blue-400 bg-blue-500/20 text-blue-200'
                  : 'border-gray-600/40 bg-background-primary text-text-primary hover:border-gray-500'
              }`}
            >
              <span>{m.name}</span>
              {m.type === 'pet' && <span className="text-xs">🐾</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
