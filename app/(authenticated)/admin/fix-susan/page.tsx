'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function FixSusanPage() {
  const [susanStatus, setSusanStatus] = useState<{
    id: string;
    name: string;
    email: string;
    is_active: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);

  const checkSusanStatus = async () => {
    try {
      const response = await fetch('/api/admin/activate-susan');
      const data = await response.json();
      setSusanStatus(data.user);
    } catch (error) {

    } finally {
      setLoading(false);
    }
  };

  const activateSusan = async () => {
    setActivating(true);
    try {
      const response = await fetch('/api/admin/activate-susan', {
        method: 'POST',
      });
      const data = await response.json();
      if (data.success) {
        alert('Susan Johnson has been activated successfully!');
        await checkSusanStatus();
      } else {
        alert(`Failed to activate Susan: ${data.error}`);
      }
    } catch (error) {

      alert('Error activating Susan');
    } finally {
      setActivating(false);
    }
  };

  useEffect(() => {
    checkSusanStatus();
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <Card className="p-6">
          <p>Loading Susan&apos;s status...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <Card className="p-6">
        <h1 className="text-2xl font-bold mb-4">Fix Susan Johnson Status</h1>
        
        {susanStatus ? (
          <div className="space-y-4">
            <div>
              <p><strong>Name:</strong> {susanStatus.name}</p>
              <p><strong>Email:</strong> {susanStatus.email}</p>
              <p><strong>ID:</strong> {susanStatus.id}</p>
              <p><strong>Status:</strong> {susanStatus.is_active ? 'Active ✅' : 'Inactive ❌'}</p>
            </div>
            
            {!susanStatus.is_active && (
              <Button 
                onClick={activateSusan} 
                disabled={activating}
                className="bg-green-600 hover:bg-green-700"
              >
                {activating ? 'Activating...' : 'Activate Susan'}
              </Button>
            )}
            
            {susanStatus.is_active && (
              <div className="bg-green-100 dark:bg-green-900/20 p-4 rounded">
                <p className="text-green-800 dark:text-green-200">
                  Susan is active! She should now appear in all assignment dropdowns.
                </p>
              </div>
            )}
          </div>
        ) : (
          <p>Susan Johnson not found in the database.</p>
        )}
      </Card>
    </div>
  );
}