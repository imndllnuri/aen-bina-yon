
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
            "announcement_reads": {
                  Row: {
                    "announcement_id": string,"profile_id": string,"read_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "announcement_id": string,"profile_id": string,"read_at"?: string
                  }
                  Update: {
                    "announcement_id"?: string,"profile_id"?: string,"read_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcement_reads_announcement_id_fkey"
      columns: ["announcement_id"]
isOneToOne: false
      referencedRelation: "announcements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "announcement_reads_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"announcement_recipients": {
                  Row: {
                    "added_at": string,"announcement_id": string,"profile_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_at"?: string,"announcement_id": string,"profile_id": string
                  }
                  Update: {
                    "added_at"?: string,"announcement_id"?: string,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcement_recipients_announcement_id_fkey"
      columns: ["announcement_id"]
isOneToOne: false
      referencedRelation: "announcements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "announcement_recipients_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"announcements": {
                  Row: {
                    "body": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"expire_at": string | null,"id": string,"last_resent_at": string | null,"pinned": boolean,"publish_at": string | null,"published_at": string | null,"resend_count": number,"site_id": string,"status": string,"target": NonNullable<Json>,"title": string,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"expire_at"?: string | null,"id"?: string,"last_resent_at"?: string | null,"pinned"?: boolean,"publish_at"?: string | null,"published_at"?: string | null,"resend_count"?: number,"site_id": string,"status"?: string,"target": NonNullable<Json>,"title": string,"type"?: string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"expire_at"?: string | null,"id"?: string,"last_resent_at"?: string | null,"pinned"?: boolean,"publish_at"?: string | null,"published_at"?: string | null,"resend_count"?: number,"site_id"?: string,"status"?: string,"target"?: NonNullable<Json>,"title"?: string,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "announcements_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_name": string | null,"at": string,"company_id": string | null,"id": number,"new_data": Json | null,"old_data": Json | null,"row_id": string | null,"site_id": string | null,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_name"?: string | null,"at"?: string,"company_id"?: string | null,"id"?: never,"new_data"?: Json | null,"old_data"?: Json | null,"row_id"?: string | null,"site_id"?: string | null,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_name"?: string | null,"at"?: string,"company_id"?: string | null,"id"?: never,"new_data"?: Json | null,"old_data"?: Json | null,"row_id"?: string | null,"site_id"?: string | null,"table_name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"blocks": {
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
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"event_key": string,"id": string,"kind": string,"link": string | null,"profile_id": string,"read_at": string | null,"title": string,"visible_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"event_key": string,"id"?: string,"kind": string,"link"?: string | null,"profile_id": string,"read_at"?: string | null,"title": string,"visible_at"?: string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"event_key"?: string,"id"?: string,"kind"?: string,"link"?: string | null,"profile_id"?: string,"read_at"?: string | null,"title"?: string,"visible_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
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
                    "amount": number,"created_at": string,"created_by": string | null,"fee": number,"id": string,"installments": number,"method": string,"note": string | null,"paid_at": string,"payer_id": string | null,"payer_name": string | null,"provider": string,"provider_ref": string | null,"receipt_no": string,"request_id": string | null,"status": string,"unit_id": string,"unit_label": string,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"created_by"?: string | null,"fee"?: number,"id"?: string,"installments"?: number,"method": string,"note"?: string | null,"paid_at"?: string,"payer_id"?: string | null,"payer_name"?: string | null,"provider": string,"provider_ref"?: string | null,"receipt_no": string,"request_id"?: string | null,"status"?: string,"unit_id": string,"unit_label": string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"created_by"?: string | null,"fee"?: number,"id"?: string,"installments"?: number,"method"?: string,"note"?: string | null,"paid_at"?: string,"payer_id"?: string | null,"payer_name"?: string | null,"provider"?: string,"provider_ref"?: string | null,"receipt_no"?: string,"request_id"?: string | null,"status"?: string,"unit_id"?: string,"unit_label"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
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
                    "admin_note": string | null,"building_type": string | null,"created_at": string,"email": string | null,"id": string,"il": string | null,"ilce": string | null,"message": string | null,"name": string,"phone": string | null,"status": string,"unit_count": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_note"?: string | null,"building_type"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"il"?: string | null,"ilce"?: string | null,"message"?: string | null,"name": string,"phone"?: string | null,"status"?: string,"unit_count"?: number | null
                  }
                  Update: {
                    "admin_note"?: string | null,"building_type"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"il"?: string | null,"ilce"?: string | null,"message"?: string | null,"name"?: string,"phone"?: string | null,"status"?: string,"unit_count"?: number | null
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
                },"request_comments": {
                  Row: {
                    "author_id": string | null,"body": string,"by_admin": boolean,"created_at": string,"id": string,"is_internal": boolean,"request_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"by_admin": boolean,"created_at"?: string,"id"?: string,"is_internal"?: boolean,"request_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"by_admin"?: boolean,"created_at"?: string,"id"?: string,"is_internal"?: boolean,"request_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "request_comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "request_comments_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "requests"
      referencedColumns: ["id"]
    }
                  ]
                },"request_events": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"from_status": string | null,"id": string,"kind": string,"rating": number | null,"request_id": string,"to_status": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"from_status"?: string | null,"id"?: string,"kind": string,"rating"?: number | null,"request_id": string,"to_status"?: string | null
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"from_status"?: string | null,"id"?: string,"kind"?: string,"rating"?: number | null,"request_id"?: string,"to_status"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "request_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "request_events_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "requests"
      referencedColumns: ["id"]
    }
                  ]
                },"request_photos": {
                  Row: {
                    "created_at": string,"file_path": string,"id": string,"position": number,"request_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"file_path": string,"id"?: string,"position": number,"request_id": string
                  }
                  Update: {
                    "created_at"?: string,"file_path"?: string,"id"?: string,"position"?: number,"request_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "request_photos_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "requests"
      referencedColumns: ["id"]
    }
                  ]
                },"requests": {
                  Row: {
                    "category": string,"created_at": string,"created_by": string | null,"description": string,"id": string,"location": string | null,"priority": string,"rated_at": string | null,"rating": number | null,"requester_id": string | null,"resolved_at": string | null,"site_id": string,"status": string,"title": string,"token": string,"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"created_at"?: string,"created_by"?: string | null,"description": string,"id"?: string,"location"?: string | null,"priority"?: string,"rated_at"?: string | null,"rating"?: number | null,"requester_id"?: string | null,"resolved_at"?: string | null,"site_id": string,"status"?: string,"title": string,"token": string,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"id"?: string,"location"?: string | null,"priority"?: string,"rated_at"?: string | null,"rating"?: number | null,"requester_id"?: string | null,"resolved_at"?: string | null,"site_id"?: string,"status"?: string,"title"?: string,"token"?: string,"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "requests_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requests_requester_id_fkey"
      columns: ["requester_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requests_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requests_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
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
                },"transfer_notices": {
                  Row: {
                    "amount": number,"created_at": string,"file_path": string,"id": string,"note": string | null,"payment_id": string | null,"profile_id": string | null,"reject_reason": string | null,"request_id": string,"reviewed_at": string | null,"reviewed_by": string | null,"sender_name": string,"sent_on": string,"status": string,"unit_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"file_path": string,"id"?: string,"note"?: string | null,"payment_id"?: string | null,"profile_id"?: string | null,"reject_reason"?: string | null,"request_id": string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sender_name": string,"sent_on": string,"status"?: string,"unit_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"file_path"?: string,"id"?: string,"note"?: string | null,"payment_id"?: string | null,"profile_id"?: string | null,"reject_reason"?: string | null,"request_id"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sender_name"?: string,"sent_on"?: string,"status"?: string,"unit_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transfer_notices_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: true
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfer_notices_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfer_notices_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transfer_notices_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
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
"add_request_comment":
{ Args: { "p_body": string,"p_internal": boolean,"p_request": string }; Returns: string
                           },
"announcement_report":
{ Args: { "p_id": string }; Returns: {
              "full_name": string,"profile_id": string,"read_at": string,"relations": string,"units": string
            }[]
                           },
"announcement_target":
{ Args: { "p_id": string }; Returns: Json
                           },
"approve_transfer_notice":
{ Args: { "p_charge_ids": (string)[],"p_notice": string }; Returns: string
                           },
"cancel_request":
{ Args: { "p_id": string }; Returns: undefined
                           },
"cancel_transfer_notice":
{ Args: { "p_notice": string }; Returns: undefined
                           },
"create_charge_batch":
{ Args: { "p_amount_kurus": number,"p_charge_type": string,"p_description": string,"p_due_date": string,"p_expected_kurus": number,"p_expected_units": number,"p_karar_date": string,"p_karar_no": string,"p_period": string,"p_request_id": string,"p_site": string,"p_split": string,"p_target": Json,"p_tenant_visible": boolean }; Returns: string
                           },
"create_request":
{ Args: { "p_category": string,"p_description": string,"p_location": string,"p_photos": (string)[],"p_priority": string,"p_requester": string,"p_title": string,"p_token": string,"p_unit": string }; Returns: string
                           },
"dashboard_kpis":
{ Args: { "p_site": string }; Returns: {
              "accrued": number,"collected": number,"collected_for_month": number,"month": string,"open_requests": number,"overdue_amount": number,"overdue_units": number,"pending_notices": number,"rate_pct": number,"receivable": number
            }[]
                           },
"delete_announcement":
{ Args: { "p_id": string }; Returns: undefined
                           },
"delete_charge_batch":
{ Args: { "p_batch": string }; Returns: undefined
                           },
"delete_charge_type":
{ Args: { "p_id": string }; Returns: undefined
                           },
"generate_recurring_batch":
{ Args: { "p_plan": string }; Returns: string
                           },
"get_bank_accounts":
{ Args: Record<PropertyKey, never>; Returns: {
              "bank": string,"company_id": string,"holder": string,"iban": string
            }[]
                           },
"get_receipt":
{ Args: { "p_payment": string }; Returns: {
              "amount_kurus": number,"company_name": string,"fee_kurus": number,"installments": number,"lines": Json,"method": string,"note": string,"paid_at": string,"payer_name": string,"provider": string,"receipt_no": string,"site_name": string,"status": string,"total_kurus": number,"unit_label": string,"void_reason": string
            }[]
                           },
"list_announcements":
{ Args: { "p_site": string }; Returns: {
              "body": string,"created_at": string,"expire_at": string,"id": string,"last_resent_at": string,"pinned": boolean,"publish_at": string,"published_at": string,"read_count": number,"recipient_count": number,"resend_count": number,"status": string,"title": string,"type": string,"updated_at": string
            }[]
                           },
"mark_announcement_read":
{ Args: { "p_announcement": string }; Returns: undefined
                           },
"pay_charges_mock":
{ Args: { "p_charge_ids": (string)[],"p_expected_total_kurus": number,"p_installments": number,"p_request_id": string }; Returns: string
                           },
"preview_allocation":
{ Args: { "p_amount_kurus": number,"p_charge_ids": (string)[],"p_payer": string,"p_unit": string }; Returns: {
              "apply_kurus": number,"charge_id": string,"description": string,"due_date": string,"excess_kurus": number,"period": string,"remaining_kurus": number,"type_name": string
            }[]
                           },
"preview_announcement_audience":
{ Args: { "p_site": string,"p_target": Json }; Returns: {
              "recipients": number,"units": number
            }[]
                           },
"preview_charge_batch":
{ Args: { "p_amount_kurus": number,"p_site": string,"p_split": string,"p_target": Json }; Returns: {
              "amount_kurus": number,"block_name": string,"door_no": string,"unit_id": string,"weight": number
            }[]
                           },
"publish_announcement":
{ Args: { "p_id": string }; Returns: number
                           },
"quote_payment":
{ Args: { "p_charge_ids": (string)[],"p_installments": number }; Returns: {
              "amount_kurus": number,"charge_id": string,"description": string,"due_date": string,"fee_kurus": number,"period": string,"total_kurus": number,"type_name": string,"unit_id": string
            }[]
                           },
"rate_request":
{ Args: { "p_id": string,"p_rating": number }; Returns: undefined
                           },
"record_manual_payment":
{ Args: { "p_amount_kurus": number,"p_charge_ids": (string)[],"p_method": string,"p_note": string,"p_paid_on": string,"p_payer": string,"p_payer_name": string,"p_request_id": string,"p_unit": string }; Returns: string
                           },
"reject_transfer_notice":
{ Args: { "p_notice": string,"p_reason": string }; Returns: undefined
                           },
"report_attendance":
{ Args: { "p_site": string }; Returns: {
              "block_name": string,"door_no": string,"land_share": number,"owners": string,"share_pct": number,"total_land_share": number,"unit_count": number,"unit_id": string
            }[]
                           },
"report_collections":
{ Args: { "p_from": string,"p_limit": number,"p_site": string,"p_to": string }; Returns: {
              "amount": number,"fee": number,"method": string,"paid_at": string,"payer_name": string,"payment_id": string,"receipt_no": string,"unit_label": string
            }[]
                           },
"report_collections_summary":
{ Args: { "p_from": string,"p_site": string,"p_to": string }; Returns: {
              "amount": number,"fee": number,"method": string,"payment_count": number
            }[]
                           },
"report_debts":
{ Args: { "p_limit": number,"p_site": string }; Returns: {
              "balance": number,"block_name": string,"d1_30": number,"d31_60": number,"d61_90": number,"d90_plus": number,"door_no": string,"not_due": number,"owners": string,"phone": string,"unit_id": string,"unit_label": string
            }[]
                           },
"report_monthly":
{ Args: { "p_from": string,"p_site": string,"p_to": string }; Returns: {
              "accrued": number,"collected": number,"collected_for_month": number,"month": string,"rate_pct": number
            }[]
                           },
"report_residents":
{ Args: { "p_site": string }; Returns: {
              "block_name": string,"door_no": string,"email": string,"floor": number,"full_name": string,"gross_m2": number,"is_active": boolean,"land_share": number,"phone": string,"relation": string,"start_date": string,"unit_id": string
            }[]
                           },
"resend_announcement_unread":
{ Args: { "p_id": string }; Returns: number
                           },
"save_announcement":
{ Args: { "p_body": string,"p_expire_at": string,"p_id": string,"p_pinned": boolean,"p_publish_at": string,"p_site": string,"p_target": Json,"p_title": string,"p_type": string }; Returns: string
                           },
"save_bank_accounts":
{ Args: { "p_accounts": Json,"p_company": string }; Returns: undefined
                           },
"save_charge_type":
{ Args: { "p_active": boolean,"p_company": string,"p_id": string,"p_name": string,"p_sort": number,"p_split": string,"p_tenant_visible": boolean }; Returns: string
                           },
"save_company_settings":
{ Args: { "p_commission_payer": string,"p_company": string,"p_due_day": number,"p_fee_pct": Json,"p_grace_days": number,"p_late_fee_method": string,"p_late_fee_rate": number,"p_ydo_rate": number }; Returns: undefined
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
"set_request_status":
{ Args: { "p_id": string,"p_status": string }; Returns: undefined
                           },
"set_request_triage":
{ Args: { "p_category": string,"p_id": string,"p_priority": string }; Returns: undefined
                           },
"submit_transfer_notice":
{ Args: { "p_amount_kurus": number,"p_file_path": string,"p_note": string,"p_request_id": string,"p_sender_name": string,"p_sent_on": string,"p_unit": string }; Returns: string
                           },
"unpublish_announcement":
{ Args: { "p_id": string }; Returns: undefined
                           },
"update_request":
{ Args: { "p_category": string,"p_description": string,"p_id": string,"p_location": string,"p_priority": string,"p_title": string }; Returns: undefined
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
