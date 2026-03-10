"use client";

import { useState } from 'react';
import { storageService, STORAGE_BUCKETS } from '@/lib/storage';

export default function TestStoragePage() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setSelectedFile(file || null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setResult('Please select a file first');
      return;
    }

    setUploading(true);
    setResult('Uploading...');

    try {
      const extension = storageService.getFileExtension(selectedFile.name);
      const filePath = storageService.generateFilePath('test-uploads', extension);
      
      const uploadResult = await storageService.uploadFile(
        STORAGE_BUCKETS.THUMBNAILS,
        filePath,
        selectedFile
      );

      if (uploadResult.success) {
        setResult(`✅ Upload successful! URL: ${uploadResult.url}`);
      } else {
        setResult(`❌ Upload failed: ${uploadResult.error}`);
      }
    } catch (error) {
      setResult(`❌ Upload error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Test Supabase Storage</h1>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">
              Select an image file to upload:
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
            />
          </div>

          {selectedFile && (
            <div className="bg-gray-800 p-4 rounded-lg">
              <h3 className="font-medium mb-2">Selected File:</h3>
              <p><strong>Name:</strong> {selectedFile.name}</p>
              <p><strong>Size:</strong> {(selectedFile.size / 1024).toFixed(2)} KB</p>
              <p><strong>Type:</strong> {selectedFile.type}</p>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            {uploading ? 'Uploading...' : 'Upload to Supabase Storage'}
          </button>

          {result && (
            <div className={`p-4 rounded-lg ${
              result.includes('✅') ? 'bg-green-900 text-green-100' : 
              result.includes('❌') ? 'bg-red-900 text-red-100' : 
              'bg-blue-900 text-blue-100'
            }`}>
              <pre className="whitespace-pre-wrap">{result}</pre>
            </div>
          )}
        </div>

        <div className="mt-8 p-4 bg-gray-800 rounded-lg">
          <h3 className="font-medium mb-2">Instructions:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Run the <code className="bg-gray-700 px-1 rounded">setup-storage.sql</code> script in your Supabase SQL editor</li>
            <li>Select an image file (JPG, PNG, WebP, or GIF)</li>
            <li>Click "Upload to Supabase Storage" to test the functionality</li>
            <li>Check your Supabase Storage dashboard to see the uploaded file</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
