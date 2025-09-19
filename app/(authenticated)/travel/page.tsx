import { Suspense } from 'react';
import TravelPageClient from './TravelPageClient';

export const dynamic = 'force-dynamic';

export default function TravelPage() {
  return (
    <Suspense fallback={<div /> }>
      <TravelPageClient />
    </Suspense>
  );
}
