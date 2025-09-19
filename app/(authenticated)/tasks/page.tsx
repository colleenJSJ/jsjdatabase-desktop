import { Suspense } from 'react';
import TasksPageClient from './TasksPageClient';

export const dynamic = 'force-dynamic';

export default function TasksPage() {
  return (
    <Suspense fallback={<div /> }>
      <TasksPageClient />
    </Suspense>
  );
}

