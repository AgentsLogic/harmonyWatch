"use client";

import { useState } from "react";

export default function TestAuthPage() {
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const testAuthMe = async () => {
    setLoading(true);
    setResult("Testing /api/auth/me...\n");
    
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
      });
      
      const data = await response.json();
      setResult(prev => prev + `Status: ${response.status}\nResponse: ${JSON.stringify(data, null, 2)}\n`);
    } catch (error) {
      setResult(prev => prev + `Error: ${error}\n`);
    } finally {
      setLoading(false);
    }
  };

  const testRegister = async () => {
    setLoading(true);
    setResult("Testing /api/auth/register...\n");
    
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email: 'test@example.com', 
          password: 'testpassword123',
          userType: 'free'
        }),
      });
      
      const data = await response.json();
      setResult(prev => prev + `Status: ${response.status}\nResponse: ${JSON.stringify(data, null, 2)}\n`);
    } catch (error) {
      setResult(prev => prev + `Error: ${error}\n`);
    } finally {
      setLoading(false);
    }
  };

  const testLogin = async () => {
    setLoading(true);
    setResult("Testing /api/auth/login...\n");
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          email: 'test@example.com', 
          password: 'testpassword123'
        }),
      });
      
      const data = await response.json();
      setResult(prev => prev + `Status: ${response.status}\nResponse: ${JSON.stringify(data, null, 2)}\n`);
    } catch (error) {
      setResult(prev => prev + `Error: ${error}\n`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Authentication System Test</h1>
        
        <div className="space-y-4 mb-8">
          <button
            onClick={testAuthMe}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 mr-4"
          >
            Test /api/auth/me
          </button>
          
          <button
            onClick={testRegister}
            disabled={loading}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50 mr-4"
          >
            Test /api/auth/register
          </button>
          
          <button
            onClick={testLogin}
            disabled={loading}
            className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 disabled:opacity-50"
          >
            Test /api/auth/login
          </button>
        </div>

        <div className="bg-gray-800 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Test Results:</h2>
          <pre className="whitespace-pre-wrap text-sm">
            {result || "Click a button above to test the authentication endpoints..."}
          </pre>
        </div>
      </div>
    </div>
  );
}
