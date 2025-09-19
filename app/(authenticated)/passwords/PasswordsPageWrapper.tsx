'use client';

import { PasswordSecurityProvider, usePasswordSecurity } from '@/contexts/password-security-context';
import { PasswordLockScreen } from '@/components/passwords/PasswordLockScreen';
import PasswordsPageContent from './PasswordsPageContent';

function PasswordsPageWithSecurity() {
  const { isLocked } = usePasswordSecurity();

  // Temporarily disabled security to debug
  // if (isLocked) {
  //   return <PasswordLockScreen />;
  // }

  return <PasswordsPageContent />;
}

export default function PasswordsPageWrapper() {
  return (
    <PasswordSecurityProvider>
      <PasswordsPageWithSecurity />
    </PasswordSecurityProvider>
  );
}