"use client";

import { useState } from "react";
import { useContentItems } from "@/lib/hooks/useContentItems";

interface AddContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (contentItemId: string) => void;
}

export default function AddContentModal({ isOpen, onClose, onAdd }: AddContentModalProps) {
  const { getAllContentOptions, loading } = useContentItems();
  const [selectedContentId, setSelectedContentId] = useState("");
  // Filter to only show series content, not individual content items
  const contentOptions = getAllContentOptions().filter(option => option.type === 'series');

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (selectedContentId) {
      onAdd(selectedContentId);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-[#242424] rounded-lg p-6 w-96 mx-4">
        {/* Title */}
        <h2 className="text-xl font-bold text-white mb-6">Add content to category</h2>
        
        {/* Form */}
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
            </div>
          ) : (
            <>
              {/* Content Selection */}
              <div>
                <label className="block text-white text-sm mb-2">Select Content</label>
                <div className="relative">
                  <select
                    value={selectedContentId}
                    onChange={(e) => setSelectedContentId(e.target.value)}
                    className="w-full bg-[#1a1a1a] text-white px-3 py-2 rounded-md border border-gray-600 focus:outline-none focus:border-gray-500 appearance-none"
                  >
                    <option value="">Choose series to add...</option>
                    {contentOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.title}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="text-xs text-gray-400 bg-[#1a1a1a] p-3 rounded">
                <p>Only series content can be added to categories.</p>
                <p>This will add the selected series to the current category.</p>
              </div>
            </>
          )}
        </div>

        {/* Add Button */}
        <div className="flex justify-end mt-6">
          <button
            onClick={handleSubmit}
            disabled={!selectedContentId || loading}
            className="px-4 py-2 bg-[#1a1a1a] text-white rounded-md hover:bg-[#2a2a2a] transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            Add Content
          </button>
        </div>
      </div>
    </div>
  );
}
