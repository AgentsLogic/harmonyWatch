import { supabase, supabaseAdmin } from './supabase'
import { 
  Category, 
  ContentItem, 
  Series, 
  CategoryInsert, 
  ContentItemInsert, 
  SeriesInsert,
  CategoryUpdate,
  ContentItemUpdate,
  SeriesUpdate
} from './database.types'

// Categories
export const categoriesService = {
  async getAll(): Promise<Category[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true })
    
    if (error) throw error
    return data || []
  },

  async getAllWithContent(): Promise<any[]> {
    const { data, error } = await supabase
      .from('categories')
      .select(`
        *,
        category_content(
          sort_order,
          content_items(*)
        ),
        category_series(
          sort_order,
          series(*)
        )
      `)
      .order('sort_order', { ascending: true })
    
    if (error) throw error
    
    // Transform the data to a more usable format
    return (data || []).map(category => {
      // Combine content items and series, sorted by their sort_order
      const contentItems = (category.category_content || [])
        .map((cc: any) => ({
          id: cc.content_items.id,
          title: cc.content_items.title,
          description: cc.content_items.description,
          thumbnail: cc.content_items.thumbnail_url || '/images/content-1.png',
          sort_order: cc.sort_order,
          badge: cc.content_items.monetization ? 'Premium' : 'Free',
          isNew: false,
          type: cc.content_items.content_type,
          rating: cc.content_items.rating,
          tags: cc.content_items.tags,
          content_type: cc.content_items.content_type, // Include content type for individual content items
          itemType: 'content' // Mark as content item
        }));

      const seriesItems = (category.category_series || [])
        .map((cs: any) => ({
          id: cs.series.id,
          title: cs.series.title,
          description: cs.series.description,
          thumbnail: cs.series.thumbnail_url && cs.series.thumbnail_url !== '/images/series-thumbnail.png' ? cs.series.thumbnail_url : '/images/content-1.png',
          sort_order: cs.sort_order,
          badge: 'Series', // Mark as series
          isNew: false,
          type: 'series',
          rating: cs.series.rating,
          tags: cs.series.tags,
          logo_url: cs.series.logo_url, // Include series logo URL
          banner_url: cs.series.banner_url, // Include series banner URL
          content_type: cs.series.content_type, // Include content type
          slug: cs.series.slug || null, // Include series slug for URL routing
          itemType: 'series' // Mark as series
        }));

      // Combine and sort all items by sort_order
      const allItems = [...contentItems, ...seriesItems]
        .sort((a: any, b: any) => a.sort_order - b.sort_order);

      return {
        id: category.id,
        title: category.title,
        sort_order: category.sort_order,
        items: allItems
      };
    })
  },

  async create(category: CategoryInsert): Promise<Category> {
    const { data, error } = await supabaseAdmin
      .from('categories')
      .insert(category)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  async update(id: string, updates: CategoryUpdate): Promise<Category> {
    const { data, error } = await supabaseAdmin
      .from('categories')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('categories')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  }
}

