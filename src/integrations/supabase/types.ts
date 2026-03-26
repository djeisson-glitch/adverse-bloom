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
      budget_item_suppliers: {
        Row: {
          budget_id: string
          budget_item_id: string
          created_at: string | null
          days: number | null
          id: string
          notes: string | null
          people: number | null
          supplier_name: string
          total: number | null
          unit_price: number | null
        }
        Insert: {
          budget_id: string
          budget_item_id: string
          created_at?: string | null
          days?: number | null
          id?: string
          notes?: string | null
          people?: number | null
          supplier_name: string
          total?: number | null
          unit_price?: number | null
        }
        Update: {
          budget_id?: string
          budget_item_id?: string
          created_at?: string | null
          days?: number | null
          id?: string
          notes?: string | null
          people?: number | null
          supplier_name?: string
          total?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_item_suppliers_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_item_suppliers_budget_item_id_fkey"
            columns: ["budget_item_id"]
            isOneToOne: false
            referencedRelation: "budget_items"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_items: {
        Row: {
          budget_id: string
          category: string
          client_days: number
          client_people: number
          client_price: number
          client_unit_price: number
          created_at: string
          has_supplier_cost: boolean
          id: string
          is_deliverable: boolean
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
          has_supplier_cost?: boolean
          id?: string
          is_deliverable?: boolean
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
          has_supplier_cost?: boolean
          id?: string
          is_deliverable?: boolean
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
      budget_preset_items: {
        Row: {
          category: string
          client_days: number
          client_people: number
          client_unit_price: number
          created_at: string | null
          has_supplier_cost: boolean
          id: string
          item_name: string
          supplier_days: number
          supplier_people: number
          supplier_unit_price: number
        }
        Insert: {
          category: string
          client_days?: number
          client_people?: number
          client_unit_price?: number
          created_at?: string | null
          has_supplier_cost?: boolean
          id?: string
          item_name: string
          supplier_days?: number
          supplier_people?: number
          supplier_unit_price?: number
        }
        Update: {
          category?: string
          client_days?: number
          client_people?: number
          client_unit_price?: number
          created_at?: string | null
          has_supplier_cost?: boolean
          id?: string
          item_name?: string
          supplier_days?: number
          supplier_people?: number
          supplier_unit_price?: number
        }
        Relationships: []
      }
      budget_settings: {
        Row: {
          bv_options: string[]
          commission_default: number
          commission_djeisson_enabled: boolean
          commission_djeisson_percent: number
          commission_robert_enabled: boolean
          commission_robert_percent: number
          created_at: string
          id: string
          markup_default: number
          tax_default: number
          updated_at: string
        }
        Insert: {
          bv_options?: string[]
          commission_default?: number
          commission_djeisson_enabled?: boolean
          commission_djeisson_percent?: number
          commission_robert_enabled?: boolean
          commission_robert_percent?: number
          created_at?: string
          id?: string
          markup_default?: number
          tax_default?: number
          updated_at?: string
        }
        Update: {
          bv_options?: string[]
          commission_default?: number
          commission_djeisson_enabled?: boolean
          commission_djeisson_percent?: number
          commission_robert_enabled?: boolean
          commission_robert_percent?: number
          created_at?: string
          id?: string
          markup_default?: number
          tax_default?: number
          updated_at?: string
        }
        Relationships: []
      }
      budget_targets: {
        Row: {
          annual_target: number
          auto_calculated: boolean | null
          created_at: string | null
          id: string
          q1_percent: number
          q2_percent: number
          q3_percent: number
          q4_percent: number
          updated_at: string | null
          year: number
        }
        Insert: {
          annual_target?: number
          auto_calculated?: boolean | null
          created_at?: string | null
          id?: string
          q1_percent?: number
          q2_percent?: number
          q3_percent?: number
          q4_percent?: number
          updated_at?: string | null
          year: number
        }
        Update: {
          annual_target?: number
          auto_calculated?: boolean | null
          created_at?: string | null
          id?: string
          q1_percent?: number
          q2_percent?: number
          q3_percent?: number
          q4_percent?: number
          updated_at?: string | null
          year?: number
        }
        Relationships: []
      }
      budgets: {
        Row: {
          addition: number
          budget_number: number | null
          bv_percent: number
          bv_value: number | null
          client_id: string | null
          client_name: string
          commission_percent: number
          commission_value: number | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          discount: number
          id: string
          is_latest_version: boolean
          margin_percent: number | null
          margin_value: number | null
          markup_percent: number
          not_included: Json | null
          parent_budget_id: string | null
          project_name: string
          proposal_name: string | null
          status: string
          subtotal_1: number | null
          subtotal_2: number | null
          tax_percent: number
          tax_value: number | null
          total_value: number | null
          updated_at: string
          version: number
          version_notes: string | null
        }
        Insert: {
          addition?: number
          budget_number?: number | null
          bv_percent?: number
          bv_value?: number | null
          client_id?: string | null
          client_name: string
          commission_percent?: number
          commission_value?: number | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          discount?: number
          id?: string
          is_latest_version?: boolean
          margin_percent?: number | null
          margin_value?: number | null
          markup_percent?: number
          not_included?: Json | null
          parent_budget_id?: string | null
          project_name: string
          proposal_name?: string | null
          status?: string
          subtotal_1?: number | null
          subtotal_2?: number | null
          tax_percent?: number
          tax_value?: number | null
          total_value?: number | null
          updated_at?: string
          version?: number
          version_notes?: string | null
        }
        Update: {
          addition?: number
          budget_number?: number | null
          bv_percent?: number
          bv_value?: number | null
          client_id?: string | null
          client_name?: string
          commission_percent?: number
          commission_value?: number | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          discount?: number
          id?: string
          is_latest_version?: boolean
          margin_percent?: number | null
          margin_value?: number | null
          markup_percent?: number
          not_included?: Json | null
          parent_budget_id?: string | null
          project_name?: string
          proposal_name?: string | null
          status?: string
          subtotal_1?: number | null
          subtotal_2?: number | null
          tax_percent?: number
          tax_value?: number | null
          total_value?: number | null
          updated_at?: string
          version?: number
          version_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budgets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_parent_budget_id_fkey"
            columns: ["parent_budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          company: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          origin: string | null
          phone: string | null
          segment: string | null
          trade_name: string | null
          type: string
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          origin?: string | null
          phone?: string | null
          segment?: string | null
          trade_name?: string | null
          type?: string
        }
        Update: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          origin?: string | null
          phone?: string | null
          segment?: string | null
          trade_name?: string | null
          type?: string
        }
        Relationships: []
      }
      commercial_settings: {
        Row: {
          created_at: string
          followup_lost_days: number
          followup_won_days: number
          id: string
          loss_reasons: Json
          monthly_target: number
          pipeline_stages: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          followup_lost_days?: number
          followup_won_days?: number
          id?: string
          loss_reasons?: Json
          monthly_target?: number
          pipeline_stages?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          followup_lost_days?: number
          followup_won_days?: number
          id?: string
          loss_reasons?: Json
          monthly_target?: number
          pipeline_stages?: Json
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
      deals: {
        Row: {
          client_id: string | null
          created_at: string | null
          created_by: string | null
          expected_close_date: string | null
          id: string
          lost_reason: string | null
          notes: string | null
          probability: number | null
          stage: string
          title: string
          updated_at: string | null
          value: number | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_close_date?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          probability?: number | null
          stage?: string
          title: string
          updated_at?: string | null
          value?: number | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_close_date?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          probability?: number | null
          stage?: string
          title?: string
          updated_at?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      memories: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      project_costs: {
        Row: {
          amount: number
          budget_id: string
          budget_item_id: string | null
          category: string | null
          conta_azul_id: string | null
          created_at: string
          description: string | null
          id: string
          payment_date: string | null
          sent_to_conta_azul: boolean
          service_date: string | null
          status: string
          supplier: string | null
          supplier_doc: string | null
          supplier_name: string | null
        }
        Insert: {
          amount?: number
          budget_id: string
          budget_item_id?: string | null
          category?: string | null
          conta_azul_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          payment_date?: string | null
          sent_to_conta_azul?: boolean
          service_date?: string | null
          status?: string
          supplier?: string | null
          supplier_doc?: string | null
          supplier_name?: string | null
        }
        Update: {
          amount?: number
          budget_id?: string
          budget_item_id?: string | null
          category?: string | null
          conta_azul_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          payment_date?: string | null
          sent_to_conta_azul?: boolean
          service_date?: string | null
          status?: string
          supplier?: string | null
          supplier_doc?: string | null
          supplier_name?: string | null
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
          client_id: string | null
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
          client_id?: string | null
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
          client_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_letters: {
        Row: {
          approved_at: string | null
          approved_email: string | null
          approved_ip: string | null
          approved_name: string | null
          budget_id: string
          contact_company: string
          contact_name: string
          created_at: string
          created_by: string | null
          deliverables: Json | null
          id: string
          payment_conditions: string | null
          project_description: string | null
          status: string
          tags: string[] | null
          template_type: string
          token: string
          updated_at: string
          validity_days: number | null
          viewed_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_email?: string | null
          approved_ip?: string | null
          approved_name?: string | null
          budget_id: string
          contact_company?: string
          contact_name?: string
          created_at?: string
          created_by?: string | null
          deliverables?: Json | null
          id?: string
          payment_conditions?: string | null
          project_description?: string | null
          status?: string
          tags?: string[] | null
          template_type?: string
          token?: string
          updated_at?: string
          validity_days?: number | null
          viewed_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_email?: string | null
          approved_ip?: string | null
          approved_name?: string | null
          budget_id?: string
          contact_company?: string
          contact_name?: string
          created_at?: string
          created_by?: string | null
          deliverables?: Json | null
          id?: string
          payment_conditions?: string | null
          project_description?: string | null
          status?: string
          tags?: string[] | null
          template_type?: string
          token?: string
          updated_at?: string
          validity_days?: number | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_letters_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_templates: {
        Row: {
          bv_default: number | null
          categories: Json
          commission_default: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          markup_default: number | null
          name: string
          not_included: Json | null
          tax_default: number | null
        }
        Insert: {
          bv_default?: number | null
          categories?: Json
          commission_default?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          markup_default?: number | null
          name: string
          not_included?: Json | null
          tax_default?: number | null
        }
        Update: {
          bv_default?: number | null
          categories?: Json
          commission_default?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          markup_default?: number | null
          name?: string
          not_included?: Json | null
          tax_default?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          client_id: string | null
          created_at: string | null
          deal_id: string | null
          id: string
          margin_percent: number | null
          number: string | null
          status: string
          title: string
          total_value: number | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          id?: string
          margin_percent?: number | null
          number?: string | null
          status?: string
          title: string
          total_value?: number | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          id?: string
          margin_percent?: number | null
          number?: string | null
          status?: string
          title?: string
          total_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_contacts: {
        Row: {
          created_at: string | null
          document: string | null
          id: string
          is_generic: boolean | null
          last_used_at: string | null
          name: string
          type: string | null
        }
        Insert: {
          created_at?: string | null
          document?: string | null
          id?: string
          is_generic?: boolean | null
          last_used_at?: string | null
          name: string
          type?: string | null
        }
        Update: {
          created_at?: string | null
          document?: string | null
          id?: string
          is_generic?: boolean | null
          last_used_at?: string | null
          name?: string
          type?: string | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          amount: number
          budget_id: string
          budget_item_id: string | null
          conta_azul_id: string | null
          created_at: string
          id: string
          payment_date: string | null
          sent_to_conta_azul: boolean
          status: string
          supplier_doc: string | null
          supplier_name: string
          updated_at: string
        }
        Insert: {
          amount?: number
          budget_id: string
          budget_item_id?: string | null
          conta_azul_id?: string | null
          created_at?: string
          id?: string
          payment_date?: string | null
          sent_to_conta_azul?: boolean
          status?: string
          supplier_doc?: string | null
          supplier_name: string
          updated_at?: string
        }
        Update: {
          amount?: number
          budget_id?: string
          budget_item_id?: string | null
          conta_azul_id?: string | null
          created_at?: string
          id?: string
          payment_date?: string | null
          sent_to_conta_azul?: boolean
          status?: string
          supplier_doc?: string | null
          supplier_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_budget_item_id_fkey"
            columns: ["budget_item_id"]
            isOneToOne: false
            referencedRelation: "budget_items"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          client_id: string | null
          completed: boolean
          completed_at: string | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          due_date: string | null
          id: string
          title: string
        }
        Insert: {
          client_id?: string | null
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          due_date?: string | null
          id?: string
          title: string
        }
        Update: {
          client_id?: string | null
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          due_date?: string | null
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          id: string
          module: string
          permission: Database["public"]["Enums"]["permission_level"]
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          module: string
          permission?: Database["public"]["Enums"]["permission_level"]
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          module?: string
          permission?: Database["public"]["Enums"]["permission_level"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_permission: {
        Args: {
          _min_level: Database["public"]["Enums"]["permission_level"]
          _module: string
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_budget_number: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "admin" | "manager" | "operator"
      permission_level: "none" | "view" | "edit"
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
      app_role: ["admin", "manager", "operator"],
      permission_level: ["none", "view", "edit"],
    },
  },
} as const
