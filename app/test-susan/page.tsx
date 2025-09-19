'use client';

import { useState, useEffect } from 'react';

export default function TestSusanPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fixResult, setFixResult] = useState<any>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {

      const response = await fetch('/api/auth/users');

      const data = await response.json();

      if (response.ok) {
        setUsers(data.users || []);
        
        // Check for Susan
        const susan = data.users?.find((u: any) => u.name?.toLowerCase().includes('susan'));
        if (susan) {

        } else {

          console.log('All user names:', data.users?.map((u: any) => u.name));
        }
      } else {
        setError(`Failed to fetch users: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {

      setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const runFix = async () => {
    try {

      const response = await fetch('/api/fix/susan', {
        method: 'POST',
      });
      
      const data = await response.json();

      setFixResult(data);
      
      // Refetch users after fix
      await fetchUsers();
    } catch (err) {

      setFixResult({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  const susan = users.find(u => u.name?.toLowerCase().includes('susan'));

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Susan Johnson Debug Page</h1>
      
      <div className="space-y-6">
        <div className="bg-gray-900 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Users API Test</h2>
          
          {loading ? (
            <p>Loading users...</p>
          ) : error ? (
            <p className="text-red-500">{error}</p>
          ) : (
            <>
              <p className="mb-2">Total users found: {users.length}</p>
              <div className="mb-4">
                <p className="font-semibold mb-2">Susan Status:</p>
                {susan ? (
                  <div className="bg-green-900/50 p-3 rounded">
                    <p className="text-green-400">✅ Susan Johnson FOUND</p>
                    <pre className="mt-2 text-sm">{JSON.stringify(susan, null, 2)}</pre>
                  </div>
                ) : (
                  <div className="bg-red-900/50 p-3 rounded">
                    <p className="text-red-400">❌ Susan Johnson NOT FOUND</p>
                  </div>
                )}
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">All Users:</h3>
                <div className="space-y-2">
                  {users.map(user => (
                    <div key={user.id} className="bg-gray-800 p-3 rounded">
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-gray-400">{user.email}</p>
                      <p className="text-xs text-gray-500">ID: {user.id}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="bg-gray-900 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Fix Susan Tool</h2>
          <button
            onClick={runFix}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
          >
            Run Susan Fix
          </button>
          
          {fixResult && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2">Fix Result:</h3>
              <pre className="bg-gray-800 p-3 rounded overflow-x-auto text-sm">
                {JSON.stringify(fixResult, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="bg-gray-900 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Instructions</h2>
          <ol className="list-decimal list-inside space-y-2">
            <li>Check the console (F12) for detailed logs</li>
            <li>If Susan is not shown above, click "Run Susan Fix"</li>
            <li>After running the fix, the page will refetch users</li>
            <li>If Susan appears after the fix, clear your browser cache and try the tasks page again</li>
          </ol>
        </div>
      </div>
    </div>
  );
}