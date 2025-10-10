import { useEffect, useState } from 'react';
import ApiClient from '@/lib/api/api-client';

export function useResolvedPortalPassword(portalPassword?: string | null) {
  const [resolved, setResolved] = useState(portalPassword ?? '');

  useEffect(() => {
    let isMounted = true;
    const password = portalPassword ?? '';

    if (!password) {
      setResolved('');
      return () => {
        isMounted = false;
      };
    }

    const looksEncrypted = password.includes(':');
    if (!looksEncrypted) {
      setResolved(password);
      return () => {
        isMounted = false;
      };
    }

    (async () => {
      try {
        const response = await ApiClient.post('/api/security/decrypt-portal-password', { ciphertext: password });
        if (!isMounted) return;
        if (response.success) {
          const plain = (response.data as any)?.password;
          setResolved(typeof plain === 'string' ? plain : password);
        } else {
          setResolved(password);
        }
      } catch {
        if (isMounted) {
          setResolved(password);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [portalPassword]);

  return resolved;
}
