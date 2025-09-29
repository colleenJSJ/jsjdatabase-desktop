'use client';

import { useState } from 'react';

export function TestAdditionalAttendees() {
  const [emails, setEmails] = useState('');
  const [emailList, setEmailList] = useState<string[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && emails.trim()) {
      e.preventDefault();
      console.log('[TEST] Enter pressed with value:', emails);
      
      const newEmails = emails
        .split(',')
        .map(e => e.trim())
        .filter(e => e.includes('@'));
      
      console.log('[TEST] Parsed emails:', newEmails);
      setEmailList([...emailList, ...newEmails]);
      setEmails('');
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h3>Test Additional Attendees Input</h3>
      
      {/* Simple input test */}
      <div>
        <label>Simple Input (press Enter to add):</label>
        <input
          type="text"
          value={emails}
          onChange={(e) => {
            console.log('[TEST] Input changed:', e.target.value);
            setEmails(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type emails and press Enter"
          className="w-full px-3 py-2 border rounded"
        />
      </div>

      {/* Display added emails */}
      <div>
        <p>Added emails ({emailList.length}):</p>
        <ul>
          {emailList.map((email, i) => (
            <li key={i}>{email}</li>
          ))}
        </ul>
      </div>

      {/* Debug info */}
      <div className="text-xs">
        <p>Current input value: "{emails}"</p>
        <p>Email list: {JSON.stringify(emailList)}</p>
      </div>
    </div>
  );
}