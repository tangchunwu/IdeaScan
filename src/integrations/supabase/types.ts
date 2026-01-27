export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_ai: boolean | null
          likes_count: number | null
          parent_id: string | null
          persona_id: string | null
          user_id: string | null
          validation_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_ai?: boolean | null
          likes_count?: number | null
          parent_id?: string | null
          persona_id?: string | null
          user_id?: string | null
          validation_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_ai?: boolean | null
          likes_count?: number | null
          parent_id?: string | null
          persona_id?: string | null
          user_id?: string | null
          validation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_validation_id_fkey"
            columns: ["validation_id"]
            isOneToOne: false
            referencedRelation: "validations"
            referencedColumns: ["id"]
          },
        ]
      }
      niche_opportunities: {
        Row: {
          avg_opportunity_score: number | null
          category: string | null
          created_at: string
          description: string | null
          discovered_at: string
          id: string
          keyword: string
          market_size_est: string | null
          signal_count: number
          title: string
          top_sources: string[] | null
          updated_at: string
          urgency_score: number
        }
        Insert: {
          avg_opportunity_score?: number | null
          category?: string | null
          created_at?: string
          description?: string | null
          discovered_at?: string
          id?: string
          keyword: string
          market_size_est?: string | null
          signal_count?: number
          title: string
          top_sources?: string[] | null
          updated_at?: string
          urgency_score?: number
        }
        Update: {
          avg_opportunity_score?: number | null
          category?: string | null
          created_at?: string
          description?: string | null
          discovered_at?: string
          id?: string
          keyword?: string
          market_size_est?: string | null
          signal_count?: number
          title?: string
          top_sources?: string[] | null
          updated_at?: string
          urgency_score?: number
        }
        Relationships: []
      }
      personas: {
        Row: {
          avatar_url: string | null
          catchphrase: string | null
          created_at: string | null
          focus_areas: string[] | null
          id: string
          is_active: boolean | null
          name: string
          personality: string | null
          role: string
          system_prompt: string
        }
        Insert: {
          avatar_url?: string | null
          catchphrase?: string | null
          created_at?: string | null
          focus_areas?: string[] | null
          id?: string
          is_active?: boolean | null
          name: string
          personality?: string | null
          role: string
          system_prompt: string
        }
        Update: {
          avatar_url?: string | null
          catchphrase?: string | null
          created_at?: string | null
          focus_areas?: string[] | null
          id?: string
          is_active?: boolean | null
          name?: string
          personality?: string | null
          role?: string
          system_prompt?: string
        }
        Relationships: []
      }
      rate_limit_entries: {
        Row: {
          created_at: string
          endpoint: string
          id: number
          request_count: number
          updated_at: string
          user_id: string
          window_start: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: number
          request_count?: number
          updated_at?: string
          user_id: string
          window_start: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: number
          request_count?: number
          updated_at?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      raw_market_signals: {
        Row: {
          author_name: string | null
          comments_count: number
          content: string
          content_hash: string | null
          content_type: string
          id: string
          likes_count: number
          opportunity_score: number | null
          pain_level: string | null
          processed_at: string | null
          scanned_at: string
          sentiment_score: number | null
          source: string
          source_id: string | null
          source_url: string | null
          topic_tags: string[] | null
        }
        Insert: {
          author_name?: string | null
          comments_count?: number
          content: string
          content_hash?: string | null
          content_type?: string
          id?: string
          likes_count?: number
          opportunity_score?: number | null
          pain_level?: string | null
          processed_at?: string | null
          scanned_at?: string
          sentiment_score?: number | null
          source: string
          source_id?: string | null
          source_url?: string | null
          topic_tags?: string[] | null
        }
        Update: {
          author_name?: string | null
          comments_count?: number
          content?: string
          content_hash?: string | null
          content_type?: string
          id?: string
          likes_count?: number
          opportunity_score?: number | null
          pain_level?: string | null
          processed_at?: string | null
          scanned_at?: string
          sentiment_score?: number | null
          source?: string
          source_id?: string | null
          source_url?: string | null
          topic_tags?: string[] | null
        }
        Relationships: []
      }
      scan_jobs: {
        Row: {
          created_at: string
          created_by: string
          frequency: string
          id: string
          keywords: string[]
          last_run_at: string | null
          next_run_at: string | null
          platforms: string[]
          signals_found: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          frequency?: string
          id?: string
          keywords: string[]
          last_run_at?: string | null
          next_run_at?: string | null
          platforms?: string[]
          signals_found?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          frequency?: string
          id?: string
          keywords?: string[]
          last_run_at?: string | null
          next_run_at?: string | null
          platforms?: string[]
          signals_found?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      trending_topics: {
        Row: {
          avg_engagement: number | null
          category: string | null
          click_count: number | null
          created_by: string | null
          discovered_at: string
          expires_at: string
          growth_rate: number | null
          heat_score: number
          id: string
          is_active: boolean
          keyword: string
          priority_score: number | null
          related_keywords: string[] | null
          sample_count: number
          sentiment_negative: number | null
          sentiment_neutral: number | null
          sentiment_positive: number | null
          sources: Json | null
          top_pain_points: string[] | null
          updated_at: string
          validate_count: number | null
        }
        Insert: {
          avg_engagement?: number | null
          category?: string | null
          click_count?: number | null
          created_by?: string | null
          discovered_at?: string
          expires_at?: string
          growth_rate?: number | null
          heat_score?: number
          id?: string
          is_active?: boolean
          keyword: string
          priority_score?: number | null
          related_keywords?: string[] | null
          sample_count?: number
          sentiment_negative?: number | null
          sentiment_neutral?: number | null
          sentiment_positive?: number | null
          sources?: Json | null
          top_pain_points?: string[] | null
          updated_at?: string
          validate_count?: number | null
        }
        Update: {
          avg_engagement?: number | null
          category?: string | null
          click_count?: number | null
          created_by?: string | null
          discovered_at?: string
          expires_at?: string
          growth_rate?: number | null
          heat_score?: number
          id?: string
          is_active?: boolean
          keyword?: string
          priority_score?: number | null
          related_keywords?: string[] | null
          sample_count?: number
          sentiment_negative?: number | null
          sentiment_neutral?: number | null
          sentiment_positive?: number | null
          sources?: Json | null
          top_pain_points?: string[] | null
          updated_at?: string
          validate_count?: number | null
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          id: string
          settings_encrypted: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          settings_encrypted?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          settings_encrypted?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_topic_clicks: {
        Row: {
          click_type: string
          created_at: string | null
          id: string
          keyword: string
          topic_id: string | null
          user_id: string
        }
        Insert: {
          click_type: string
          created_at?: string | null
          id?: string
          keyword: string
          topic_id?: string | null
          user_id: string
        }
        Update: {
          click_type?: string
          created_at?: string | null
          id?: string
          keyword?: string
          topic_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_topic_clicks_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "trending_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      user_topic_interests: {
        Row: {
          created_at: string
          id: string
          interest_type: string
          topic_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          interest_type: string
          topic_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          interest_type?: string
          topic_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_topic_interests_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "trending_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      validation_reports: {
        Row: {
          ai_analysis: Json | null
          competitor_data: Json | null
          created_at: string
          data_quality_score: number | null
          data_summary: Json | null
          dimensions: Json | null
          id: string
          keywords_used: Json | null
          market_analysis: Json | null
          persona: Json | null
          sentiment_analysis: Json | null
          validation_id: string
          xiaohongshu_data: Json | null
        }
        Insert: {
          ai_analysis?: Json | null
          competitor_data?: Json | null
          created_at?: string
          data_quality_score?: number | null
          data_summary?: Json | null
          dimensions?: Json | null
          id?: string
          keywords_used?: Json | null
          market_analysis?: Json | null
          persona?: Json | null
          sentiment_analysis?: Json | null
          validation_id: string
          xiaohongshu_data?: Json | null
        }
        Update: {
          ai_analysis?: Json | null
          competitor_data?: Json | null
          created_at?: string
          data_quality_score?: number | null
          data_summary?: Json | null
          dimensions?: Json | null
          id?: string
          keywords_used?: Json | null
          market_analysis?: Json | null
          persona?: Json | null
          sentiment_analysis?: Json | null
          validation_id?: string
          xiaohongshu_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "validation_reports_validation_id_fkey"
            columns: ["validation_id"]
            isOneToOne: false
            referencedRelation: "validations"
            referencedColumns: ["id"]
          },
        ]
      }
      validations: {
        Row: {
          created_at: string
          id: string
          idea: string
          overall_score: number | null
          status: Database["public"]["Enums"]["validation_status"]
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idea: string
          overall_score?: number | null
          status?: Database["public"]["Enums"]["validation_status"]
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idea?: string
          overall_score?: number | null
          status?: Database["public"]["Enums"]["validation_status"]
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_rate_limit: {
        Args: {
          p_endpoint: string
          p_max_requests: number
          p_user_id: string
          p_window_seconds: number
        }
        Returns: boolean
      }
      is_validation_owner: { Args: { validation_id: string }; Returns: boolean }
    }
    Enums: {
      validation_status: "pending" | "processing" | "completed" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      validation_status: ["pending", "processing", "completed", "failed"],
    },
  },
} as const