// Content Items
export const contentItemsService = {
  async getAll(): Promise<ContentItem[]> {
    const { data, error } = await supabase
      .from('content_items')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data || []
  },

  async getById(id: string): Promise<ContentItem | null> {
    const { data, error } = await supabase
      .from('content_items')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return null; // No rows found
      throw error
    }
    return data
  },

  async getByCategory(categoryId: string): Promise<ContentItem[]> {
    const { data, error } = await supabase
      .from('content_items')
      .select(`
        *,
        category_content!inner(category_id, sort_order)
      `)
      .eq('category_content.category_id', categoryId)
      .order('sort_order', { ascending: true })
    
    if (error) throw error
    return data || []
  },

  async getPublicVideos(): Promise<ContentItem[]> {
    const { data, error } = await supabase
      .from('content_items')
      .select('*')
      .eq('visibility', 'public')
      .eq('content_type', 'video')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data || []
  },

  async getByShortId(shortId: string): Promise<ContentItem | null> {
    const { data, error } = await supabase
      .from('content_items')
      .select('*')
      .eq('short_id', shortId)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return null; // No rows found
      throw error
    }
    return data
  },

  async create(contentItem: ContentItemInsert): Promise<ContentItem> {
    // Handle JSONB fields explicitly - ensure saints is properly formatted
    const insertData: any = { ...contentItem };
    
    // Generate short_id if not provided
    if (!insertData.short_id) {
      const { generateShortId } = await import('./utils/short-id');
      let shortId: string;
      let attempts = 0;
      
      // Generate unique short_id (retry if collision)
      do {
        shortId = generateShortId();
        // Use .maybeSingle() instead of .single() to avoid 406 error when no row exists
        const { data: existing } = await supabaseAdmin
          .from('content_items')
          .select('id')
          .eq('short_id', shortId)
          .maybeSingle();
        
        if (!existing) break; // No collision, use this ID
        
        attempts++;
        if (attempts > 10) {
          // Fallback: use timestamp-based ID if too many collisions
          shortId = Date.now().toString(36).slice(-7);
        }
      } while (attempts <= 10);
      
      insertData.short_id = shortId;
    }
    
    // If saints exists, ensure it's a valid JSON array for JSONB column
    if (insertData.saints !== undefined && insertData.saints !== null) {
      // If it's already an array, keep it; otherwise ensure it's an array
      if (!Array.isArray(insertData.saints)) {
        insertData.saints = [];
      }
      // If empty array, don't include the field (let database use default)
      if (insertData.saints.length === 0) {
        delete insertData.saints;
      } else {
        // Ensure each item is a plain object (not a class instance)
        insertData.saints = insertData.saints.map((saint: any) => ({
          name: String(saint.name || ''),
          picture_url: saint.picture_url ? String(saint.picture_url) : null,
          biography: String(saint.biography || '')
        }));
      }
    } else {
      // If undefined or null, don't include the field
      delete insertData.saints;
    }
    
    const { data, error } = await supabaseAdmin
      .from('content_items')
      .insert(insertData)
      .select()
      .single()
    
    if (error) {
      console.error('Supabase insert error details:');
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Error details:', error.details);
      console.error('Error hint:', error.hint);
      console.error('Insert data (sanitized):', JSON.stringify({
        ...insertData,
        saints: insertData.saints ? `${insertData.saints.length} items` : 'not included'
      }, null, 2));
      throw error;
    }
    return data
  },

  async update(id: string, updates: ContentItemUpdate): Promise<ContentItem> {
    const { data, error } = await supabaseAdmin
      .from('content_items')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('content_items')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  },

  async updateByStreamId(streamId: string, updates: any): Promise<ContentItem> {
    const { data, error } = await supabaseAdmin
      .from('content_items')
      .update(updates)
      .eq('cloudflare_stream_id', streamId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Legacy function - no longer used since we migrated to Mux
  // async createWithStream(streamData: {...}): Promise<ContentItem> { ... }
}

// Series
export const seriesService = {
  async getAll(): Promise<Series[]> {
    const { data, error } = await supabase
      .from('series')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data || []
  },

  async getById(id: string): Promise<Series | null> {
    const { data, error } = await supabase
      .from('series')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return null; // No rows found
      throw error
    }
    return data
  },

  async getBySlug(slug: string): Promise<Series | null> {
    const { data, error } = await supabase
      .from('series')
      .select('*')
      .eq('slug', slug)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return null; // No rows found
      throw error
    }
    return data
  },

  async create(series: SeriesInsert): Promise<Series> {
    const { data, error } = await supabaseAdmin
      .from('series')
      .insert(series)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  async update(id: string, updates: SeriesUpdate): Promise<Series> {
    const { data, error } = await supabaseAdmin
      .from('series')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('series')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  },

  async getSeriesWithContent(seriesId: string): Promise<any> {
    // First get the series to get content_ids
    const { data: seriesData, error: seriesError } = await supabase
      .from('series')
      .select('*')
      .eq('id', seriesId)
      .single()
    
    if (seriesError) throw seriesError
    if (!seriesData?.content_ids || seriesData.content_ids.length === 0) {
      return { ...seriesData, content_items: [] }
    }

    // Then fetch all content items in a single query using the content_ids array
    const { data: contentData, error: contentError } = await supabase
      .from('content_items')
      .select('*')
      .in('id', seriesData.content_ids)
      .order('created_at', { ascending: true })
    
    if (contentError) throw contentError
    
    return {
      ...seriesData,
      content_items: contentData || []
    }
  }
}

