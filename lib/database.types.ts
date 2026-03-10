export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string
          user_id: string
          user_type: 'free' | 'subscriber' | 'admin' | 'staff'
          signup_status: 'pending' | 'complete'
          display_name: string | null
          avatar_url: string | null
          bio: string | null
          preferred_calendar_type: 'new' | 'old'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          user_type?: 'free' | 'subscriber' | 'admin'
          signup_status?: 'pending' | 'complete'
          display_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          preferred_calendar_type?: 'new' | 'old'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          user_type?: 'free' | 'subscriber' | 'admin'
          signup_status?: 'pending' | 'complete'
          display_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          preferred_calendar_type?: 'new' | 'old'
          created_at?: string
          updated_at?: string
        }
      }
      playback_progress: {
        Row: {
          id: string
          user_id: string
          content_id: string
          current_time_seconds: number
          duration: number
          percentage_watched: number
          last_updated: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          content_id: string
          current_time_seconds: number
          duration: number
          last_updated?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          content_id?: string
          current_time_seconds?: number
          duration?: number
          last_updated?: string
          created_at?: string
        }
      }
      user_playback_progress: {
        Row: {
          id: string
          user_id: string
          content_item_id: string
          current_position: number
          duration: number
          progress_percentage: number
          is_completed: boolean
          last_played: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          content_item_id: string
          current_position: number
          duration: number
          progress_percentage: number
          is_completed?: boolean
          last_played?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          content_item_id?: string
          current_position?: number
          duration?: number
          progress_percentage?: number
          is_completed?: boolean
          last_played?: string
          created_at?: string
          updated_at?: string
        }
      }
      stripe_customers: {
        Row: {
          id: string
          user_id: string
          stripe_customer_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          stripe_customer_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          stripe_customer_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      stripe_subscriptions: {
        Row: {
          id: string
          user_id: string
          stripe_subscription_id: string
          stripe_price_id: string
          status:
            | 'trialing'
            | 'active'
            | 'past_due'
            | 'canceled'
            | 'incomplete'
            | 'incomplete_expired'
            | 'unpaid'
            | 'paused'
          current_period_start: string | null
          current_period_end: string | null
          cancel_at: string | null
          canceled_at: string | null
          metadata: Record<string, any> | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          stripe_subscription_id: string
          stripe_price_id: string
          status?:
            | 'trialing'
            | 'active'
            | 'past_due'
            | 'canceled'
            | 'incomplete'
            | 'incomplete_expired'
            | 'unpaid'
            | 'paused'
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at?: string | null
          canceled_at?: string | null
          metadata?: Record<string, any> | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          stripe_subscription_id?: string
          stripe_price_id?: string
          status?:
            | 'trialing'
            | 'active'
            | 'past_due'
            | 'canceled'
            | 'incomplete'
            | 'incomplete_expired'
            | 'unpaid'
            | 'paused'
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at?: string | null
          canceled_at?: string | null
          metadata?: Record<string, any> | null
          created_at?: string
          updated_at?: string
        }
      }
      stripe_webhook_events: {
        Row: {
          id: string
          event_id: string
          event_type: string
          status: string
          payload: Record<string, any> | null
          created_at: string
          processed_at: string
        }
        Insert: {
          id?: string
          event_id: string
          event_type: string
          status: string
          payload?: Record<string, any> | null
          created_at?: string
          processed_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          event_type?: string
          status?: string
          payload?: Record<string, any> | null
          created_at?: string
          processed_at?: string
        }
      }
      categories: {
        Row: {
          id: string
          title: string
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      content_items: {
        Row: {
          id: string
          title: string
          description: string | null
          thumbnail_url: string | null
          content_url: string | null
          content_type: 'video' | 'audio'
          rating: 'G' | 'PG' | 'PG-13' | 'R' | 'NR'
          tags: string[] | null
          duration: string | null
          visibility: 'public' | 'unlisted' | 'private'
          monetization: boolean
          restrictions: string | null
          views: number
          comments_count: number
          upload_date: string
          created_at: string
          updated_at: string
          // Legacy Cloudflare Stream fields (kept for backward compatibility)
          cloudflare_stream_id: string | null
          stream_thumbnail_url: string | null
          stream_playback_url: string | null
          stream_status: 'pending' | 'processing' | 'ready' | 'failed' | null
          stream_metadata: any | null
          stream_analytics: any | null
          mux_asset_id: string | null
          mux_playback_id: string | null
          mux_upload_id: string | null
          mux_thumbnail_url: string | null
          original_filename: string | null
          new_calendar_date: string | null
          old_calendar_date: string | null
          saints: any | null
          is_free_episode: boolean
          short_id: string | null
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          thumbnail_url?: string | null
          content_url?: string | null
          content_type?: 'video' | 'audio'
          rating?: 'G' | 'PG' | 'PG-13' | 'R' | 'NR'
          tags?: string[] | null
          duration?: string | null
          visibility?: 'public' | 'unlisted' | 'private'
          monetization?: boolean
          restrictions?: string | null
          views?: number
          comments_count?: number
          upload_date?: string
          created_at?: string
          updated_at?: string
          // Legacy Cloudflare Stream fields (kept for backward compatibility)
          cloudflare_stream_id?: string | null
          stream_thumbnail_url?: string | null
          stream_playback_url?: string | null
          stream_status?: 'pending' | 'processing' | 'ready' | 'failed' | null
          stream_metadata?: any | null
          stream_analytics?: any | null
          mux_asset_id?: string | null
          mux_playback_id?: string | null
          mux_upload_id?: string | null
          mux_thumbnail_url?: string | null
          original_filename?: string | null
          is_free_episode?: boolean
          short_id?: string | null
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          thumbnail_url?: string | null
          content_url?: string | null
          content_type?: 'video' | 'audio'
          rating?: 'G' | 'PG' | 'PG-13' | 'R' | 'NR'
          tags?: string[] | null
          duration?: string | null
          visibility?: 'public' | 'unlisted' | 'private'
          monetization?: boolean
          restrictions?: string | null
          views?: number
          comments_count?: number
          upload_date?: string
          created_at?: string
          updated_at?: string
          // Legacy Cloudflare Stream fields (kept for backward compatibility)
          cloudflare_stream_id?: string | null
          stream_thumbnail_url?: string | null
          stream_playback_url?: string | null
          stream_status?: 'pending' | 'processing' | 'ready' | 'failed' | null
          stream_metadata?: any | null
          stream_analytics?: any | null
          mux_asset_id?: string | null
          mux_playback_id?: string | null
          mux_upload_id?: string | null
          mux_thumbnail_url?: string | null
          original_filename?: string | null
          new_calendar_date?: string | null
          old_calendar_date?: string | null
          saints?: any | null
          is_free_episode?: boolean
          short_id?: string | null
        }
      }
      series: {
        Row: {
          id: string
          title: string
          description: string | null
          thumbnail_url: string | null
          logo_url: string | null
          banner_url: string | null
          rating: 'G' | 'PG' | 'PG-13' | 'R' | 'NR'
          tags: string[] | null
          content_type: 'video' | 'audio'
          content_ids: string[] | null
          episodes_count: number
          is_daily_content: boolean
          is_premium: boolean
          slug: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          thumbnail_url?: string | null
          logo_url?: string | null
          banner_url?: string | null
          rating?: 'G' | 'PG' | 'PG-13' | 'R' | 'NR'
          tags?: string[] | null
          content_type?: 'video' | 'audio'
          content_ids?: string[] | null
          episodes_count?: number
          is_daily_content?: boolean
          is_premium?: boolean
          slug?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          thumbnail_url?: string | null
          logo_url?: string | null
          banner_url?: string | null
          rating?: 'G' | 'PG' | 'PG-13' | 'R' | 'NR'
          tags?: string[] | null
          content_type?: 'video' | 'audio'
          content_ids?: string[] | null
          episodes_count?: number
          is_daily_content?: boolean
          is_premium?: boolean
          slug?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      series_episodes: {
        Row: {
          id: string
          series_id: string
          content_item_id: string
          episode_number: number | null
          created_at: string
        }
        Insert: {
          id?: string
          series_id: string
          content_item_id: string
          episode_number?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          series_id?: string
          content_item_id?: string
          episode_number?: number | null
          created_at?: string
        }
      }
      category_content: {
        Row: {
          id: string
          category_id: string
          content_item_id: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          category_id: string
          content_item_id: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          category_id?: string
          content_item_id?: string
          sort_order?: number
          created_at?: string
        }
      }
      category_series: {
        Row: {
          id: string
          category_id: string
          series_id: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          category_id: string
          series_id: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          category_id?: string
          series_id?: string
          sort_order?: number
          created_at?: string
        }
      }
      carousel_items: {
        Row: {
          id: string
          series_id: string
          sort_order: number
          logo_url: string | null
          subtitle: string | null
          background_url: string | null
          background_urls: string[] | null
          is_active: boolean
          badges: string[] | null
          auto_badge_enabled: boolean
          enable_video_preview: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          series_id: string
          sort_order?: number
          logo_url?: string | null
          subtitle?: string | null
          background_url?: string | null
          background_urls?: string[] | null
          is_active?: boolean
          badges?: string[] | null
          auto_badge_enabled?: boolean
          enable_video_preview?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          series_id?: string
          sort_order?: number
          logo_url?: string | null
          subtitle?: string | null
          background_url?: string | null
          background_urls?: string[] | null
          is_active?: boolean
          badges?: string[] | null
          auto_badge_enabled?: boolean
          enable_video_preview?: boolean
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}

// Helper types for our application
export type Category = Database['public']['Tables']['categories']['Row']
export type ContentItem = Database['public']['Tables']['content_items']['Row']
export type Series = Database['public']['Tables']['series']['Row']
export type SeriesEpisode = Database['public']['Tables']['series_episodes']['Row']
export type CategoryContent = Database['public']['Tables']['category_content']['Row']
export type CategorySeries = Database['public']['Tables']['category_series']['Row']
export type CarouselItem = Database['public']['Tables']['carousel_items']['Row']
export type StripeCustomer = Database['public']['Tables']['stripe_customers']['Row']
export type StripeSubscription = Database['public']['Tables']['stripe_subscriptions']['Row']
export type StripeWebhookEvent = Database['public']['Tables']['stripe_webhook_events']['Row']

export type CategoryInsert = Database['public']['Tables']['categories']['Insert']
export type ContentItemInsert = Database['public']['Tables']['content_items']['Insert']
export type SeriesInsert = Database['public']['Tables']['series']['Insert']
export type SeriesEpisodeInsert = Database['public']['Tables']['series_episodes']['Insert']
export type CategoryContentInsert = Database['public']['Tables']['category_content']['Insert']
export type CategorySeriesInsert = Database['public']['Tables']['category_series']['Insert']
export type CarouselItemInsert = Database['public']['Tables']['carousel_items']['Insert']
export type StripeCustomerInsert = Database['public']['Tables']['stripe_customers']['Insert']
export type StripeSubscriptionInsert = Database['public']['Tables']['stripe_subscriptions']['Insert']
export type StripeWebhookEventInsert = Database['public']['Tables']['stripe_webhook_events']['Insert']

export type CategoryUpdate = Database['public']['Tables']['categories']['Update']
export type ContentItemUpdate = Database['public']['Tables']['content_items']['Update']
export type SeriesUpdate = Database['public']['Tables']['series']['Update']
export type SeriesEpisodeUpdate = Database['public']['Tables']['series_episodes']['Update']
export type CategoryContentUpdate = Database['public']['Tables']['category_content']['Update']
export type CategorySeriesUpdate = Database['public']['Tables']['category_series']['Update']
export type CarouselItemUpdate = Database['public']['Tables']['carousel_items']['Update']
export type StripeCustomerUpdate = Database['public']['Tables']['stripe_customers']['Update']
export type StripeSubscriptionUpdate = Database['public']['Tables']['stripe_subscriptions']['Update']
export type StripeWebhookEventUpdate = Database['public']['Tables']['stripe_webhook_events']['Update']

