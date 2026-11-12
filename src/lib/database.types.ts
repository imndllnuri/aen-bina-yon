
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "blocks": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"site_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"site_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"site_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "blocks_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"charge_batches": {
                  Row: {
                    "amount": number,"charge_type_id": string,"created_at": string,"created_by": string | null,"description": string | null,"due_date": string,"id": string,"karar_date": string | null,"karar_no": string | null,"period": string | null,"recurring_plan_id": string | null,"request_id": string | null,"site_id": string,"split_method": string,"target": NonNullable<Json>,"tenant_visible": boolean,"total": number,"unit_count": number,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"charge_type_id": string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_date": string,"id"?: string,"karar_date"?: string | null,"karar_no"?: string | null,"period"?: string | null,"recurring_plan_id"?: string | null,"request_id"?: string | null,"site_id": string,"split_method": string,"target": NonNullable<Json>,"tenant_visible": boolean,"total": number,"unit_count": number,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount"?: number,"charge_type_id"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_date"?: string,"id"?: string,"karar_date"?: string | null,"karar_no"?: string | null,"period"?: string | null,"recurring_plan_id"?: string | null,"request_id"?: string | null,"site_id"?: string,"split_method"?: string,"target"?: NonNullable<Json>,"tenant_visible"?: boolean,"total"?: number,"unit_count"?: number,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "charge_batches_charge_type_id_fkey"
      columns: ["charge_type_id"]
isOneToOne: false
      referencedRelation: "charge_types"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charge_batches_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charge_batches_recurring_plan_id_fkey"
      columns: ["recurring_plan_id"]
isOneToOne: false
      referencedRelation: "recurring_plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charge_batches_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charge_batches_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"charge_types": {
                  Row: {
                    "active": boolean,"code": string,"company_id": string,"created_at": string,"default_split": string,"id": string,"name": string,"sort_order": number,"tenant_visible_default": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"code": string,"company_id": string,"created_at"?: string,"default_split"?: string,"id"?: string,"name": string,"sort_order"?: number,"tenant_visible_default"?: boolean
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"company_id"?: string,"created_at"?: string,"default_split"?: string,"id"?: string,"name"?: string,"sort_order"?: number,"tenant_visible_default"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "charge_types_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"charges": {
                  Row: {
                    "amount": number,"batch_id": string,"charge_type_id": string,"created_at": string,"created_by": string | null,"description": string | null,"due_date": string,"id": string,"period": string | null,"tenant_visible": boolean,"unit_id": string,"updated_at": string,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"batch_id": string,"charge_type_id": string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_date": string,"id"?: string,"period"?: string | null,"tenant_visible": boolean,"unit_id": string,"updated_at"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount"?: number,"batch_id"?: string,"charge_type_id"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_date"?: string,"id"?: string,"period"?: string | null,"tenant_visible"?: boolean,"unit_id"?: string,"updated_at"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "charges_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "charge_batch_summary"
      referencedColumns: ["batch_id"]
    },{
      foreignKeyName: "charges_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "charge_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_charge_type_id_fkey"
      columns: ["charge_type_id"]
isOneToOne: false
      referencedRelation: "charge_types"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"companies": {
                  Row: {
                    "address": string | null,"created_at": string,"email": string | null,"id": string,"logo_url": string | null,"name": string,"phone": string | null,"settings": NonNullable<Json>,"tax_no": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"logo_url"?: string | null,"name": string,"phone"?: string | null,"settings"?: NonNullable<Json>,"tax_no"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"logo_url"?: string | null,"name"?: string,"phone"?: string | null,"settings"?: NonNullable<Json>,"tax_no"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"payment_allocations": {
                  Row: {
                    "amount": number,"charge_id": string,"payment_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"charge_id": string,"payment_id": string
                  }
                  Update: {
                    "amount"?: number,"charge_id"?: string,"payment_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_allocations_charge_id_fkey"
      columns: ["charge_id"]
isOneToOne: false
      referencedRelation: "charge_status"
      referencedColumns: ["charge_id"]
    },{
      foreignKeyName: "payment_allocations_charge_id_fkey"
      columns: ["charge_id"]
isOneToOne: false
      referencedRelation: "charges"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_allocations_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"created_by": string | null,"fee": number,"id": string,"installments": number,"method": string,"paid_at": string,"payer_id": string | null,"payer_name": string | null,"provider": string,"provider_ref": string | null,"receipt_no": string,"request_id": string | null,"status": string,"unit_id": string,"unit_label": string,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_by"?: string | null,"fee"?: number,"id"?: string,"installments"?: number,"method": string,"paid_at"?: string,"payer_id"?: string | null,"payer_name"?: string | null,"provider": string,"provider_ref"?: string | null,"receipt_no": string,"request_id"?: string | null,"status"?: string,"unit_id": string,"unit_label": string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount"?: number,"created_by"?: string | null,"fee"?: number,"id"?: string,"installments"?: number,"method"?: string,"paid_at"?: string,"payer_id"?: string | null,"payer_name"?: string | null,"provider"?: string,"provider_ref"?: string | null,"receipt_no"?: string,"request_id"?: string | null,"status"?: string,"unit_id"?: string,"unit_label"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_payer_id_fkey"
      columns: ["payer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string | null,"full_name": string | null,"id": string,"is_active": boolean,"kvkk_consent_at": string | null,"kvkk_consent_version": string | null,"notify_prefs": NonNullable<Json>,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id": string,"is_active"?: boolean,"kvkk_consent_at"?: string | null,"kvkk_consent_version"?: string | null,"notify_prefs"?: NonNullable<Json>,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id"?: string,"is_active"?: boolean,"kvkk_consent_at"?: string | null,"kvkk_consent_version"?: string | null,"notify_prefs"?: NonNullable<Json>,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"quote_requests": {
                  Row: {
                    "building_type": string | null,"created_at": string,"email": string | null,"id": string,"il": string | null,"ilce": string | null,"message": string | null,"name": string,"phone": string | null,"status": string,"unit_count": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "building_type"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"il"?: string | null,"ilce"?: string | null,"message"?: string | null,"name": string,"phone"?: string | null,"status"?: string,"unit_count"?: number | null
                  }
                  Update: {
                    "building_type"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"il"?: string | null,"ilce"?: string | null,"message"?: string | null,"name"?: string,"phone"?: string | null,"status"?: string,"unit_count"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"recurring_plans": {
                  Row: {
                    "active": boolean,"amount": number,"charge_type_id": string,"created_at": string,"created_by": string | null,"day_of_month": number,"description": string | null,"id": string,"karar_date": string | null,"karar_no": string | null,"name": string,"site_id": string,"split_method": string,"target": NonNullable<Json>,"tenant_visible": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"amount": number,"charge_type_id": string,"created_at"?: string,"created_by"?: string | null,"day_of_month": number,"description"?: string | null,"id"?: string,"karar_date"?: string | null,"karar_no"?: string | null,"name": string,"site_id": string,"split_method": string,"target": NonNullable<Json>,"tenant_visible"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"amount"?: number,"charge_type_id"?: string,"created_at"?: string,"created_by"?: string | null,"day_of_month"?: number,"description"?: string | null,"id"?: string,"karar_date"?: string | null,"karar_no"?: string | null,"name"?: string,"site_id"?: string,"split_method"?: string,"target"?: NonNullable<Json>,"tenant_visible"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recurring_plans_charge_type_id_fkey"
      columns: ["charge_type_id"]
isOneToOne: false
      referencedRelation: "charge_types"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_plans_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_plans_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"site_members": {
                  Row: {
                    "created_at": string,"profile_id": string,"role": string,"site_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"profile_id": string,"role"?: string,"site_id": string
                  }
                  Update: {
                    "created_at"?: string,"profile_id"?: string,"role"?: string,"site_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "site_members_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "site_members_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"sites": {
                  Row: {
                    "address": string | null,"company_id": string,"created_at": string,"id": string,"il": string | null,"ilce": string | null,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"company_id": string,"created_at"?: string,"id"?: string,"il"?: string | null,"ilce"?: string | null,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"company_id"?: string,"created_at"?: string,"id"?: string,"il"?: string | null,"ilce"?: string | null,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sites_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"unit_residents": {
                  Row: {
                    "created_at": string,"end_date": string | null,"id": string,"profile_id": string,"relation": string,"start_date": string,"unit_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"end_date"?: string | null,"id"?: string,"profile_id": string,"relation": string,"start_date"?: string,"unit_id": string
                  }
                  Update: {
                    "created_at"?: string,"end_date"?: string | null,"id"?: string,"profile_id"?: string,"relation"?: string,"start_date"?: string,"unit_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "unit_residents_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "unit_residents_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"units": {
                  Row: {
                    "archived_at": string | null,"block_id": string,"created_at": string,"door_no": string,"floor": number | null,"gross_m2": number | null,"id": string,"land_share": number | null,"status": string,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"block_id": string,"created_at"?: string,"door_no": string,"floor"?: number | null,"gross_m2"?: number | null,"id"?: string,"land_share"?: number | null,"status"?: string,"type"?: string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"block_id"?: string,"created_at"?: string,"door_no"?: string,"floor"?: number | null,"gross_m2"?: number | null,"id"?: string,"land_share"?: number | null,"status"?: string,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "units_block_id_fkey"
      columns: ["block_id"]
isOneToOne: false
      referencedRelation: "blocks"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "charge_batch_summary": {
                  Row: {
                    "active_count": number | null,"active_total": number | null,"batch_id": string,"site_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "charge_batches_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"charge_status": {
                  Row: {
                    "amount": number,"block_id": string | null,"block_name": string | null,"charge_id": string,"charge_type_id": string,"created_at": string,"description": string | null,"door_no": string | null,"due_date": string,"paid_amount": number | null,"period": string | null,"remaining": number | null,"running_balance": number | null,"site_id": string | null,"status": string | null,"type_name": string | null,"unit_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "blocks_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_charge_type_id_fkey"
      columns: ["charge_type_id"]
isOneToOne: false
      referencedRelation: "charge_types"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "units_block_id_fkey"
      columns: ["block_id"]
isOneToOne: false
      referencedRelation: "blocks"
      referencedColumns: ["id"]
    }
                  ]
                },"unit_balances": {
                  Row: {
                    "balance": number | null,"charged": number | null,"line_count": number | null,"next_due_date": string | null,"overdue_amount": number | null,"overdue_count": number | null,"paid": number | null,"unit_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "charges_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "accept_kvkk":
{ Args: { "p_version": string }; Returns: undefined
                           },
"create_charge_batch":
{ Args: { "p_amount_kurus": number,"p_charge_type": string,"p_description": string,"p_due_date": string,"p_expected_kurus": number,"p_expected_units": number,"p_karar_date": string,"p_karar_no": string,"p_period": string,"p_request_id": string,"p_site": string,"p_split": string,"p_target": Json,"p_tenant_visible": boolean }; Returns: string
                           },
"delete_charge_batch":
{ Args: { "p_batch": string }; Returns: undefined
                           },
"generate_recurring_batch":
{ Args: { "p_plan": string }; Returns: string
                           },
"get_receipt":
{ Args: { "p_payment": string }; Returns: {
              "amount_kurus": number,"company_name": string,"fee_kurus": number,"installments": number,"lines": Json,"method": string,"paid_at": string,"payer_name": string,"provider": string,"receipt_no": string,"site_name": string,"status": string,"total_kurus": number,"unit_label": string,"void_reason": string
            }[]
                           },
"pay_charges_mock":
{ Args: { "p_charge_ids": (string)[],"p_expected_total_kurus": number,"p_installments": number,"p_request_id": string }; Returns: string
                           },
"preview_charge_batch":
{ Args: { "p_amount_kurus": number,"p_site": string,"p_split": string,"p_target": Json }; Returns: {
              "amount_kurus": number,"block_name": string,"door_no": string,"unit_id": string,"weight": number
            }[]
                           },
"quote_payment":
{ Args: { "p_charge_ids": (string)[],"p_installments": number }; Returns: {
              "amount_kurus": number,"charge_id": string,"description": string,"due_date": string,"fee_kurus": number,"period": string,"total_kurus": number,"type_name": string,"unit_id": string
            }[]
                           },
"save_recurring_plan":
{ Args: { "p_amount_kurus": number,"p_charge_type": string,"p_day": number,"p_description": string,"p_id": string,"p_karar_date": string,"p_karar_no": string,"p_name": string,"p_site": string,"p_split": string,"p_target": Json,"p_tenant_visible": boolean }; Returns: string
                           },
"set_profile_active":
{ Args: { "p_active": boolean,"p_profile": string }; Returns: undefined
                           },
"set_recurring_plan_active":
{ Args: { "p_active": boolean,"p_plan": string }; Returns: undefined
                           },
"void_charge":
{ Args: { "p_charge": string,"p_reason": string }; Returns: undefined
                           },
"void_charge_batch":
{ Args: { "p_batch": string,"p_reason": string }; Returns: undefined
                           },
"void_payment":
{ Args: { "p_payment": string,"p_reason": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
