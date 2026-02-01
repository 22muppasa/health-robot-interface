/**
 * Supabase client configuration for Claire Healthcare Robot Interface.
 * This module provides the Supabase client and authentication helpers for the frontend.
 */

import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js'

// Get environment variables from Vite
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// Check if Supabase is configured
export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl && 
    supabaseAnonKey && 
    supabaseUrl !== 'https://your-project.supabase.co'
  )
}

// Create the Supabase client (singleton)
let supabaseClient: SupabaseClient | null = null

export const getSupabase = (): SupabaseClient => {
  if (!supabaseClient) {
    if (!isSupabaseConfigured()) {
      console.warn('Supabase not configured - some features may not work')
    }
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
  }
  return supabaseClient
}

// Convenience export
export const supabase = getSupabase()

// ============================================================================
// DATABASE TYPES
// ============================================================================

export interface Patient {
  id: string
  name: string
  room_number?: string
  device_id?: string
  pairing_code?: string
  pairing_code_expires_at?: string
  created_at: string
  updated_at: string
}

export interface Guardian {
  id: string
  name: string
  email: string
  phone?: string
  relationship?: string
  created_at: string
  updated_at: string
}

export interface GuardianPatient {
  id: string
  guardian_id: string
  patient_id: string
  is_primary: boolean
  created_at: string
  patients?: Patient
}

export interface PatientSettings {
  id: string
  patient_id: string
  display_brightness: number
  text_size: 'small' | 'medium' | 'large' | 'extra-large'
  high_contrast: boolean
  voice_volume: number
  speech_rate: number
  voice_type: string
  current_mode: 'face' | 'companion' | 'ambient' | 'sleep' | 'photo' | 'emergency'
  auto_sleep_enabled: boolean
  sleep_time: string
  wake_time: string
  camera_enabled: boolean
  microphone_enabled: boolean
  conversation_logging: boolean
  emergency_contact_id?: string
  fall_detection_enabled: boolean
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  patient_id: string
  name: string
  phone?: string
  email?: string
  relationship?: string
  avatar_url?: string
  is_emergency_contact: boolean
  is_favorite: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Reminder {
  id: string
  patient_id: string
  title: string
  description?: string
  reminder_type: 'medication' | 'appointment' | 'activity' | 'general'
  scheduled_time: string
  scheduled_date?: string
  days_of_week?: number[]
  is_recurring: boolean
  is_active: boolean
  is_acknowledged: boolean
  last_acknowledged_at?: string
  voice_notification: boolean
  visual_notification: boolean
  created_by?: string
  created_at: string
  updated_at: string
}

export interface ConversationMessage {
  id: string
  patient_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  detected_intent?: string
  intent_confidence?: number
  command_executed?: string
  command_params?: Record<string, unknown>
  session_id?: string
  created_at: string
}

export interface CallSession {
  id: string
  patient_id: string
  caller_type: 'patient' | 'guardian' | 'nurse' | 'external'
  caller_id?: string
  caller_name?: string
  call_type: 'video' | 'audio'
  room_id?: string
  started_at: string
  answered_at?: string
  ended_at?: string
  status: 'ringing' | 'active' | 'completed' | 'missed' | 'declined'
  end_reason?: string
  created_at: string
}

export interface ActivityLogEntry {
  id: string
  patient_id: string
  activity_type: string
  description?: string
  metadata?: Record<string, unknown>
  created_at: string
}

// ============================================================================
// AUTH STATE MANAGEMENT
// ============================================================================

export interface AuthState {
  user: User | null
  session: Session | null
  guardian: Guardian | null
  patients: Patient[]
  isLoading: boolean
  error: string | null
}

// ============================================================================
// AUTH FUNCTIONS
// ============================================================================

/**
 * Sign up a new guardian (family member).
 */
export async function signUpGuardian(
  email: string, 
  password: string, 
  name: string,
  phone?: string,
  relationship?: string
): Promise<{ user: User; session: Session } | null> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          phone,
          relationship,
          role: 'guardian'
        }
      }
    })

    if (error) {
      console.error('Sign up error:', error.message)
      return null
    }

    if (data.user && data.session) {
      // Create guardian profile in guardians table
      await supabase.from('guardians').insert({
        id: data.user.id,
        name,
        email,
        phone,
        relationship
      })
      
      return { user: data.user, session: data.session }
    }

    return null
  } catch (err) {
    console.error('Sign up exception:', err)
    return null
  }
}

/**
 * Sign in an existing guardian.
 */
export async function signInGuardian(
  email: string, 
  password: string
): Promise<{ user: User; session: Session; guardian: Guardian | null; patients: Patient[] } | null> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      console.error('Sign in error:', error.message)
      return null
    }

    if (data.user && data.session) {
      // Fetch guardian profile
      const { data: guardian } = await supabase
        .from('guardians')
        .select('*')
        .eq('id', data.user.id)
        .single()

      // Fetch linked patients
      const { data: guardianPatients } = await supabase
        .from('guardian_patients')
        .select('*, patients(*)')
        .eq('guardian_id', data.user.id)

      const patients = guardianPatients?.map(gp => gp.patients).filter(Boolean) as Patient[] || []

      return { 
        user: data.user, 
        session: data.session,
        guardian: guardian || null,
        patients
      }
    }

    return null
  } catch (err) {
    console.error('Sign in exception:', err)
    return null
  }
}

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

/**
 * Get the current session.
 */
export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  return data.session
}

/**
 * Get the current user with guardian profile and patients.
 */
