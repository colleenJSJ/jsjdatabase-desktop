'use client';

import React, { useEffect, useRef, useState } from 'react';

type AutoSizerProps = {
  children: (size: { height: number; width: number }) => React.ReactNode;
  className?: string;
};

export default function AutoSizer({ children, className }: AutoSizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ height: number; width: number }>({ height: 0, width: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      setSize({ height: el.clientHeight, width: el.clientWidth });
    };

    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }}>
      {size.width > 0 && size.height > 0 ? children(size) : null}
    </div>
  );
}

