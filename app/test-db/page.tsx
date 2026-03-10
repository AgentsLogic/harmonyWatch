"use client";

import { useState } from 'react';
import { testSupabaseConnection } from '../../lib/test-connection';

export default function TestDatabase() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleTest = async () => {
    setLoading(true);
    try {
      const testResult = await testSupabaseConnection();
      setResult(testResult);
    } catch (error) {
      setResult({
        success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Database Connection Test</h1>
        
        <div className="bg-[#1a1a1a] rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Supabase Connection Test</h2>
          <p className="text-gray-400 mb-4">
            Click the button below to test the connection to your Supabase database.
          </p>
          
          <button
            onClick={handleTest}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            {loading ? 'Testing...' : 'Test Connection'}
          </button>
        </div>

        {result && (
          <div className={`rounded-lg p-6 ${
            result.success 
              ? 'bg-green-900/20 border border-green-500/30' 
              : 'bg-red-900/20 border border-red-500/30'
          }`}>
            <h3 className={`text-lg font-semibold mb-3 ${
              result.success ? 'text-green-400' : 'text-red-400'
            }`}>
              {result.success ? '✅ Connection Successful!' : '❌ Connection Failed'}
            </h3>
            
            <p className="text-gray-300 mb-4">{result.message}</p>
            
            {result.data && (
              <div className="bg-[#242424] rounded p-4">
                <h4 className="font-medium mb-2">Test Results:</h4>
                <pre className="text-sm text-gray-300 whitespace-pre-wrap">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 bg-[#1a1a1a] rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Next Steps</h3>
          <ul className="text-gray-300 space-y-2">
            <li>• If the test is successful, we can proceed to migrate your dummy data</li>
            <li>• If there are errors, we'll need to fix the configuration</li>
            <li>• Once connected, your admin dashboard will use real database data</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

