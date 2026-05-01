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
      app_settings: {
        Row: {
          app_name: string
          background_url: string | null
          card_bg_color: string | null
          card_text_color: string | null
          id: number
          login_image_url: string | null
          logo_url: string | null
          updated_at: string
        }
        Insert: {
          app_name?: string
          background_url?: string | null
          card_bg_color?: string | null
          card_text_color?: string | null
          id?: number
          login_image_url?: string | null
          logo_url?: string | null
          updated_at?: string
        }
        Update: {
          app_name?: string
          background_url?: string | null
          card_bg_color?: string | null
          card_text_color?: string | null
          id?: number
          login_image_url?: string | null
          logo_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      conferencias: {
        Row: {
          codigo: string
          created_at: string
          id: string
          item_id: string | null
          quantidade: number
          remessa_id: string
          user_id: string
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          item_id?: string | null
          quantidade: number
          remessa_id: string
          user_id: string
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          item_id?: string | null
          quantidade?: number
          remessa_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conferencias_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "remessa_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conferencias_remessa_id_fkey"
            columns: ["remessa_id"]
            isOneToOne: false
            referencedRelation: "remessas"
            referencedColumns: ["id"]
          },
        ]
      }
      divergencias: {
        Row: {
          ajustado_em: string | null
          ajustado_por: string | null
          codigo: string
          created_at: string
          descricao: string | null
          diferenca: number
          finalizado_em: string | null
          finalizado_por: string | null
          id: string
          item_id: string | null
          observacao: string | null
          qtd_conferida: number
          qtd_esperada: number
          remessa_categoria: string | null
          remessa_id: string
          remessa_numero: string | null
          status: Database["public"]["Enums"]["status_divergencia"]
          updated_at: string
        }
        Insert: {
          ajustado_em?: string | null
          ajustado_por?: string | null
          codigo: string
          created_at?: string
          descricao?: string | null
          diferenca: number
          finalizado_em?: string | null
          finalizado_por?: string | null
          id?: string
          item_id?: string | null
          observacao?: string | null
          qtd_conferida: number
          qtd_esperada: number
          remessa_categoria?: string | null
          remessa_id: string
          remessa_numero?: string | null
          status?: Database["public"]["Enums"]["status_divergencia"]
          updated_at?: string
        }
        Update: {
          ajustado_em?: string | null
          ajustado_por?: string | null
          codigo?: string
          created_at?: string
          descricao?: string | null
          diferenca?: number
          finalizado_em?: string | null
          finalizado_por?: string | null
          id?: string
          item_id?: string | null
          observacao?: string | null
          qtd_conferida?: number
          qtd_esperada?: number
          remessa_categoria?: string | null
          remessa_id?: string
          remessa_numero?: string | null
          status?: Database["public"]["Enums"]["status_divergencia"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "divergencias_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "remessa_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "divergencias_remessa_id_fkey"
            columns: ["remessa_id"]
            isOneToOne: false
            referencedRelation: "remessas"
            referencedColumns: ["id"]
          },
        ]
      }
      email_destinatarios: {
        Row: {
          ativo: boolean
          created_at: string
          email: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          email: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          email?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      materiais_amostras: {
        Row: {
          codigo: string | null
          created_at: string
          id: string
          ordem: number
          quantidade: number
          remessa_id: string
          updated_at: string
        }
        Insert: {
          codigo?: string | null
          created_at?: string
          id?: string
          ordem?: number
          quantidade?: number
          remessa_id: string
          updated_at?: string
        }
        Update: {
          codigo?: string | null
          created_at?: string
          id?: string
          ordem?: number
          quantidade?: number
          remessa_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      remessa_itens: {
        Row: {
          codigo: string
          created_at: string
          descricao: string
          id: string
          qtd_conferida: number
          qtd_esperada: number
          recebido_em: string | null
          recebido_por: string | null
          remessa_id: string
        }
        Insert: {
          codigo: string
          created_at?: string
          descricao: string
          id?: string
          qtd_conferida?: number
          qtd_esperada?: number
          recebido_em?: string | null
          recebido_por?: string | null
          remessa_id: string
        }
        Update: {
          codigo?: string
          created_at?: string
          descricao?: string
          id?: string
          qtd_conferida?: number
          qtd_esperada?: number
          recebido_em?: string | null
          recebido_por?: string | null
          remessa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "remessa_itens_remessa_id_fkey"
            columns: ["remessa_id"]
            isOneToOne: false
            referencedRelation: "remessas"
            referencedColumns: ["id"]
          },
        ]
      }
      remessas: {
        Row: {
          categoria: string
          conferencia_divergencia: boolean
          conferencia_divergencia_comentario: string | null
          conferencia_inicio: string | null
          conferencia_termino: string | null
          conferencia_turno_fim: string | null
          conferencia_turno_inicio: string | null
          created_at: string
          criado_por: string | null
          divergencia_recebimento: boolean
          divergencia_recebimento_comentario: string | null
          finalizada_em: string | null
          id: string
          numero: string
          origem: string | null
          origem_outros: string | null
          qtd_processo: number
          recebida_em: string | null
          recebido_por: string | null
          status: Database["public"]["Enums"]["status_remessa"]
          total_itens: number
          total_qtd_esperada: number
          updated_at: string
        }
        Insert: {
          categoria: string
          conferencia_divergencia?: boolean
          conferencia_divergencia_comentario?: string | null
          conferencia_inicio?: string | null
          conferencia_termino?: string | null
          conferencia_turno_fim?: string | null
          conferencia_turno_inicio?: string | null
          created_at?: string
          criado_por?: string | null
          divergencia_recebimento?: boolean
          divergencia_recebimento_comentario?: string | null
          finalizada_em?: string | null
          id?: string
          numero: string
          origem?: string | null
          origem_outros?: string | null
          qtd_processo?: number
          recebida_em?: string | null
          recebido_por?: string | null
          status?: Database["public"]["Enums"]["status_remessa"]
          total_itens?: number
          total_qtd_esperada?: number
          updated_at?: string
        }
        Update: {
          categoria?: string
          conferencia_divergencia?: boolean
          conferencia_divergencia_comentario?: string | null
          conferencia_inicio?: string | null
          conferencia_termino?: string | null
          conferencia_turno_fim?: string | null
          conferencia_turno_inicio?: string | null
          created_at?: string
          criado_por?: string | null
          divergencia_recebimento?: boolean
          divergencia_recebimento_comentario?: string | null
          finalizada_em?: string | null
          id?: string
          numero?: string
          origem?: string | null
          origem_outros?: string | null
          qtd_processo?: number
          recebida_em?: string | null
          recebido_por?: string | null
          status?: Database["public"]["Enums"]["status_remessa"]
          total_itens?: number
          total_qtd_esperada?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "master" | "admin" | "user"
      status_divergencia: "pendente" | "ajustado"
      status_remessa: "aberta" | "em_conferencia" | "finalizada" | "recebida"
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
      app_role: ["master", "admin", "user"],
      status_divergencia: ["pendente", "ajustado"],
      status_remessa: ["aberta", "em_conferencia", "finalizada", "recebida"],
    },
  },
} as const
