"use client";

import { useState } from "react";
import Image from "next/image";
import AddContentModal from "./add-content-modal";

interface ContentItem {
  id: string;
  title: string;
  thumbnail: string;
  isNew?: boolean;
  type?: string;
  badge?: string;
  sort_order: number;
  content_type?: 'video' | 'audio';
}

interface Category {
  id: string;
  title: string;
  items: ContentItem[];
}

interface ContentShelfProps {
  category: Category;
  onDeleteCategory: () => void;
  onAddContent: (contentItemId: string) => void;
  onDeleteContent: (itemId: string) => void;
  onRenameCategory: (newName: string) => void;
  onReorderContent: (draggedItemId: string, targetItemId: string) => void;
}

export default function ContentShelf({ 
  category, 
  onDeleteCategory, 
  onAddContent, 
  onDeleteContent,
  onRenameCategory,
  onReorderContent
}: ContentShelfProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(category.title);
  const [draggedContent, setDraggedContent] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleEditClick = () => {
    setIsEditing(true);
    setEditName(category.title);
  };

  const handleSave = () => {
    if (editName.trim()) {
      onRenameCategory(editName.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(category.title);
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleContentDragStart = (e: React.DragEvent, itemId: string) => {
    setDraggedContent(itemId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleContentDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleContentDrop = (e: React.DragEvent, targetItemId: string) => {
    e.preventDefault();
    
    if (!draggedContent || draggedContent === targetItemId) {
      setDraggedContent(null);
      return;
    }

    onReorderContent(draggedContent, targetItemId);
    setDraggedContent(null);
  };

  const handleContentDragEnd = () => {
    setDraggedContent(null);
  };

  const handleAddContentClick = () => {
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
  };

  const handleModalAdd = (contentItemId: string) => {
    onAddContent(contentItemId);
    setIsModalOpen(false);
  };
  return (
    <div>
      {/* Category Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Drag Handle */}
          <div className="cursor-move p-1 hover:bg-[#2a2a2a] rounded">
            <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 6h8v2H8V6zm0 4h8v2H8v-2zm0 4h8v2H8v-2z"/>
            </svg>
          </div>
          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyPress}
              className="text-xl font-bold text-white bg-transparent border-b border-white focus:outline-none focus:border-blue-500"
              autoFocus
            />
          ) : (
            <h3 className="text-xl font-bold text-white">{category.title}</h3>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Edit Icon */}
          <button 
            onClick={handleEditClick}
            className="p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors"
            disabled={isEditing}
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          
          {/* Delete Icon */}
          <button 
            onClick={onDeleteCategory}
            className="p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors"
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          
          {/* More Options Icon */}
          <button className="p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Content Grid */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {/* Add New Card */}
        <div 
          onClick={handleAddContentClick}
          className="flex-shrink-0 w-48 h-32 bg-[#242424] rounded-lg flex items-center justify-center cursor-pointer hover:bg-[#2a2a2a] transition-colors"
        >
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>

        {/* Content Cards */}
        {category.items.map((item) => (
          <div 
            key={item.id} 
            draggable
            onDragStart={(e) => handleContentDragStart(e, item.id)}
            onDragOver={handleContentDragOver}
            onDrop={(e) => handleContentDrop(e, item.id)}
            onDragEnd={handleContentDragEnd}
            className={`relative flex-shrink-0 ${
              item.content_type === 'audio' ? 'w-32 h-32' : 'w-48 h-32'
            } bg-[#242424] rounded-lg overflow-hidden group cursor-move transition-opacity ${
              draggedContent === item.id ? 'opacity-50' : 'opacity-100'
            }`}
          >
            {/* Thumbnail */}
            <Image
              src={item.thumbnail}
              alt={item.title}
              width={item.content_type === 'audio' ? 128 : 192}
              height={128}
              className="w-full h-full object-cover"
              unoptimized
            />
            
            {/* New Tag */}
            {item.isNew && (
              <div className="absolute top-2 left-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                New
              </div>
            )}
            
            {/* Action Icons */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button className="p-1 bg-black/50 rounded-full hover:bg-black/70 transition-colors">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                </svg>
              </button>
            </div>
            
            {/* Delete Button */}
            <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={() => onDeleteContent(item.id)}
                className="p-1 bg-red-600/80 rounded-full hover:bg-red-600 transition-colors"
              >
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}

        {/* Right Arrow */}
        {category.items.length > 0 && (
          <div className="flex-shrink-0 flex items-center">
            <button className="w-8 h-8 bg-[#242424] rounded-full flex items-center justify-center hover:bg-[#2a2a2a] transition-colors">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Add Content Modal */}
      <AddContentModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onAdd={handleModalAdd}
      />
    </div>
  );
}
