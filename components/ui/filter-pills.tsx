'use client';

interface FilterPillsProps {
  options: Array<{ value: string; label: string }>;
  selected: string;
  onSelect: (value: string) => void;
  className?: string;
}

export function FilterPills({ 
  options, 
  selected, 
  onSelect,
  className = ''
}: FilterPillsProps) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {options.map(option => (
        <button
          key={option.value}
          onClick={() => onSelect(option.value)}
          className={`px-4 py-2 rounded-lg transition-colors ${
            selected === option.value
              ? 'bg-gray-700 text-text-primary'
              : 'bg-background-secondary text-text-muted hover:bg-gray-700/50'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}