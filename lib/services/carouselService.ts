import { supabase, supabaseAdmin } from '../supabase';
import { CarouselItem, CarouselItemInsert, CarouselItemUpdate, Series } from '../database.types';

export interface CarouselItemWithSeries extends CarouselItem {
  series: Series;
}

export interface CarouselItemDisplay {
  id: string;
  series_id: string;
  title: string;
  subtitle: string | null;
  logo_url: string | null;
  background_url: string | null;
  badges: string[] | null;
  auto_badge_enabled: boolean;
  sort_order: number;
  is_active: boolean;
  series: Series;
}

export const carouselService = {
  /**
   * Get all active carousel items with series data for public display
   */
  async getCarouselItems(): Promise<CarouselItemDisplay[]> {
    const { data, error } = await supabase
      .from('carousel_items')
      .select(`
        *,
        series (*)
      `)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return (data || []).map((item: any) => ({
      id: item.id,
      series_id: item.series_id,
      title: item.series.title,
      subtitle: item.subtitle || item.series.description || null,
      logo_url: item.logo_url || item.series.logo_url || null,
      background_url: item.background_url || item.series.banner_url || null,
      background_urls: item.background_urls || null,
      badges: item.badges || null,
      auto_badge_enabled: item.auto_badge_enabled || false,
      enable_video_preview: item.enable_video_preview || false,
      sort_order: item.sort_order,
      is_active: item.is_active,
      series: item.series,
    }));
  },

  /**
   * Get all carousel items (including inactive) for admin dashboard
   */
  async getAllCarouselItems(): Promise<CarouselItemWithSeries[]> {
    const { data, error } = await supabaseAdmin
      .from('carousel_items')
      .select(`
        *,
        series (*)
      `)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /**
   * Create a new carousel item
   */
  async createCarouselItem(item: CarouselItemInsert): Promise<CarouselItemWithSeries> {
    // Get the current max sort_order to set the new item's order
    const { data: existingItems } = await supabaseAdmin
      .from('carousel_items')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1);

    const maxSortOrder = existingItems && existingItems.length > 0 
      ? existingItems[0].sort_order 
      : -1;

    const newItem: CarouselItemInsert = {
      ...item,
      sort_order: item.sort_order ?? maxSortOrder + 1,
    };

    const { data, error } = await supabaseAdmin
      .from('carousel_items')
      .insert(newItem)
      .select(`
        *,
        series (*)
      `)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update a carousel item
   */
  async updateCarouselItem(
    id: string,
    updates: CarouselItemUpdate
  ): Promise<CarouselItemWithSeries> {
    const { data, error } = await supabaseAdmin
      .from('carousel_items')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        series (*)
      `)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Delete a carousel item
   */
  async deleteCarouselItem(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('carousel_items')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Reorder carousel items
   */
  async reorderCarouselItems(ids: string[]): Promise<void> {
    const updates = ids.map((id, index) => ({
      id,
      sort_order: index,
    }));

    // Update each item's sort_order
    for (const update of updates) {
      const { error } = await supabaseAdmin
        .from('carousel_items')
        .update({ sort_order: update.sort_order })
        .eq('id', update.id);

      if (error) throw error;
    }
  },
};

