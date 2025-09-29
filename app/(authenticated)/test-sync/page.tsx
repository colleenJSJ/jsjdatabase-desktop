'use client';

import { useState } from 'react';

export default function TestSyncPage() {
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const testSync = async () => {
    setLoading(true);
    setResults(['Starting sync test...']);
    
    try {
      // Test calendar sync
      setResults(prev => [...prev, 'Testing calendar sync...']);
      const calResponse = await fetch('/api/google/calendars/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!calResponse.ok) {
        const error = await calResponse.text();
        setResults(prev => [...prev, `❌ Calendar sync failed: ${calResponse.status} - ${error}`]);
        return;
      }
      
      const calData = await calResponse.json();
      setResults(prev => [...prev, `✅ Calendar sync: ${calData.count} calendars`]);
      
      // Test event sync
      setResults(prev => [...prev, 'Testing event sync...']);
      const eventResponse = await fetch('/api/calendar-events/sync-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!eventResponse.ok) {
        const error = await eventResponse.text();
        setResults(prev => [...prev, `❌ Event sync failed: ${eventResponse.status} - ${error}`]);
        console.error('Event sync error:', error);
        return;
      }
      
      const eventData = await eventResponse.json();
      console.log('Event sync response:', eventData);
      setResults(prev => [...prev, `✅ Event sync: ${eventData.totalEventssynced || 0} events synced`]);
      setResults(prev => [...prev, `  - Created: ${eventData.totalEventsCreated || 0}`]);
      setResults(prev => [...prev, `  - Updated: ${eventData.totalEventsUpdated || 0}`]);
      
      if (eventData.errors && eventData.errors.length > 0) {
        setResults(prev => [...prev, `⚠️ Errors: ${JSON.stringify(eventData.errors)}`]);
        console.error('Sync errors:', eventData.errors);
      }
      
      // Test fetching events
      setResults(prev => [...prev, 'Testing event fetch...']);
      const fetchResponse = await fetch('/api/calendar-events');
      
      if (fetchResponse.ok) {
        const fetchData = await fetchResponse.json();
        setResults(prev => [...prev, `✅ Fetched ${fetchData.events?.length || 0} events from database`]);
        
        // Show first few events
        if (fetchData.events && fetchData.events.length > 0) {
          setResults(prev => [...prev, 'Sample events:']);
          fetchData.events.slice(0, 3).forEach((event: any) => {
            setResults(prev => [...prev, `  - ${event.title} (${event.start_time})`]);
          });
        }
      }
      
    } catch (error: any) {
      setResults(prev => [...prev, `❌ Error: ${error.message}`]);
      console.error('Test error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-2xl font-bold mb-4">Event Sync Test</h1>
      
      <button
        onClick={testSync}
        disabled={loading}
        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {loading ? 'Testing...' : 'Test Event Sync'}
      </button>
      
      <div className="mt-4 space-y-2">
        {results.map((result, index) => (
          <div key={index} className="font-mono text-sm">
            {result}
          </div>
        ))}
      </div>
      
      <div className="mt-8 p-4 bg-gray-800 rounded">
        <h2 className="text-lg font-semibold mb-2">Instructions:</h2>
        <ol className="list-decimal list-inside space-y-1">
          <li>Open browser console (F12) to see detailed logs</li>
          <li>Check server console for database errors</li>
          <li>Click "Test Event Sync" button</li>
          <li>Look for any red error messages</li>
        </ol>
      </div>
    </div>
  );
}