// Category-Series Relationships
export const categorySeriesService = {
  async addSeriesToCategory(categoryId: string, seriesId: string, sortOrder: number = 0): Promise<void> {
    console.log('categorySeriesService.addSeriesToCategory called with:', { categoryId, seriesId, sortOrder });
    
    const { data, error } = await supabaseAdmin
      .from('category_series')
      .insert({
        category_id: categoryId,
        series_id: seriesId,
        sort_order: sortOrder
      })
      .select()
    
    if (error) {
      // Handle duplicate key constraint gracefully
      if (error.code === '23505') {
        console.log('Series already exists in category, skipping insert:', { categoryId, seriesId });
        return; // Don't throw error for duplicates, just skip
      }
      
      console.error('categorySeriesService.addSeriesToCategory error:', {
        error,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        categoryId,
        seriesId,
        sortOrder
      });
      throw error;
    }
    
    console.log('categorySeriesService.addSeriesToCategory success:', { data });
  },

  async removeSeriesFromCategory(categoryId: string, seriesId: string): Promise<void> {
    console.log('categorySeriesService.removeSeriesFromCategory called with:', { categoryId, seriesId });
    
    const { data, error } = await supabaseAdmin
      .from('category_series')
      .delete()
      .eq('category_id', categoryId)
      .eq('series_id', seriesId)
      .select()
    
    if (error) {
      console.error('categorySeriesService.removeSeriesFromCategory error:', {
        error,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        categoryId,
        seriesId
      });
      throw error;
    }
    
    console.log('categorySeriesService.removeSeriesFromCategory success:', { data });
  },

  async updateSeriesOrder(categoryId: string, seriesId: string, sortOrder: number): Promise<void> {
    const { error } = await supabaseAdmin
      .from('category_series')
      .update({ sort_order: sortOrder })
      .eq('category_id', categoryId)
      .eq('series_id', seriesId)
    
    if (error) throw error
  }
}

// Category-Content Relationships
export const categoryContentService = {
  async addContentToCategory(categoryId: string, contentItemId: string, sortOrder: number = 0): Promise<void> {
    console.log('categoryContentService.addContentToCategory called with:', { categoryId, contentItemId, sortOrder });
    
    const { data, error } = await supabaseAdmin
      .from('category_content')
      .insert({
        category_id: categoryId,
        content_item_id: contentItemId,
        sort_order: sortOrder
      })
      .select()
    
    if (error) {
      // Handle duplicate key constraint gracefully
      if (error.code === '23505') {
        console.log('Content item already exists in category, skipping insert:', { categoryId, contentItemId });
        return; // Don't throw error for duplicates, just skip
      }
      
      console.error('categoryContentService.addContentToCategory error:', {
        error,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        categoryId,
        contentItemId,
        sortOrder
      });
      throw error;
    }
    
    console.log('categoryContentService.addContentToCategory success:', { data });
  },

  async removeContentFromCategory(categoryId: string, contentItemId: string): Promise<void> {
    console.log('categoryContentService.removeContentFromCategory called with:', { categoryId, contentItemId });
    
    const { data, error } = await supabaseAdmin
      .from('category_content')
      .delete()
      .eq('category_id', categoryId)
      .eq('content_item_id', contentItemId)
      .select()
    
    if (error) {
      console.error('categoryContentService.removeContentFromCategory error:', {
        error,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        categoryId,
        contentItemId
      });
      throw error;
    }
    
    console.log('categoryContentService.removeContentFromCategory success:', { data });
  },

  async updateContentOrder(categoryId: string, contentItemId: string, sortOrder: number): Promise<void> {
    const { error } = await supabaseAdmin
      .from('category_content')
      .update({ sort_order: sortOrder })
      .eq('category_id', categoryId)
      .eq('content_item_id', contentItemId)
    
    if (error) throw error
  }
}

// ============================================================================
// DEPRECATED: Series-Episode Relationships (using junction table)
// ============================================================================
// This service is no longer used. We now store content_ids directly in the 
// series table as an array field for simplicity.
// The series_episodes table can be dropped from the database if no longer needed.
// ============================================================================
/*
export const seriesEpisodesService = {
  // ... old code removed for clarity ...
}
*/

