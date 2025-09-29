import React from 'react';

function linkifyParts(text: string): Array<string | { href: string; label: string }> {
  const urlRegex = /((https?:\/\/|www\.)[^\s]+)|(\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b)/gi;
  const parts: Array<string | { href: string; label: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text)) !== null) {
    const start = match.index;
    const end = urlRegex.lastIndex;
    if (start > lastIndex) parts.push(text.slice(lastIndex, start));
    const raw = match[0];
    const href = raw.includes('@') ? `mailto:${raw}` : raw.startsWith('http') ? raw : `https://${raw}`;
    parts.push({ href, label: raw });
    lastIndex = end;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export function LinkifiedText({ text, className = '' }: { text: string; className?: string }) {
  const parts = linkifyParts(text);
  return (
    <p className={`whitespace-pre-wrap break-words text-text-muted ${className}`}>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          <React.Fragment key={i}>{part}</React.Fragment>
        ) : (
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline break-all">
            {part.label}
          </a>
        )
      )}
    </p>
  );
}

