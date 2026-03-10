"use client";

import { useState, useEffect } from 'react';
import { useUser } from '@/app/contexts/user-context';

export default function TestProgressPage() {
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [contentId, setContentId] = useState<string>('');
  const { user } = useUser();

  // Test video progress API endpoints
  const testFetchProgress = async () => {
    if (!contentId) {
      setResult('Please enter a content ID first');
      return;
    }

    setLoading(true);
    setResult('Testing video progress fetch...\n');
    
    try {
      const response = await fetch(`/api/video-progress?contentId=${contentId}`, {
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

  const testSaveProgress = async () => {
    if (!contentId) {
      setResult('Please enter a content ID first');
      return;
    }

    setLoading(true);
    setResult('Testing video progress save...\n');
    
    try {
      const progressData = {
        contentId: contentId,
        currentTime: 120, // 2 minutes
        duration: 600, // 10 minutes
        percentage: 20
      };

      const response = await fetch('/api/video-progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(progressData),
      });
      
      const data = await response.json();
      setResult(prev => prev + `Status: ${response.status}\nResponse: ${JSON.stringify(data, null, 2)}\n`);
    } catch (error) {
      setResult(prev => prev + `Error: ${error}\n`);
    } finally {
      setLoading(false);
    }
  };

  const testClearProgress = async () => {
    if (!contentId) {
      setResult('Please enter a content ID first');
      return;
    }

    setLoading(true);
    setResult('Testing video progress clear...\n');
    
    try {
      const response = await fetch('/api/video-progress', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ contentId }),
      });
      
      const data = await response.json();
      setResult(prev => prev + `Status: ${response.status}\nResponse: ${JSON.stringify(data, null, 2)}\n`);
    } catch (error) {
      setResult(prev => prev + `Error: ${error}\n`);
    } finally {
      setLoading(false);
    }
  };

  const testAuthMe = async () => {
    setLoading(true);
    setResult('Testing /api/auth/me...\n');
    
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

  return (
    <div className="min-h-screen bg-[#121212] text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Video Progress Tracking Test</h1>
        
        {/* User Status */}
        <div className="bg-[#1a1a1a] rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Current User Status</h2>
          {user ? (
            <div className="text-green-400">
              <p>✅ Logged in as: {user.email}</p>
              <p>👤 User Type: {user.user_type}</p>
              <p>🆔 User ID: {user.id}</p>
            </div>
          ) : (
            <div className="text-red-400">
              <p>❌ Not logged in</p>
              <p className="text-sm text-gray-400">Progress tracking requires authentication</p>
            </div>
          )}
        </div>

        {/* Content ID Input */}
        <div className="bg-[#1a1a1a] rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Content ID</h2>
          <p className="text-gray-400 mb-4">
            Enter a content ID to test progress tracking. You can find content IDs in your admin dashboard.
          </p>
          <input
            type="text"
            value={contentId}
            onChange={(e) => setContentId(e.target.value)}
            placeholder="Enter content ID (e.g., 97501d5e-c7fa-4127-b96f-e39ce8dbdaff)"
            className="w-full bg-[#2a2a2a] text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
          />
        </div>
        
        {/* Test Buttons */}
        <div className="space-y-4 mb-8">
          <div className="flex flex-wrap gap-4">
            <button
              onClick={testAuthMe}
              disabled={loading}
              className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 disabled:opacity-50"
            >
              Test Auth Status
            </button>
            
            <button
              onClick={testFetchProgress}
              disabled={loading || !contentId}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Test Fetch Progress
            </button>
            
            <button
              onClick={testSaveProgress}
              disabled={loading || !contentId}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
            >
              Test Save Progress
            </button>
            
            <button
              onClick={testClearProgress}
              disabled={loading || !contentId}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
            >
              Test Clear Progress
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="bg-[#1a1a1a] p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Test Results:</h2>
          <pre className="whitespace-pre-wrap text-sm bg-[#242424] p-4 rounded border">
            {result || "Click a button above to test the video progress endpoints..."}
          </pre>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-[#1a1a1a] rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">How to Test Video Progress:</h3>
          <ol className="list-decimal list-inside space-y-2 text-gray-300">
            <li>Make sure you're logged in (check user status above)</li>
            <li>Go to your admin dashboard and find a video content ID</li>
            <li>Copy the content ID and paste it in the input field above</li>
            <li>Click "Test Save Progress" to save a test progress point</li>
            <li>Click "Test Fetch Progress" to retrieve the saved progress</li>
            <li>Click "Test Clear Progress" to remove the saved progress</li>
            <li>Go to the actual video page and test if it resumes from the saved position</li>
          </ol>
          
          <div className="mt-4 p-4 bg-blue-900/20 border border-blue-500/30 rounded">
            <h4 className="font-medium text-blue-400 mb-2">💡 Real-world Testing:</h4>
            <p className="text-sm text-gray-300">
              To test the actual video player progress tracking, go to a video page, watch for a few minutes, 
              then navigate away and come back. The video should resume from where you left off.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
