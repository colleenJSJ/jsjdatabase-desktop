import { Suspense } from 'react';
import CalendarPageClient from './CalendarPageClient';

export const dynamic = 'force-dynamic';

export default function CalendarPage() {
  return (
    <Suspense fallback={<div /> }>
      <CalendarPageClient />
    </Suspense>
  );
}

