'use client';

import { Suspense } from 'react';
import PetsPageClient from './PetsPageClient';

export const dynamic = 'force-dynamic';

export default function PetsPage() {
  return (
    <Suspense fallback={<div /> }>
      <PetsPageClient />
    </Suspense>
  );
}

