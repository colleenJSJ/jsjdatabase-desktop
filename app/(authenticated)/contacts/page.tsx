import { Suspense } from 'react';
import ContactsPageContent from './ContactsPageContent';

export default function ContactsPage() {
  return (
    <Suspense fallback={<div />}> 
      <ContactsPageContent />
    </Suspense>
  );
}
