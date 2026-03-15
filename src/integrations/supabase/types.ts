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
      budget_items: {
        Row: {
          budget_id: string
          category: string
          client_days: number
          client_people: number
          client_price: number
          client_unit_price: number
          created_at: string
          id: string
          item_name: string
          margin_percent: number | null
          margin_value: number | null
          order_index: number | null
          quantity: number
          supplier_cost: number
          supplier_days: number
          supplier_people: number
          supplier_unit_price: number
          unit_type: string | null
        }
        Insert: {
          budget_id: string
          category: string
          client_days?: number
          client_people?: number
          client_price?: number
          client_unit_price?: number
          created_at?: string
          id?: string
          item_name: string
          margin_percent?: number | null
          margin_value?: number | null
          order_index?: number | null
          quantity?: number
          supplier_cost?: number
          supplier_days?: number
          supplier_people?: number
          supplier_unit_price?: number
          unit_type?: string | null
        }
        Update: {
          budget_id?: string
          category?: string
          client_days?: number
          client_people?: number
          client_price?: number
          client_unit_price?: number
          created_at?: string
          id?: string
          item_name?: string
          margin_percent?: number | null
          margin_value?: number | null
          order_index?: number | null
          quantity?: number
          supplier_cost?: number
          supplier_days?: number
          supplier_people?: number
          supplier_unit_price?: number
          unit_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_settings: {
        Row: {
          bv_options: string[]
          commission_default: number
          created_at: string
          id: string
          markup_default: number
          tax_default: number
          updated_at: string
        }
        Insert: {
          bv_options?: string[]
          commission_default?: number
          created_at?: string
          id?: string
          markup_default?: number
          tax_default?: number
          updated_at?: string
        }
        Update: {
          bv_options?: string[]
          commission_default?: number
          created_at?: string
          id?: string
          markup_default?: number
          tax_default?: number
          updated_at?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          addition: number
          bv_percent: number
          bv_value: number | null
          client_name: string
          commission_percent: number
          commission_value: number | null
          created_at: string
          created_by: string | null
          discount: number
          id: string
          margin_percent: number | null
          margin_value: number | null
          markup_percent: number
          project_name: string
          status: string
          subtotal_1: number | null
          subtotal_2: number | null
          tax_percent: number
          tax_value: number | null
          total_value: number | null
          updated_at: string
        }
        Insert: {
          addition?: number
          bv_percent?: number
          bv_value?: number | null
          client_name: string
          commission_percent?: number
          commission_value?: number | null
          created_at?: string
          created_by?: string | null
          discount?: number
          id?: string
          margin_percent?: number | null
          margin_value?: number | null
          markup_percent?: number
          project_name: string
          status?: string
          subtotal_1?: number | null
          subtotal_2?: number | null
          tax_percent?: number
          tax_value?: number | null
          total_value?: number | null
          updated_at?: string
        }
        Update: {
          addition?: number
          bv_percent?: number
          bv_value?: number | null
          client_name?: string
          commission_percent?: number
          commission_value?: number | null
          created_at?: string
          created_by?: string | null
          discount?: number
          id?: string
          margin_percent?: number | null
          margin_value?: number | null
          markup_percent?: number
          project_name?: string
          status?: string
          subtotal_1?: number | null
          subtotal_2?: number | null
          tax_percent?: number
          tax_value?: number | null
          total_value?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      conta_azul_cache: {
        Row: {
          data_type: string
          fetched_at: string
          id: string
          payload: Json | null
          period: string | null
        }
        Insert: {
          data_type: string
          fetched_at?: string
          id?: string
          payload?: Json | null
          period?: string | null
        }
        Update: {
          data_type?: string
          fetched_at?: string
          id?: string
          payload?: Json | null
          period?: string | null
        }
        Relationships: []
      }
      project_costs: {
        Row: {
          amount: number
          budget_id: string
          budget_item_id: string | null
          category: string | null
          created_at: string
          description: string | null
          id: string
          payment_date: string | null
          sent_to_conta_azul: boolean
          supplier: string | null
        }
        Insert: {
          amount?: number
          budget_id: string
          budget_item_id?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          payment_date?: string | null
          sent_to_conta_azul?: boolean
          supplier?: string | null
        }
        Update: {
          amount?: number
          budget_id?: string
          budget_item_id?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          payment_date?: string | null
          sent_to_conta_azul?: boolean
          supplier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_costs_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_costs_budget_item_id_fkey"
            columns: ["budget_item_id"]
            isOneToOne: false
            referencedRelation: "budget_items"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_name: string
          created_at: string
          delivery_date: string | null
          direct_costs: number | null
          gross_margin_percent: number | null
          gross_margin_value: number | null
          id: string
          name: string
          notes: string | null
          sold_date: string | null
          sold_value: number | null
          status: string
        }
        Insert: {
          client_name: string
          created_at?: string
          delivery_date?: string | null
          direct_costs?: number | null
          gross_margin_percent?: number | null
          gross_margin_value?: number | null
          id?: string
          name: string
          notes?: string | null
          sold_date?: string | null
          sold_value?: number | null
          status?: string
        }
        Update: {
          client_name?: string
          created_at?: string
          delivery_date?: string | null
          direct_costs?: number | null
          gross_margin_percent?: number | null
          gross_margin_value?: number | null
          id?: string
          name?: string
          notes?: string | null
          sold_date?: string | null
          sold_value?: number | null
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
