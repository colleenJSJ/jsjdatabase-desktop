'use client';

import { useState } from 'react';

export default function TestEventPage() {
  if (process.env.NODE_ENV === 'production') {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">404 Not Found</h1>
      </div>
    );
  }
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const createTestEvent = async () => {
    setLoading(true);
    setResult('Creating event...');

    try {
      const response = await fetch('/api/calendar-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event: {
            title: 'Test Event ' + new Date().toLocaleTimeString(),
            description: 'Test Description',
            category: 'personal',
            start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            end_time: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
            all_day: false,
            attendees: [],
            google_sync_enabled: false
          }
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        setResult('Error: ' + JSON.stringify(data, null, 2));
        console.error('Error:', data);
      } else {
        setResult('Success! Event created:\n' + JSON.stringify(data, null, 2));
        console.log('Success:', data);
      }
    } catch (error) {
      setResult('Network error: ' + (error as Error).message);
      console.error('Network error:', error);
    } finally {
      setLoading(false);
    }
  };

  const testMinimalPost = async () => {
    setLoading(true);
    setResult('Testing minimal POST...');

    try {
      const response = await fetch('/api/test-calendar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Minimal Test'
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        setResult('Error: ' + JSON.stringify(data, null, 2));
        console.error('Error:', data);
      } else {
        setResult('Success! Test POST worked:\n' + JSON.stringify(data, null, 2));
        console.log('Success:', data);
      }
    } catch (error) {
      setResult('Network error: ' + (error as Error).message);
      console.error('Network error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Test Event Creation</h1>
      
      <div className="space-y-4">
        <div>
          <button
            onClick={testMinimalPost}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 mr-4"
          >
            Test Minimal POST (Simple Test)
          </button>
          <button
            onClick={createTestEvent}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            Create Test Event (Full Event)
          </button>
        </div>

        <pre className="mt-4 p-4 bg-gray-900 text-gray-100 rounded overflow-auto">
          {result || 'Click a button to test...'}
        </pre>
      </div>
    </div>
  );
}
