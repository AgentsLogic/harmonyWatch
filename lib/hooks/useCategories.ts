"use client";

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { categoriesService, categoryContentService, categorySeriesService } from '../database';
import { useContentItems } from './useContentItems';
import { supabaseAdmin } from '../supabase';

export interface CategoryItem {
  id: string;
  title: string;
  description?: string; // Description for series/content
  thumbnail: string;
  sort_order: number;
  badge?: string;
  isNew?: boolean;
  type?: string;
  rating?: string;
  tags?: string[];
  logo_url?: string; // Series logo URL
  banner_url?: string; // Series banner URL
  content_type?: 'video' | 'audio'; // Content type for series
  slug?: string | null; // Series slug for URL routing
  itemType?: 'content' | 'series'; // Distinguish between content items and series
}

export interface CategoryWithItems {
  id: string;
  title: string;
  sort_order: number;
  items: CategoryItem[];
}

async function fetchCategoriesWithContent(): Promise<CategoryWithItems[]> {
  return await categoriesService.getAllWithContent();
}

export function useCategories() {
  const queryClient = useQueryClient();
  
  // Get series data to determine item types
  const { series } = useContentItems();

  const { data: categories = [], isLoading: loading, error } = useQuery({
    queryKey: queryKeys.categories.withContent(),
    queryFn: fetchCategoriesWithContent,
    staleTime: 5 * 60 * 1000, // 5 minutes
    // Use placeholderData to show cached data immediately while refetching
    placeholderData: (previousData) => previousData,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
  };

  const addCategory = async (title: string) => {
    try {
      const newCategory = await categoriesService.create({
        title,
        sort_order: categories.length
      });
      
      // Invalidate cache to refetch
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
      return newCategory;
    } catch (err) {
      console.error('Error adding category:', err);
      throw err;
    }
  };

  const updateCategory = async (id: string, title: string) => {
    try {
      const updated = await categoriesService.update(id, { title });
      // Invalidate cache to refetch
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
      return updated;
    } catch (err) {
      console.error('Error updating category:', err);
      throw err;
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      await categoriesService.delete(id);
      // Invalidate cache to refetch
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
    } catch (err) {
      console.error('Error deleting category:', err);
      throw err;
    }
  };

  const reorderCategories = async (newOrder: CategoryWithItems[]) => {
    try {
      // Update sort_order in database
      const updates = newOrder.map((cat, index) => 
        categoriesService.update(cat.id, { sort_order: index })
      );
      
      await Promise.all(updates);
      // Invalidate cache to refetch
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
    } catch (err) {
      console.error('Error reordering categories:', err);
      throw err;
    }
  };

  const addContentToCategory = async (categoryId: string, itemId: string) => {
    console.log('Starting addContentToCategory:', { categoryId, itemId });
    
    try {
      const category = categories.find(c => c.id === categoryId);
      if (!category) {
        throw new Error(`Category with id ${categoryId} not found`);
      }
      
      // Check if item is already in this category by looking at the current items
      const existingItem = category.items.find(item => item.id === itemId);
      if (existingItem) {
        console.log('⚠️ Item already exists in category:', { categoryId, itemId, existingItem });
        return; // Item already exists, no need to add again
      }
      
      // Double-check by querying the database directly to avoid race conditions
      console.log('Double-checking database for existing entries...');
      
      // Check if it exists as a series in this category
      const { data: existingSeries } = await supabaseAdmin
        .from('category_series')
        .select('id')
        .eq('category_id', categoryId)
        .eq('series_id', itemId)
        .single();
      
      if (existingSeries) {
        console.log('⚠️ Series already exists in category_series table:', { categoryId, itemId });
        return;
      }
      
      // Check if it exists as a content item in this category
      const { data: existingContent } = await supabaseAdmin
        .from('category_content')
        .select('id')
        .eq('category_id', categoryId)
        .eq('content_item_id', itemId)
        .single();
      
      if (existingContent) {
        console.log('⚠️ Content item already exists in category_content table:', { categoryId, itemId });
        return;
      }
      
      const sortOrder = category.items.length;
      console.log('Found category:', { category: category.title, sortOrder });
      
      // Determine if this is a content item or series by checking the database directly
      // Check if it exists in the series table
      const { data: seriesData } = await supabaseAdmin
        .from('series')
        .select('id')
        .eq('id', itemId)
        .single();
      
      const isSeries = !!seriesData;
      console.log('Item type detection:', { itemId, isSeries, seriesData });
      
      if (isSeries) {
        console.log('Item is a series, adding to category_series table...');
        try {
          await categorySeriesService.addSeriesToCategory(categoryId, itemId, sortOrder);
          console.log('✅ Successfully added as series:', { categoryId, itemId });
        } catch (seriesError) {
          console.error('❌ Failed to add as series:', {
            error: seriesError,
            message: seriesError instanceof Error ? seriesError.message : String(seriesError),
            code: (seriesError as any)?.code,
            details: (seriesError as any)?.details,
            hint: (seriesError as any)?.hint,
            categoryId,
            itemId
          });
          throw seriesError;
        }
      } else {
        console.log('Item is a content item, adding to category_content table...');
        try {
          await categoryContentService.addContentToCategory(categoryId, itemId, sortOrder);
          console.log('✅ Successfully added as content item:', { categoryId, itemId });
        } catch (contentError) {
          console.error('❌ Failed to add as content item:', {
            error: contentError,
            message: contentError instanceof Error ? contentError.message : String(contentError),
            code: (contentError as any)?.code,
            details: (contentError as any)?.details,
            hint: (contentError as any)?.hint,
            categoryId,
            itemId
          });
          throw contentError;
        }
      }
      
      console.log('Invalidating categories cache...');
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
      console.log('✅ Categories cache invalidated successfully');
    } catch (err) {
      console.error('❌ Final error in addContentToCategory:', {
        error: err,
        message: err instanceof Error ? err.message : String(err),
        code: (err as any)?.code,
        details: (err as any)?.details,
        hint: (err as any)?.hint,
        categoryId,
        itemId,
        stack: err instanceof Error ? err.stack : undefined
      });
      throw err;
    }
  };

  const removeContentFromCategory = async (categoryId: string, itemId: string) => {
    console.log('Starting removeContentFromCategory:', { categoryId, itemId });
    
    try {
      const category = categories.find(c => c.id === categoryId);
      if (!category) {
        throw new Error(`Category with id ${categoryId} not found`);
      }
      
      // Find the item to determine its type
      const itemToRemove = category.items.find(item => item.id === itemId);
      if (!itemToRemove) {
        console.log('⚠️ Item not found in category:', { categoryId, itemId });
        return; // Item doesn't exist, no need to remove
      }
      
      console.log('Found item to remove:', { itemType: itemToRemove.itemType, title: itemToRemove.title });
      
      // Determine if this is a content item or series
      const isSeries = series.some(s => s.id === itemId);
      
      if (isSeries || itemToRemove.itemType === 'series') {
        console.log('Removing series from category_series table...');
        try {
          await categorySeriesService.removeSeriesFromCategory(categoryId, itemId);
          console.log('✅ Successfully removed series:', { categoryId, itemId });
        } catch (seriesError) {
          console.error('❌ Failed to remove series:', {
            error: seriesError,
            message: seriesError instanceof Error ? seriesError.message : String(seriesError),
            code: (seriesError as any)?.code,
            details: (seriesError as any)?.details,
            categoryId,
            itemId
          });
          throw seriesError;
        }
      } else {
        console.log('Removing content item from category_content table...');
        try {
          await categoryContentService.removeContentFromCategory(categoryId, itemId);
          console.log('✅ Successfully removed content item:', { categoryId, itemId });
        } catch (contentError) {
          console.error('❌ Failed to remove content item:', {
            error: contentError,
            message: contentError instanceof Error ? contentError.message : String(contentError),
            code: (contentError as any)?.code,
            details: (contentError as any)?.details,
            categoryId,
            itemId
          });
          throw contentError;
        }
      }
      
      console.log('Invalidating categories cache...');
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
      console.log('✅ Categories cache invalidated successfully');
    } catch (err) {
      console.error('❌ Final error in removeContentFromCategory:', {
        error: err,
        message: err instanceof Error ? err.message : String(err),
        code: (err as any)?.code,
        details: (err as any)?.details,
        hint: (err as any)?.hint,
        categoryId,
        itemId,
        stack: err instanceof Error ? err.stack : undefined
      });
      throw err;
    }
  };

  const reorderContentInCategory = async (categoryId: string, newOrder: CategoryItem[]) => {
    try {
      // Update sort_order in database
      const updates = newOrder.map((item, index) => 
        categoryContentService.updateContentOrder(categoryId, item.id, index)
      );
      
      await Promise.all(updates);
      // Invalidate cache to refetch
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
    } catch (err) {
      console.error('Error reordering content:', err);
      throw err;
    }
  };

  return {
    categories,
    loading,
    error: error?.message || null,
    refresh,
    addCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    addContentToCategory,
    removeContentFromCategory,
    reorderContentInCategory
  };
}
