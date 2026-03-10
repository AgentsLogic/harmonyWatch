"use client";

import { useState } from 'react';
import { seedDatabase } from '@/lib/seed-database';

export default function SeedPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSeed = async () => {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      await seedDatabase();
      setResult('✅ Database seeded successfully! You can now go to the admin dashboard or homepage to see the data.');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to seed database');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-8">
      <div className="max-w-2xl w-full bg-[#1a1a1a] p-8 rounded-lg border border-gray-700">
        <h1 className="text-3xl font-bold mb-4">Seed Database</h1>
        <p className="text-gray-400 mb-6">
          This will populate your Supabase database with initial dummy data for categories and content items.
        </p>
        
        <div className="mb-6 p-4 bg-yellow-900/20 border border-yellow-600/50 rounded">
          <p className="text-yellow-200 text-sm">
            ⚠️ <strong>Important:</strong> Make sure you've run the SQL schema in your Supabase dashboard first!
          </p>
        </div>

        <button
          onClick={handleSeed}
          disabled={loading}
          className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
        >
          {loading ? 'Seeding Database...' : 'Seed Database'}
        </button>

        {result && (
          <div className="mt-6 p-4 bg-green-900/20 border border-green-600/50 rounded">
            <p className="text-green-200">{result}</p>
          </div>
        )}

        {error && (
          <div className="mt-6 p-4 bg-red-900/20 border border-red-600/50 rounded">
            <p className="text-red-200">❌ Error: {error}</p>
            <p className="text-red-300 text-sm mt-2">
              Make sure you've created the tables in Supabase first by running the SQL schema.
            </p>
          </div>
        )}

        <div className="mt-8 text-sm text-gray-400">
          <p className="font-semibold mb-2">After seeding:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Go to <a href="/admin" className="text-blue-400 hover:underline">Admin Dashboard</a> to manage categories</li>
            <li>Go to <a href="/" className="text-blue-400 hover:underline">Homepage</a> to see categories display</li>
            <li>Changes in admin will instantly reflect on the homepage</li>
          </ul>
        </div>
      </div>
    </div>
  );
}


