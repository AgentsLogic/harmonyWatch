"use client";

import { useState } from "react";
import ContentShelf from "./content-shelf";

interface Category {
  id: string;
  title: string;
  sort_order: number;
  items: ContentItem[];
}

interface ContentItem {
  id: string;
  title: string;
  thumbnail: string;
  isNew?: boolean;
  type?: string;
  badge?: string;
  sort_order: number;
}

interface ContentDashboardProps {
  categories: Category[];
  onAddCategory: (title: string) => Promise<any>;
  onUpdateCategory: (id: string, title: string) => Promise<any>;
  onDeleteCategory: (id: string) => Promise<void>;
  onReorderCategories: (newOrder: Category[]) => Promise<void>;
  onAddContentToCategory: (categoryId: string, contentItemId: string) => Promise<void>;
  onDeleteContent: (categoryId: string, itemId: string) => Promise<void>;
  onReorderContent: (categoryId: string, newOrder: ContentItem[]) => Promise<void>;
}

export default function ContentDashboard({ 
  categories,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onReorderCategories,
  onAddContentToCategory,
  onDeleteContent,
  onReorderContent
}: ContentDashboardProps) {
  const [draggedCategory, setDraggedCategory] = useState<string | null>(null);

  const handleAddCategory = async () => {
    try {
      await onAddCategory(`Category ${categories.length + 1}`);
    } catch (err) {
      console.error('Failed to add category:', err);
    }
  };

  const handleDragStart = (e: React.DragEvent, categoryId: string) => {
    setDraggedCategory(categoryId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, targetCategoryId: string) => {
    e.preventDefault();
    
    if (!draggedCategory || draggedCategory === targetCategoryId) {
      setDraggedCategory(null);
      return;
    }

    const draggedIndex = categories.findIndex(cat => cat.id === draggedCategory);
    const targetIndex = categories.findIndex(cat => cat.id === targetCategoryId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedCategory(null);
      return;
    }

    const newCategories = [...categories];
    const draggedCategoryData = newCategories[draggedIndex];
    
    // Remove the dragged category
    newCategories.splice(draggedIndex, 1);
    
    // Insert at new position
    const newTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    newCategories.splice(newTargetIndex, 0, draggedCategoryData);
    
    try {
      await onReorderCategories(newCategories);
    } catch (err) {
      console.error('Failed to reorder categories:', err);
    }
    
    setDraggedCategory(null);
  };

  const handleDragEnd = () => {
    setDraggedCategory(null);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    try {
      await onDeleteCategory(categoryId);
    } catch (err) {
      console.error('Failed to delete category:', err);
    }
  };

  const handleAddContent = async (categoryId: string, contentItemId: string) => {
    try {
      await onAddContentToCategory(categoryId, contentItemId);
    } catch (err) {
      console.error('Failed to add content to category:', {
        error: err,
        message: err instanceof Error ? err.message : String(err),
        categoryId,
        contentItemId,
        stack: err instanceof Error ? err.stack : undefined
      });
    }
  };

  const handleDeleteContent = async (categoryId: string, itemId: string) => {
    try {
      await onDeleteContent(categoryId, itemId);
    } catch (err) {
      console.error('Failed to delete content:', err);
    }
  };

  const handleRenameCategory = async (categoryId: string, newName: string) => {
    try {
      await onUpdateCategory(categoryId, newName);
    } catch (err) {
      console.error('Failed to rename category:', err);
    }
  };

  const handleReorderContent = async (categoryId: string, draggedItemId: string, targetItemId: string) => {
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return;
    
    const items = [...category.items];
    const draggedIndex = items.findIndex(item => item.id === draggedItemId);
    const targetIndex = items.findIndex(item => item.id === targetItemId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    const draggedItem = items[draggedIndex];
    items.splice(draggedIndex, 1);
    
    const newTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    items.splice(newTargetIndex, 0, draggedItem);
    
    try {
      await onReorderContent(categoryId, items);
    } catch (err) {
      console.error('Failed to reorder content:', err);
    }
  };

  return (
    <div>

      {/* Content Shelves */}
      <div className="space-y-8">
        {categories.map((category) => (
          <div
            key={category.id}
            draggable
            onDragStart={(e) => handleDragStart(e, category.id)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, category.id)}
            onDragEnd={handleDragEnd}
            className={`transition-opacity ${draggedCategory === category.id ? 'opacity-50' : 'opacity-100'}`}
          >
            <ContentShelf
              category={category}
              onDeleteCategory={() => handleDeleteCategory(category.id)}
              onAddContent={(content) => handleAddContent(category.id, content)}
              onDeleteContent={(itemId) => handleDeleteContent(category.id, itemId)}
              onRenameCategory={(newName) => handleRenameCategory(category.id, newName)}
              onReorderContent={(draggedItemId, targetItemId) => handleReorderContent(category.id, draggedItemId, targetItemId)}
            />
          </div>
        ))}
      </div>

      {/* Add Category Button */}
      <div className="mt-8">
        <button
          onClick={handleAddCategory}
          className="flex items-center gap-3 px-4 py-3 bg-[#242424] text-white rounded-lg hover:bg-[#2a2a2a] transition-colors border border-gray-600 hover:border-gray-500"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Add Category
        </button>
      </div>
    </div>
  );
}
