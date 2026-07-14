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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      allowed_emails: {
        Row: {
          created_at: string
          custo_hora: number | null
          email: string
          funcao: string | null
          funcao_id: string | null
          funcoes: string[]
          horas_semana: number
          nome: string | null
          nota: string | null
          papel: Database["public"]["Enums"]["app_role"]
          usado_em: string | null
        }
        Insert: {
          created_at?: string
          custo_hora?: number | null
          email: string
          funcao?: string | null
          funcao_id?: string | null
          funcoes?: string[]
          horas_semana?: number
          nome?: string | null
          nota?: string | null
          papel?: Database["public"]["Enums"]["app_role"]
          usado_em?: string | null
        }
        Update: {
          created_at?: string
          custo_hora?: number | null
          email?: string
          funcao?: string | null
          funcao_id?: string | null
          funcoes?: string[]
          horas_semana?: number
          nome?: string | null
          nota?: string | null
          papel?: Database["public"]["Enums"]["app_role"]
          usado_em?: string | null
        }
        Relationships: []
      }
      approval_settings: {
        Row: {
          cliente_aprova: boolean
          id: boolean
          nivel1_user_id: string | null
          nivel2_user_id: string | null
          updated_at: string
        }
        Insert: {
          cliente_aprova?: boolean
          id?: boolean
          nivel1_user_id?: string | null
          nivel2_user_id?: string | null
          updated_at?: string
        }
        Update: {
          cliente_aprova?: boolean
          id?: boolean
          nivel1_user_id?: string | null
          nivel2_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      budget_categorias: {
        Row: {
          codigo: string
          created_at: string
          id: string
          nome: string
          ordem: number
          sistema: boolean
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          sistema?: boolean
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          sistema?: boolean
        }
        Relationships: []
      }
      budget_composicao_horas: {
        Row: {
          budget_id: string
          created_at: string
          custo_hora: number
          funcao_id: string | null
          funcao_nome: string
          horas: number
          id: string
          ordem: number
          preco_hora: number
        }
        Insert: {
          budget_id: string
          created_at?: string
          custo_hora?: number
          funcao_id?: string | null
          funcao_nome: string
          horas?: number
          id?: string
          ordem?: number
          preco_hora?: number
        }
        Update: {
          budget_id?: string
          created_at?: string
          custo_hora?: number
          funcao_id?: string | null
          funcao_nome?: string
          horas?: number
          id?: string
          ordem?: number
          preco_hora?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_composicao_horas_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_composicao_horas_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["budget_id"]
          },
          {
            foreignKeyName: "budget_composicao_horas_funcao_id_fkey"
            columns: ["funcao_id"]
            isOneToOne: false
            referencedRelation: "rate_card"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_custos_diretos: {
        Row: {
          budget_id: string
          created_at: string
          descricao: string
          id: string
          ordem: number
          valor: number
        }
        Insert: {
          budget_id: string
          created_at?: string
          descricao: string
          id?: string
          ordem?: number
          valor?: number
        }
        Update: {
          budget_id?: string
          created_at?: string
          descricao?: string
          id?: string
          ordem?: number
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_custos_diretos_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_custos_diretos_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["budget_id"]
          },
        ]
      }
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
            foreignKeyName: "budget_item_suppliers_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["budget_id"]
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
      budget_item_templates: {
        Row: {
          categoria_codigo: string
          custo_unitario: number
          descricao: string
          id: string
          no_medio: boolean
          ordem: number
          valor_unitario: number
        }
        Insert: {
          categoria_codigo: string
          custo_unitario?: number
          descricao: string
          id?: string
          no_medio?: boolean
          ordem?: number
          valor_unitario?: number
        }
        Update: {
          categoria_codigo?: string
          custo_unitario?: number
          descricao?: string
          id?: string
          no_medio?: boolean
          ordem?: number
          valor_unitario?: number
        }
        Relationships: []
      }
      budget_items: {
        Row: {
          budget_id: string
          categoria_id: string | null
          category: string
          client_days: number
          client_people: number
          client_price: number
          client_unit_price: number
          created_at: string
          custo_unitario: number
          delivery_duration: string | null
          delivery_formats: string[] | null
          descricao: string | null
          diaria: number | null
          group_name: string | null
          has_supplier_cost: boolean
          id: string
          is_deliverable: boolean
          item_name: string
          margin_percent: number | null
          margin_value: number | null
          observacoes: string | null
          ordem: number
          order_index: number | null
          quantity: number
          supplier_cost: number
          supplier_days: number
          supplier_people: number
          supplier_unit_price: number
          tira_taxa: boolean
          unit_type: string | null
        }
        Insert: {
          budget_id: string
          categoria_id?: string | null
          category?: string
          client_days?: number
          client_people?: number
          client_price?: number
          client_unit_price?: number
          created_at?: string
          custo_unitario?: number
          delivery_duration?: string | null
          delivery_formats?: string[] | null
          descricao?: string | null
          diaria?: number | null
          group_name?: string | null
          has_supplier_cost?: boolean
          id?: string
          is_deliverable?: boolean
          item_name: string
          margin_percent?: number | null
          margin_value?: number | null
          observacoes?: string | null
          ordem?: number
          order_index?: number | null
          quantity?: number
          supplier_cost?: number
          supplier_days?: number
          supplier_people?: number
          supplier_unit_price?: number
          tira_taxa?: boolean
          unit_type?: string | null
        }
        Update: {
          budget_id?: string
          categoria_id?: string | null
          category?: string
          client_days?: number
          client_people?: number
          client_price?: number
          client_unit_price?: number
          created_at?: string
          custo_unitario?: number
          delivery_duration?: string | null
          delivery_formats?: string[] | null
          descricao?: string | null
          diaria?: number | null
          group_name?: string | null
          has_supplier_cost?: boolean
          id?: string
          is_deliverable?: boolean
          item_name?: string
          margin_percent?: number | null
          margin_value?: number | null
          observacoes?: string | null
          ordem?: number
          order_index?: number | null
          quantity?: number
          supplier_cost?: number
          supplier_days?: number
          supplier_people?: number
          supplier_unit_price?: number
          tira_taxa?: boolean
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
          {
            foreignKeyName: "budget_items_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["budget_id"]
          },
          {
            foreignKeyName: "budget_items_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "budget_categorias"
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
          group_name: string | null
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
          group_name?: string | null
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
          group_name?: string | null
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
          aprovacoes: Json
          aprovada_em: string | null
          aprovada_por: Json | null
          budget_number: number | null
          bv_percent: number
          bv_value: number | null
          capture_days: number
          categorias_ocultas: Json
          client_id: string | null
          client_name: string
          comissao_base: string
          comissoes: Json
          commission_percent: number
          commission_value: number | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          direcao_cena_percent: number
          discount: number
          entregas: Json
          id: string
          imposto_percent: number
          internal_notes: string | null
          is_latest_version: boolean
          margem_produtora_percent: number
          margin_percent: number | null
          margin_value: number | null
          markup_percent: number
          not_included: Json | null
          notas: string | null
          parent_budget_id: string | null
          project_count: number
          project_name: string
          proposal_name: string | null
          proposta: Json
          public_token: string | null
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
          aprovacoes?: Json
          aprovada_em?: string | null
          aprovada_por?: Json | null
          budget_number?: number | null
          bv_percent?: number
          bv_value?: number | null
          capture_days?: number
          categorias_ocultas?: Json
          client_id?: string | null
          client_name: string
          comissao_base?: string
          comissoes?: Json
          commission_percent?: number
          commission_value?: number | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          direcao_cena_percent?: number
          discount?: number
          entregas?: Json
          id?: string
          imposto_percent?: number
          internal_notes?: string | null
          is_latest_version?: boolean
          margem_produtora_percent?: number
          margin_percent?: number | null
          margin_value?: number | null
          markup_percent?: number
          not_included?: Json | null
          notas?: string | null
          parent_budget_id?: string | null
          project_count?: number
          project_name: string
          proposal_name?: string | null
          proposta?: Json
          public_token?: string | null
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
          aprovacoes?: Json
          aprovada_em?: string | null
          aprovada_por?: Json | null
          budget_number?: number | null
          bv_percent?: number
          bv_value?: number | null
          capture_days?: number
          categorias_ocultas?: Json
          client_id?: string | null
          client_name?: string
          comissao_base?: string
          comissoes?: Json
          commission_percent?: number
          commission_value?: number | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          direcao_cena_percent?: number
          discount?: number
          entregas?: Json
          id?: string
          imposto_percent?: number
          internal_notes?: string | null
          is_latest_version?: boolean
          margem_produtora_percent?: number
          margin_percent?: number | null
          margin_value?: number | null
          markup_percent?: number
          not_included?: Json | null
          notas?: string | null
          parent_budget_id?: string | null
          project_count?: number
          project_name?: string
          proposal_name?: string | null
          proposta?: Json
          public_token?: string | null
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
            foreignKeyName: "budgets_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "budgets_parent_budget_id_fkey"
            columns: ["parent_budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_parent_budget_id_fkey"
            columns: ["parent_budget_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["budget_id"]
          },
        ]
      }
      clickup_cache: {
        Row: {
          data_type: string
          fetched_at: string
          payload: Json | null
        }
        Insert: {
          data_type: string
          fetched_at?: string
          payload?: Json | null
        }
        Update: {
          data_type?: string
          fetched_at?: string
          payload?: Json | null
        }
        Relationships: []
      }
      client_portal_tokens: {
        Row: {
          ativo: boolean
          client_id: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          token: string
          ultimo_acesso: string | null
        }
        Insert: {
          ativo?: boolean
          client_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          token: string
          ultimo_acesso?: string | null
        }
        Update: {
          ativo?: boolean
          client_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          token?: string
          ultimo_acesso?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          company: string | null
          contact_name: string | null
          created_at: string | null
          email: string | null
          id: string
          intake_alteracoes_media: number
          intake_ativo: boolean
          intake_edit_horas: number
          intake_editor_id: string | null
          intake_revisao_horas: number
          intake_slug: string | null
          marca_briefing: Json | null
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
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          intake_alteracoes_media?: number
          intake_ativo?: boolean
          intake_edit_horas?: number
          intake_editor_id?: string | null
          intake_revisao_horas?: number
          intake_slug?: string | null
          marca_briefing?: Json | null
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
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          intake_alteracoes_media?: number
          intake_ativo?: boolean
          intake_edit_horas?: number
          intake_editor_id?: string | null
          intake_revisao_horas?: number
          intake_slug?: string | null
          marca_briefing?: Json | null
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
      comments: {
        Row: {
          body: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          mentions: string[]
          user_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          mentions?: string[]
          user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          mentions?: string[]
          user_id?: string | null
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
      contas_fees: {
        Row: {
          ativo: boolean
          balde_mensal: number | null
          client_id: string
          created_at: string
          id: string
          moeda: string
          nome: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          balde_mensal?: number | null
          client_id: string
          created_at?: string
          id?: string
          moeda?: string
          nome: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          balde_mensal?: number | null
          client_id?: string
          created_at?: string
          id?: string
          moeda?: string
          nome?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_fees_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_recorrentes: {
        Row: {
          ativo: boolean
          cliente: string
          created_at: string
          id: string
          observacao: string | null
          valor_mensal: number
        }
        Insert: {
          ativo?: boolean
          cliente: string
          created_at?: string
          id?: string
          observacao?: string | null
          valor_mensal?: number
        }
        Update: {
          ativo?: boolean
          cliente?: string
          created_at?: string
          id?: string
          observacao?: string | null
          valor_mensal?: number
        }
        Relationships: []
      }
      deals: {
        Row: {
          canal_entrada: string | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          expected_close_date: string | null
          formatos: string[]
          id: string
          local_filmagem: string | null
          lost_at: string | null
          lost_reason: string | null
          meios_veiculacao: string[]
          mergulho: Json
          mergulho_em: string | null
          mergulho_enviado_em: string | null
          mergulho_token: string | null
          moeda: string
          notes: string | null
          numero: string | null
          objetivo: string | null
          origin: string | null
          porte: string
          precisa_elenco: string | null
          precisa_roteiro: string | null
          probability: number | null
          stage: string
          tipo_orcamento: string | null
          title: string
          updated_at: string | null
          valor_final_aprovado: number | null
          valor_proposta: number | null
          value: number | null
          verba_estimada: number | null
          won_at: string | null
        }
        Insert: {
          canal_entrada?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_close_date?: string | null
          formatos?: string[]
          id?: string
          local_filmagem?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          meios_veiculacao?: string[]
          mergulho?: Json
          mergulho_em?: string | null
          mergulho_enviado_em?: string | null
          mergulho_token?: string | null
          moeda?: string
          notes?: string | null
          numero?: string | null
          objetivo?: string | null
          origin?: string | null
          porte?: string
          precisa_elenco?: string | null
          precisa_roteiro?: string | null
          probability?: number | null
          stage?: string
          tipo_orcamento?: string | null
          title: string
          updated_at?: string | null
          valor_final_aprovado?: number | null
          valor_proposta?: number | null
          value?: number | null
          verba_estimada?: number | null
          won_at?: string | null
        }
        Update: {
          canal_entrada?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_close_date?: string | null
          formatos?: string[]
          id?: string
          local_filmagem?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          meios_veiculacao?: string[]
          mergulho?: Json
          mergulho_em?: string | null
          mergulho_enviado_em?: string | null
          mergulho_token?: string | null
          moeda?: string
          notes?: string | null
          numero?: string | null
          objetivo?: string | null
          origin?: string | null
          porte?: string
          precisa_elenco?: string | null
          precisa_roteiro?: string | null
          probability?: number | null
          stage?: string
          tipo_orcamento?: string | null
          title?: string
          updated_at?: string | null
          valor_final_aprovado?: number | null
          valor_proposta?: number | null
          value?: number | null
          verba_estimada?: number | null
          won_at?: string | null
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
          {
            foreignKeyName: "deals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_capacidade_semana"
            referencedColumns: ["user_id"]
          },
        ]
      }
      deliverable_alteracoes: {
        Row: {
          arquivo_url: string | null
          created_at: string
          criado_por: string | null
          deliverable_id: string
          descricao: string | null
          id: string
          numero: number
          origem: string
          prazo: string | null
          resolved_at: string | null
          responsavel_id: string | null
          status: string
          titulo: string
        }
        Insert: {
          arquivo_url?: string | null
          created_at?: string
          criado_por?: string | null
          deliverable_id: string
          descricao?: string | null
          id?: string
          numero?: number
          origem?: string
          prazo?: string | null
          resolved_at?: string | null
          responsavel_id?: string | null
          status?: string
          titulo: string
        }
        Update: {
          arquivo_url?: string | null
          created_at?: string
          criado_por?: string | null
          deliverable_id?: string
          descricao?: string | null
          id?: string
          numero?: number
          origem?: string
          prazo?: string | null
          resolved_at?: string | null
          responsavel_id?: string | null
          status?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverable_alteracoes_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverables: {
        Row: {
          aprovado_cliente_em: string | null
          aprovado_cliente_por: string | null
          aprovado_em: string | null
          aprovado_n1_em: string | null
          aprovado_n1_por: string | null
          aprovado_n2_em: string | null
          aprovado_n2_por: string | null
          aprovado_por: string | null
          aprovador_id: string | null
          arquivo_url: string | null
          codigo: string | null
          created_at: string
          data_entrega: string | null
          descricao: string | null
          duracao: string | null
          formato: string | null
          id: string
          ordem: number
          pasta_renders: string | null
          prazo_interno: string | null
          project_id: string
          responsavel_id: string | null
          revisoes_internas: number
          status: string
          tipo: string
          titulo: string
          updated_at: string
          visivel_cliente: boolean
        }
        Insert: {
          aprovado_cliente_em?: string | null
          aprovado_cliente_por?: string | null
          aprovado_em?: string | null
          aprovado_n1_em?: string | null
          aprovado_n1_por?: string | null
          aprovado_n2_em?: string | null
          aprovado_n2_por?: string | null
          aprovado_por?: string | null
          aprovador_id?: string | null
          arquivo_url?: string | null
          codigo?: string | null
          created_at?: string
          data_entrega?: string | null
          descricao?: string | null
          duracao?: string | null
          formato?: string | null
          id?: string
          ordem?: number
          pasta_renders?: string | null
          prazo_interno?: string | null
          project_id: string
          responsavel_id?: string | null
          revisoes_internas?: number
          status?: string
          tipo?: string
          titulo: string
          updated_at?: string
          visivel_cliente?: boolean
        }
        Update: {
          aprovado_cliente_em?: string | null
          aprovado_cliente_por?: string | null
          aprovado_em?: string | null
          aprovado_n1_em?: string | null
          aprovado_n1_por?: string | null
          aprovado_n2_em?: string | null
          aprovado_n2_por?: string | null
          aprovado_por?: string | null
          aprovador_id?: string | null
          arquivo_url?: string | null
          codigo?: string | null
          created_at?: string
          data_entrega?: string | null
          descricao?: string | null
          duracao?: string | null
          formato?: string | null
          id?: string
          ordem?: number
          pasta_renders?: string | null
          prazo_interno?: string | null
          project_id?: string
          responsavel_id?: string | null
          revisoes_internas?: number
          status?: string
          tipo?: string
          titulo?: string
          updated_at?: string
          visivel_cliente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "deliverables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "deliverables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidade_projeto"
            referencedColumns: ["project_id"]
          },
        ]
      }
      demandas: {
        Row: {
          anexos: Json
          client_id: string | null
          created_at: string
          entregas: Json
          ia_complexidade: Json | null
          id: string
          nome_projeto: string
          prazo_desejado: string | null
          projeto_id: string | null
          solicitante_email: string
          solicitante_nome: string
          status: string
          viabilidade: Json | null
        }
        Insert: {
          anexos?: Json
          client_id?: string | null
          created_at?: string
          entregas?: Json
          ia_complexidade?: Json | null
          id?: string
          nome_projeto: string
          prazo_desejado?: string | null
          projeto_id?: string | null
          solicitante_email: string
          solicitante_nome: string
          status?: string
          viabilidade?: Json | null
        }
        Update: {
          anexos?: Json
          client_id?: string | null
          created_at?: string
          entregas?: Json
          ia_complexidade?: Json | null
          id?: string
          nome_projeto?: string
          prazo_desejado?: string | null
          projeto_id?: string | null
          solicitante_email?: string
          solicitante_nome?: string
          status?: string
          viabilidade?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "demandas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "demandas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projects_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidade_projeto"
            referencedColumns: ["project_id"]
          },
        ]
      }
      empresa_contexto: {
        Row: {
          estrutura: string | null
          headcount: number | null
          horas_produtivas_mes: number | null
          id: number
          meta_faturamento_mensal: number | null
          meta_margem_liquida: number | null
          observacoes: string | null
          prioridades: string | null
          saldo_inicial: number | null
          saldo_inicial_data: string | null
          sazonalidade: string | null
          updated_at: string
        }
        Insert: {
          estrutura?: string | null
          headcount?: number | null
          horas_produtivas_mes?: number | null
          id?: number
          meta_faturamento_mensal?: number | null
          meta_margem_liquida?: number | null
          observacoes?: string | null
          prioridades?: string | null
          saldo_inicial?: number | null
          saldo_inicial_data?: string | null
          sazonalidade?: string | null
          updated_at?: string
        }
        Update: {
          estrutura?: string | null
          headcount?: number | null
          horas_produtivas_mes?: number | null
          id?: number
          meta_faturamento_mensal?: number | null
          meta_margem_liquida?: number | null
          observacoes?: string | null
          prioridades?: string | null
          saldo_inicial?: number | null
          saldo_inicial_data?: string | null
          sazonalidade?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      follow_ups: {
        Row: {
          concluido_em: string | null
          created_at: string
          data_prevista: string
          deal_id: string | null
          descricao: string | null
          id: string
          responsavel_id: string | null
          status: string
          tipo: string
        }
        Insert: {
          concluido_em?: string | null
          created_at?: string
          data_prevista: string
          deal_id?: string | null
          descricao?: string | null
          id?: string
          responsavel_id?: string | null
          status?: string
          tipo: string
        }
        Update: {
          concluido_em?: string | null
          created_at?: string
          data_prevista?: string
          deal_id?: string | null
          descricao?: string | null
          id?: string
          responsavel_id?: string | null
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      google_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          google_email: string | null
          id: string
          refresh_token: string
          team_member_id: string
          updated_at: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          google_email?: string | null
          id?: string
          refresh_token: string
          team_member_id: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          google_email?: string | null
          id?: string
          refresh_token?: string
          team_member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_tokens_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: true
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_id: string | null
          conta_azul_id: string | null
          created_at: string
          created_by: string | null
          data_emissao: string
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string | null
          id: string
          moeda: string
          numero: string | null
          project_id: string | null
          status: string
          updated_at: string
          valor: number
        }
        Insert: {
          client_id?: string | null
          conta_azul_id?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          id?: string
          moeda?: string
          numero?: string | null
          project_id?: string | null
          status?: string
          updated_at?: string
          valor?: number
        }
        Update: {
          client_id?: string | null
          conta_azul_id?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          id?: string
          moeda?: string
          numero?: string | null
          project_id?: string | null
          status?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidade_projeto"
            referencedColumns: ["project_id"]
          },
        ]
      }
      job_allocations: {
        Row: {
          allocation_date: string
          budget_id: string
          created_at: string
          created_by: string | null
          description: string | null
          end_time: string | null
          google_calendar_event_id: string | null
          id: string
          location: string | null
          role_function: string | null
          start_time: string | null
          team_member_id: string
          updated_at: string
        }
        Insert: {
          allocation_date: string
          budget_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          google_calendar_event_id?: string | null
          id?: string
          location?: string | null
          role_function?: string | null
          start_time?: string | null
          team_member_id: string
          updated_at?: string
        }
        Update: {
          allocation_date?: string
          budget_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          google_calendar_event_id?: string | null
          id?: string
          location?: string | null
          role_function?: string | null
          start_time?: string | null
          team_member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_allocations_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_allocations_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["budget_id"]
          },
          {
            foreignKeyName: "job_allocations_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_interacoes: {
        Row: {
          created_at: string
          data: string
          descricao: string | null
          id: string
          lead_id: string
          tipo: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          data?: string
          descricao?: string | null
          id?: string
          lead_id: string
          tipo?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          data?: string
          descricao?: string | null
          id?: string
          lead_id?: string
          tipo?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_interacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          client_id: string | null
          created_at: string
          deal_id: string | null
          email: string | null
          empresa: string | null
          id: string
          nome: string
          observacoes: string | null
          origem: string | null
          proximo_toque: string | null
          responsavel_id: string | null
          status: string
          telefone: string | null
          temperatura: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          deal_id?: string | null
          email?: string | null
          empresa?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          origem?: string | null
          proximo_toque?: string | null
          responsavel_id?: string | null
          status?: string
          telefone?: string | null
          temperatura?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          deal_id?: string | null
          email?: string | null
          empresa?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          origem?: string | null
          proximo_toque?: string | null
          responsavel_id?: string | null
          status?: string
          telefone?: string | null
          temperatura?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["deal_id"]
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
      notificacoes: {
        Row: {
          corpo: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          lida_em: string | null
          link: string | null
          prioridade: string
          push_em: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          corpo?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          lida_em?: string | null
          link?: string | null
          prioridade?: string
          push_em?: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Update: {
          corpo?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          lida_em?: string | null
          link?: string | null
          prioridade?: string
          push_em?: string | null
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
      orcamento_padroes: {
        Row: {
          comissao_base: string
          comissoes: Json
          id: boolean
          imposto: number
          margem: number
          updated_at: string
        }
        Insert: {
          comissao_base?: string
          comissoes?: Json
          id?: boolean
          imposto?: number
          margem?: number
          updated_at?: string
        }
        Update: {
          comissao_base?: string
          comissoes?: Json
          id?: boolean
          imposto?: number
          margem?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          funcao: string | null
          funcao_id: string | null
          funcoes: string[]
          horas_semana: number
          id: string
          ultima_atividade: string | null
        }
        Insert: {
          ativo?: boolean
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          funcao?: string | null
          funcao_id?: string | null
          funcoes?: string[]
          horas_semana?: number
          id: string
          ultima_atividade?: string | null
        }
        Update: {
          ativo?: boolean
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          funcao?: string | null
          funcao_id?: string | null
          funcoes?: string[]
          horas_semana?: number
          id?: string
          ultima_atividade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_funcao_id_fkey"
            columns: ["funcao_id"]
            isOneToOne: false
            referencedRelation: "rate_card"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_custo: {
        Row: {
          custo_hora: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          custo_hora?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          custo_hora?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_custo_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_custo_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_capacidade_semana"
            referencedColumns: ["user_id"]
          },
        ]
      }
      project_closures: {
        Row: {
          closed_at: string
          closed_by: string | null
          custo_interno: number
          custo_total: number
          custos_externos: number
          horas_totais: number
          id: string
          margem_final: number
          margem_percent: number | null
          project_id: string
          valor_total: number
        }
        Insert: {
          closed_at?: string
          closed_by?: string | null
          custo_interno?: number
          custo_total?: number
          custos_externos?: number
          horas_totais?: number
          id?: string
          margem_final?: number
          margem_percent?: number | null
          project_id: string
          valor_total?: number
        }
        Update: {
          closed_at?: string
          closed_by?: string | null
          custo_interno?: number
          custo_total?: number
          custos_externos?: number
          horas_totais?: number
          id?: string
          margem_final?: number
          margem_percent?: number | null
          project_id?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_closures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "pipeline_completo"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_closures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_closures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_closures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "v_rentabilidade_projeto"
            referencedColumns: ["project_id"]
          },
        ]
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
          project_id: string | null
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
          project_id?: string | null
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
          project_id?: string | null
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
            foreignKeyName: "project_costs_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["budget_id"]
          },
          {
            foreignKeyName: "project_costs_budget_item_id_fkey"
            columns: ["budget_item_id"]
            isOneToOne: false
            referencedRelation: "budget_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_costs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_costs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_costs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_costs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidade_projeto"
            referencedColumns: ["project_id"]
          },
        ]
      }
      project_costs_lancados: {
        Row: {
          created_at: string
          created_by: string | null
          data: string
          descricao: string
          id: string
          project_id: string
          tipo: string
          valor: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: string
          descricao: string
          id?: string
          project_id: string
          tipo?: string
          valor?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string
          descricao?: string
          id?: string
          project_id?: string
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_costs_lancados_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_costs_lancados_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_costs_lancados_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_costs_lancados_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidade_projeto"
            referencedColumns: ["project_id"]
          },
        ]
      }
      project_documents: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          project_id: string
          titulo: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          project_id: string
          titulo: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string
          titulo?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidade_projeto"
            referencedColumns: ["project_id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          papel: string | null
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          papel?: string | null
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          papel?: string | null
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidade_projeto"
            referencedColumns: ["project_id"]
          },
        ]
      }
      projects: {
        Row: {
          aprovador_n1_id: string | null
          aprovador_n2_id: string | null
          billing_status: string
          briefing_consolidado: string | null
          budget_id: string | null
          clickup_task_id: string | null
          client_id: string | null
          client_name: string
          cliente_aprova: boolean | null
          conta_fee_id: string | null
          created_at: string
          deal_id: string | null
          delivery_date: string | null
          edicao_horas_mapeadas: number | null
          edicao_horas_vendidas: number | null
          escopo_vendido: string | null
          id: string
          name: string
          notes: string | null
          numero: string | null
          objetivos: string | null
          observacoes_cliente: string | null
          progress: number
          project_type: string | null
          restricoes: string | null
          sold_date: string | null
          start_date: string | null
          status: string
          workflow_id: string | null
        }
        Insert: {
          aprovador_n1_id?: string | null
          aprovador_n2_id?: string | null
          billing_status?: string
          briefing_consolidado?: string | null
          budget_id?: string | null
          clickup_task_id?: string | null
          client_id?: string | null
          client_name: string
          cliente_aprova?: boolean | null
          conta_fee_id?: string | null
          created_at?: string
          deal_id?: string | null
          delivery_date?: string | null
          edicao_horas_mapeadas?: number | null
          edicao_horas_vendidas?: number | null
          escopo_vendido?: string | null
          id?: string
          name: string
          notes?: string | null
          numero?: string | null
          objetivos?: string | null
          observacoes_cliente?: string | null
          progress?: number
          project_type?: string | null
          restricoes?: string | null
          sold_date?: string | null
          start_date?: string | null
          status?: string
          workflow_id?: string | null
        }
        Update: {
          aprovador_n1_id?: string | null
          aprovador_n2_id?: string | null
          billing_status?: string
          briefing_consolidado?: string | null
          budget_id?: string | null
          clickup_task_id?: string | null
          client_id?: string | null
          client_name?: string
          cliente_aprova?: boolean | null
          conta_fee_id?: string | null
          created_at?: string
          deal_id?: string | null
          delivery_date?: string | null
          edicao_horas_mapeadas?: number | null
          edicao_horas_vendidas?: number | null
          escopo_vendido?: string | null
          id?: string
          name?: string
          notes?: string | null
          numero?: string | null
          objetivos?: string | null
          observacoes_cliente?: string | null
          progress?: number
          project_type?: string | null
          restricoes?: string | null
          sold_date?: string | null
          start_date?: string | null
          status?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["budget_id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_conta_fee_id_fkey"
            columns: ["conta_fee_id"]
            isOneToOne: false
            referencedRelation: "contas_fees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "projects_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      projects_financeiro: {
        Row: {
          contract_value: number | null
          custo_hora_padrao: number | null
          direct_costs: number | null
          gross_margin_percent: number | null
          gross_margin_value: number | null
          invoiced_value: number | null
          project_id: string
          sold_value: number | null
          updated_at: string
        }
        Insert: {
          contract_value?: number | null
          custo_hora_padrao?: number | null
          direct_costs?: number | null
          gross_margin_percent?: number | null
          gross_margin_value?: number | null
          invoiced_value?: number | null
          project_id: string
          sold_value?: number | null
          updated_at?: string
        }
        Update: {
          contract_value?: number | null
          custo_hora_padrao?: number | null
          direct_costs?: number | null
          gross_margin_percent?: number | null
          gross_margin_value?: number | null
          invoiced_value?: number | null
          project_id?: string
          sold_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_financeiro_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "pipeline_completo"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "projects_financeiro_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_financeiro_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_financeiro_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "v_rentabilidade_projeto"
            referencedColumns: ["project_id"]
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
          {
            foreignKeyName: "proposal_letters_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["budget_id"]
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
          {
            foreignKeyName: "proposal_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_capacidade_semana"
            referencedColumns: ["user_id"]
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
          {
            foreignKeyName: "proposals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rate_card: {
        Row: {
          ativo: boolean
          created_at: string
          custo_hora: number
          funcao: string
          id: string
          ordem: number
          preco_hora: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          custo_hora?: number
          funcao: string
          id?: string
          ordem?: number
          preco_hora?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          custo_hora?: number
          funcao?: string
          id?: string
          ordem?: number
          preco_hora?: number
          updated_at?: string
        }
        Relationships: []
      }
      supplier_contacts: {
        Row: {
          ativo: boolean
          cidade: string | null
          created_at: string | null
          document: string | null
          email: string | null
          funcoes: string[]
          id: string
          is_generic: boolean | null
          last_used_at: string | null
          name: string
          observacoes: string | null
          telefone: string | null
          type: string | null
        }
        Insert: {
          ativo?: boolean
          cidade?: string | null
          created_at?: string | null
          document?: string | null
          email?: string | null
          funcoes?: string[]
          id?: string
          is_generic?: boolean | null
          last_used_at?: string | null
          name: string
          observacoes?: string | null
          telefone?: string | null
          type?: string | null
        }
        Update: {
          ativo?: boolean
          cidade?: string | null
          created_at?: string | null
          document?: string | null
          email?: string | null
          funcoes?: string[]
          id?: string
          is_generic?: boolean | null
          last_used_at?: string | null
          name?: string
          observacoes?: string | null
          telefone?: string | null
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
            foreignKeyName: "suppliers_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["budget_id"]
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
          assigned_user_id: string | null
          cartela: string | null
          client_id: string | null
          completed: boolean
          completed_at: string | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          description: string | null
          due_date: string | null
          estimativa_horas: number | null
          id: string
          locutor: string | null
          ordem: number
          priority: string | null
          project_id: string | null
          stage_id: string | null
          status: string | null
          title: string
          versao: string | null
          vigencia: string | null
        }
        Insert: {
          assigned_user_id?: string | null
          cartela?: string | null
          client_id?: string | null
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          estimativa_horas?: number | null
          id?: string
          locutor?: string | null
          ordem?: number
          priority?: string | null
          project_id?: string | null
          stage_id?: string | null
          status?: string | null
          title: string
          versao?: string | null
          vigencia?: string | null
        }
        Update: {
          assigned_user_id?: string | null
          cartela?: string | null
          client_id?: string | null
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          estimativa_horas?: number | null
          id?: string
          locutor?: string | null
          ordem?: number
          priority?: string | null
          project_id?: string | null
          stage_id?: string | null
          status?: string | null
          title?: string
          versao?: string | null
          vigencia?: string | null
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
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_capacidade_semana"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidade_projeto"
            referencedColumns: ["project_id"]
          },
        ]
      }
      team_members: {
        Row: {
          color: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          role_function: string | null
          user_id: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          role_function?: string | null
          user_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          role_function?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          alteracao_id: string | null
          billable: boolean
          created_at: string
          deliverable_id: string | null
          description: string | null
          duration_min: number
          id: string
          project_id: string | null
          source: string
          start_at: string
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alteracao_id?: string | null
          billable?: boolean
          created_at?: string
          deliverable_id?: string | null
          description?: string | null
          duration_min: number
          id?: string
          project_id?: string | null
          source?: string
          start_at: string
          task_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alteracao_id?: string | null
          billable?: boolean
          created_at?: string
          deliverable_id?: string | null
          description?: string | null
          duration_min?: number
          id?: string
          project_id?: string | null
          source?: string
          start_at?: string
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_alteracao_id_fkey"
            columns: ["alteracao_id"]
            isOneToOne: false
            referencedRelation: "deliverable_alteracoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidade_projeto"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      time_planning: {
        Row: {
          created_at: string
          created_by: string | null
          horas: number
          id: string
          project_id: string
          semana: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          horas?: number
          id?: string
          project_id: string
          semana: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          horas?: number
          id?: string
          project_id?: string
          semana?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_planning_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "time_planning_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_planning_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_planning_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidade_projeto"
            referencedColumns: ["project_id"]
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
      workflows: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          stages: Json
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          stages?: Json
          tipo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          stages?: Json
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      pipeline_completo: {
        Row: {
          billing_status: string | null
          budget_id: string | null
          budget_status: string | null
          budget_value: number | null
          clickup_task_id: string | null
          client_id: string | null
          contract_value: number | null
          deal_id: string | null
          deal_stage: string | null
          deal_title: string | null
          deal_value: number | null
          delivery_date: string | null
          direct_costs: number | null
          gross_margin_percent: number | null
          invoiced_value: number | null
          margin_percent: number | null
          project_id: string | null
          project_name: string | null
          project_status: string | null
          project_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      projects_v: {
        Row: {
          aprovador_n1_id: string | null
          aprovador_n2_id: string | null
          billing_status: string | null
          briefing_consolidado: string | null
          budget_id: string | null
          clickup_task_id: string | null
          client_id: string | null
          client_name: string | null
          cliente_aprova: boolean | null
          conta_fee_id: string | null
          contract_value: number | null
          created_at: string | null
          custo_hora_padrao: number | null
          deal_id: string | null
          delivery_date: string | null
          direct_costs: number | null
          edicao_horas_mapeadas: number | null
          edicao_horas_vendidas: number | null
          escopo_vendido: string | null
          gross_margin_percent: number | null
          gross_margin_value: number | null
          id: string | null
          invoiced_value: number | null
          name: string | null
          notes: string | null
          numero: string | null
          objetivos: string | null
          observacoes_cliente: string | null
          progress: number | null
          project_type: string | null
          restricoes: string | null
          sold_date: string | null
          sold_value: number | null
          start_date: string | null
          status: string | null
          workflow_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["budget_id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_conta_fee_id_fkey"
            columns: ["conta_fee_id"]
            isOneToOne: false
            referencedRelation: "contas_fees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "projects_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      v_capacidade_semana: {
        Row: {
          capacidade: number | null
          email: string | null
          full_name: string | null
          horas_apontadas: number | null
          horas_faturaveis: number | null
          ocupacao_percent: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_custo_equipe_projeto: {
        Row: {
          custo: number | null
          custo_hora_efetivo: number | null
          email: string | null
          full_name: string | null
          horas: number | null
          project_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidade_projeto"
            referencedColumns: ["project_id"]
          },
        ]
      }
      v_horas_entregavel: {
        Row: {
          deliverable_id: string | null
          horas_alteracao_cliente: number | null
          horas_edicao_pura: number | null
          horas_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
        ]
      }
      v_horas_por_projeto: {
        Row: {
          custo_interno: number | null
          horas_faturaveis: number | null
          horas_totais: number | null
          project_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidade_projeto"
            referencedColumns: ["project_id"]
          },
        ]
      }
      v_horas_projeto_total: {
        Row: {
          horas_em_entregaveis: number | null
          horas_total: number | null
          project_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pipeline_completo"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidade_projeto"
            referencedColumns: ["project_id"]
          },
        ]
      }
      v_previsao_pipeline: {
        Row: {
          n_deals: number | null
          prob_media: number | null
          stage: string | null
          valor_ponderado: number | null
          valor_total: number | null
        }
        Relationships: []
      }
      v_rentabilidade_projeto: {
        Row: {
          client_name: string | null
          custo_interno: number | null
          custo_total: number | null
          custos_externos: number | null
          horas: number | null
          margem: number | null
          margem_percent: number | null
          name: string | null
          numero: string | null
          project_id: string | null
          status: string | null
          valor: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_add_allowed_email: {
        Args: { _email: string; _nota?: string }
        Returns: undefined
      }
      admin_convidar_membro: {
        Args: {
          _custo: number
          _email: string
          _funcao: string
          _funcao_id: string
          _funcoes: string[]
          _horas: number
          _nome: string
          _papel: Database["public"]["Enums"]["app_role"]
        }
        Returns: Json
      }
      admin_desativar_membro: { Args: { _uid: string }; Returns: undefined }
      admin_excluir_membro: { Args: { _uid: string }; Returns: undefined }
      admin_reativar_membro: {
        Args: { _papel?: Database["public"]["Enums"]["app_role"]; _uid: string }
        Returns: undefined
      }
      admin_remover_convite: { Args: { _email: string }; Returns: undefined }
      admin_upsert_membro: {
        Args: {
          _ativo: boolean
          _custo: number
          _email: string
          _funcao: string
          _funcao_id: string
          _funcoes: string[]
          _horas: number
          _nome: string
          _papel: Database["public"]["Enums"]["app_role"]
          _uid: string
        }
        Returns: undefined
      }
      aprovador_efetivo: {
        Args: { _nivel: number; _project_id: string }
        Returns: string
      }
      can_apontar_horas: { Args: { _user_id: string }; Returns: boolean }
      can_see_money: { Args: { _user_id: string }; Returns: boolean }
      carta_aprovar: {
        Args: {
          _celular: string
          _email: string
          _nome: string
          _token: string
        }
        Returns: Json
      }
      carta_gerar_token: { Args: { _budget_id: string }; Returns: string }
      carta_publica: { Args: { _token: string }; Returns: Json }
      carta_reabrir: { Args: { _deal_id: string }; Returns: undefined }
      create_project_from_budget: {
        Args: { p_budget_id: string }
        Returns: string
      }
      eh_ultimo_admin: { Args: { _uid: string }; Returns: boolean }
      ganhar_orcamento_gerar_job: {
        Args: { _deal_id: string; _valor_final?: number }
        Returns: string
      }
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
      intake_add_business_hours: {
        Args: { _hours: number; _start: string }
        Returns: string
      }
      intake_calc: {
        Args: { _client_id: string; _entregas: Json; _prazo: string }
        Returns: Json
      }
      intake_client_rev_rounds: {
        Args: { _client_id: string }
        Returns: number
      }
      intake_config: { Args: { _slug: string }; Returns: Json }
      intake_disponibilidade: {
        Args: { _entregas: Json; _prazo: string; _slug: string }
        Returns: Json
      }
      intake_dur_segundos: { Args: { _txt: string }; Returns: number }
      intake_entrega_fator: { Args: { _entrega: Json }; Returns: number }
      intake_submit: {
        Args: {
          _anexos: Json
          _email: string
          _entregas: Json
          _nome: string
          _prazo: string
          _projeto: string
          _slug: string
        }
        Returns: Json
      }
      intake_sugestoes: {
        Args: { _entregas: Json; _slug: string }
        Returns: Json
      }
      is_edicao: { Args: { _user_id: string }; Returns: boolean }
      mergulho_enviar: { Args: { _dados: Json; _token: string }; Returns: Json }
      mergulho_publico: { Args: { _token: string }; Returns: Json }
      mergulho_salvar: { Args: { _dados: Json; _token: string }; Returns: Json }
      next_budget_number: { Args: never; Returns: number }
      notificacoes_marcar_lidas: {
        Args: { _ids?: string[] }
        Returns: undefined
      }
      notificar: {
        Args: {
          _corpo: string
          _dedupe_key?: string
          _link: string
          _prioridade: string
          _tipo: string
          _titulo: string
          _user_id: string
        }
        Returns: undefined
      }
      notificar_gestao: {
        Args: {
          _corpo: string
          _dedupe_key?: string
          _link: string
          _prioridade: string
          _tipo: string
          _titulo: string
        }
        Returns: undefined
      }
      notificar_prazos: { Args: never; Returns: undefined }
      pode_ver_dinheiro: { Args: { _uid?: string }; Returns: boolean }
      portal_client_data: { Args: { _token: string }; Returns: Json }
      portal_deliverable_alteracao: {
        Args: {
          _deliverable_id: string
          _descricao: string
          _solicitante: string
          _titulo: string
          _token: string
        }
        Returns: Json
      }
      portal_deliverable_aprovar: {
        Args: { _aprovador: string; _deliverable_id: string; _token: string }
        Returns: Json
      }
      portal_deliverable_review: {
        Args: {
          _aprovador: string
          _deliverable_id: string
          _status: string
          _token: string
        }
        Returns: Json
      }
      save_budget_atomic: {
        Args: { p_budget: Json; p_items: Json }
        Returns: string
      }
      seed_budget_items: {
        Args: { _budget_id: string; _porte?: string }
        Returns: number
      }
      set_custo_hora: {
        Args: { _user_id: string; _valor: number }
        Returns: undefined
      }
      set_projeto_financeiro: {
        Args: {
          _contract_value?: number
          _custo_hora_padrao?: number
          _direct_costs?: number
          _invoiced_value?: number
          _project_id: string
          _sold_value?: number
        }
        Returns: undefined
      }
      zerar_custo_hora_padrao: {
        Args: { _project_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "manager"
        | "operator"
        | "produtor"
        | "equipe"
        | "edicao"
        | "cliente"
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
      app_role: [
        "admin",
        "manager",
        "operator",
        "produtor",
        "equipe",
        "edicao",
        "cliente",
      ],
      permission_level: ["none", "view", "edit"],
    },
  },
} as const
