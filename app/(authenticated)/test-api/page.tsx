'use client';

import { useState } from 'react';

export default function TestAPIPage() {
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testAdminAPI = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      setResponse({
        status: res.status,
        statusText: res.statusText,
        data: data
      });
    } catch (error) {
      setResponse({
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test Admin Users API</h1>
      
      <button
        onClick={testAdminAPI}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50"
      >
        {loading ? 'Testing...' : 'Test /api/admin/users'}
      </button>

      {response && (
        <div className="mt-4">
          <h2 className="text-lg font-semibold mb-2">Response:</h2>
          <pre className="bg-gray-800 p-4 rounded-lg overflow-auto">
            {JSON.stringify(response, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}