export async function getCurrentUser(): Promise<{
  user: User
  guardian: Guardian | null
  patients: Patient[]
} | null> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return null

  const { data: guardian } = await supabase
    .from('guardians')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: guardianPatients } = await supabase
    .from('guardian_patients')
    .select('*, patients(*)')
    .eq('guardian_id', user.id)

  const patients = guardianPatients?.map(gp => gp.patients).filter(Boolean) as Patient[] || []

  return { user, guardian: guardian || null, patients }
}

// ============================================================================
// PATIENT DATA FUNCTIONS
// ============================================================================

/**
 * Get patient settings.
 */
export async function getPatientSettings(patientId: string): Promise<PatientSettings | null> {
  const { data, error } = await supabase
    .from('patient_settings')
    .select('*')
    .eq('patient_id', patientId)
    .single()

  if (error) {
    console.error('Error fetching patient settings:', error)
    return null
  }

  return data
}

/**
 * Update patient settings.
 */
export async function updatePatientSettings(
  patientId: string, 
  settings: Partial<PatientSettings>
): Promise<boolean> {
  const { error } = await supabase
    .from('patient_settings')
    .upsert({ patient_id: patientId, ...settings }, { onConflict: 'patient_id' })

  if (error) {
    console.error('Error updating patient settings:', error)
    return false
  }

  return true
}

/**
 * Get contacts for a patient.
 */
export async function getContacts(patientId: string): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('patient_id', patientId)
    .order('sort_order')

  if (error) {
    console.error('Error fetching contacts:', error)
    return []
  }

  return data || []
}

/**
 * Get reminders for a patient.
 */
export async function getReminders(patientId: string, activeOnly = true): Promise<Reminder[]> {
  let query = supabase
    .from('reminders')
    .select('*')
    .eq('patient_id', patientId)

  if (activeOnly) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query.order('scheduled_time')

  if (error) {
    console.error('Error fetching reminders:', error)
    return []
  }

  return data || []
}

/**
 * Get conversation history for a patient.
 */
export async function getConversationHistory(patientId: string, limit = 50): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching conversation history:', error)
    return []
  }

  // Return in chronological order
  return (data || []).reverse()
}

/**
 * Get activity log for a patient.
 */
export async function getActivityLog(patientId: string, limit = 50): Promise<ActivityLogEntry[]> {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching activity log:', error)
    return []
  }

  return data || []
}

/**
 * Get call history for a patient.
 */
export async function getCallHistory(patientId: string, limit = 20): Promise<CallSession[]> {
  const { data, error } = await supabase
    .from('call_sessions')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching call history:', error)
    return []
  }

  return data || []
}

// ============================================================================
// REALTIME SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribe to conversation messages for a patient.
 */
export function subscribeToConversations(
  patientId: string,
  onMessage: (message: ConversationMessage) => void
) {
  const channel = supabase
    .channel(`conversations:${patientId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'conversation_messages',
        filter: `patient_id=eq.${patientId}`
      },
      (payload) => {
        onMessage(payload.new as ConversationMessage)
      }
    )
    .subscribe()

  // Return unsubscribe function
  return () => {
    supabase.removeChannel(channel)
  }
}

/**
 * Subscribe to activity log for a patient.
 */
export function subscribeToActivity(
  patientId: string,
  onActivity: (activity: ActivityLogEntry) => void
) {
  const channel = supabase
    .channel(`activity:${patientId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'activity_log',
        filter: `patient_id=eq.${patientId}`
      },
      (payload) => {
        onActivity(payload.new as ActivityLogEntry)
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

/**
 * Subscribe to reminder changes for a patient.
 */
export function subscribeToReminders(
  patientId: string,
  onReminder: (reminder: Reminder, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void
) {
  const channel = supabase
    .channel(`reminders:${patientId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'reminders',
        filter: `patient_id=eq.${patientId}`
      },
      (payload) => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
        const reminder = (payload.new || payload.old) as Reminder
        onReminder(reminder, eventType)
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

/**
 * Subscribe to patient settings changes.
 */
export function subscribeToSettings(
  patientId: string,
  onChange: (settings: PatientSettings) => void
) {
  const channel = supabase
    .channel(`settings:${patientId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'patient_settings',
        filter: `patient_id=eq.${patientId}`
      },
      (payload) => {
        onChange(payload.new as PatientSettings)
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

// ============================================================================
// DEVICE PAIRING
// ============================================================================

/**
 * Redeem a pairing code to link guardian to patient.
 */
export async function redeemPairingCode(code: string): Promise<Patient | null> {
  // Find patient with this pairing code
  const { data: patient, error } = await supabase
    .from('patients')
    .select('*')
    .eq('pairing_code', code)
    .single()

  if (error || !patient) {
    console.error('Invalid pairing code')
    return null
  }

  // Check expiration
  if (patient.pairing_code_expires_at) {
    const expiresAt = new Date(patient.pairing_code_expires_at)
    if (expiresAt < new Date()) {
      console.error('Pairing code expired')
      return null
    }
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    console.error('User not authenticated')
    return null
  }

  // Link guardian to patient
  const { error: linkError } = await supabase
    .from('guardian_patients')
    .insert({
      guardian_id: user.id,
      patient_id: patient.id,
      is_primary: false // First guardian should be primary, subsequent are not
    })

  if (linkError) {
    console.error('Error linking guardian to patient:', linkError)
    return null
  }

  // Clear the pairing code
  await supabase
    .from('patients')
    .update({ pairing_code: null, pairing_code_expires_at: null })
    .eq('id', patient.id)

  return patient
}
