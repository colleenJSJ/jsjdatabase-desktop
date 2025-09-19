import { Suspense } from 'react';
import J3AcademicsPageClient from './J3AcademicsPageClient';

export const dynamic = 'force-dynamic';

export default function J3AcademicsPage() {
  return (
    <Suspense fallback={<div /> }>
      <J3AcademicsPageClient />
    </Suspense>
  );
}
