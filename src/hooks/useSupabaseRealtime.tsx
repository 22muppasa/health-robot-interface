/**
 * React hook for Supabase Realtime subscriptions.
 * Provides live updates for conversation messages, activity, reminders, etc.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  supabase,
  isSupabaseConfigured,
  ConversationMessage,
  Reminder,
  ActivityLogEntry,
  subscribeToConversations,
  subscribeToActivity,
  subscribeToReminders,
  subscribeToSettings,
  PatientSettings
} from '@/lib/supabase'

interface UseRealtimeConversationsOptions {
  patientId: string | null
  enabled?: boolean
  onNewMessage?: (message: ConversationMessage) => void
}

/**
 * Hook for real-time conversation updates.
 * Subscribes to new conversation messages for a patient.
 */
export function useRealtimeConversations({
  patientId,
  enabled = true,
  onNewMessage
}: UseRealtimeConversationsOptions) {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!enabled || !patientId || !isSupabaseConfigured()) {
      return
    }

    // Subscribe to new messages
    unsubscribeRef.current = subscribeToConversations(patientId, (message) => {
      setMessages(prev => [...prev, message])
      onNewMessage?.(message)
    })

    setIsConnected(true)

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
      setIsConnected(false)
    }
  }, [patientId, enabled, onNewMessage])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    isConnected,
    clearMessages
  }
}

interface UseRealtimeActivityOptions {
  patientId: string | null
  enabled?: boolean
  onNewActivity?: (activity: ActivityLogEntry) => void
}

/**
 * Hook for real-time activity log updates.
 * Subscribes to new activity entries for a patient.
 */
export function useRealtimeActivity({
  patientId,
  enabled = true,
  onNewActivity
}: UseRealtimeActivityOptions) {
  const [activities, setActivities] = useState<ActivityLogEntry[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!enabled || !patientId || !isSupabaseConfigured()) {
      return
    }

    unsubscribeRef.current = subscribeToActivity(patientId, (activity) => {
      setActivities(prev => [activity, ...prev]) // Most recent first
      onNewActivity?.(activity)
    })

    setIsConnected(true)

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
      setIsConnected(false)
    }
  }, [patientId, enabled, onNewActivity])

  const clearActivities = useCallback(() => {
    setActivities([])
  }, [])

  return {
    activities,
    isConnected,
    clearActivities
  }
}

interface UseRealtimeRemindersOptions {
  patientId: string | null
  enabled?: boolean
  onReminderChange?: (reminder: Reminder, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void
}

/**
 * Hook for real-time reminder updates.
 * Subscribes to reminder changes (insert, update, delete) for a patient.
 */
export function useRealtimeReminders({
  patientId,
  enabled = true,
  onReminderChange
}: UseRealtimeRemindersOptions) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!enabled || !patientId || !isSupabaseConfigured()) {
      return
    }

    unsubscribeRef.current = subscribeToReminders(patientId, (reminder, eventType) => {
      if (eventType === 'INSERT') {
        setReminders(prev => [...prev, reminder])
      } else if (eventType === 'UPDATE') {
        setReminders(prev => prev.map(r => r.id === reminder.id ? reminder : r))
      } else if (eventType === 'DELETE') {
        setReminders(prev => prev.filter(r => r.id !== reminder.id))
      }
      onReminderChange?.(reminder, eventType)
    })

    setIsConnected(true)

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
      setIsConnected(false)
    }
  }, [patientId, enabled, onReminderChange])

  return {
    reminders,
    isConnected,
    setReminders // Allow setting initial reminders
  }
}

interface UseRealtimeSettingsOptions {
  patientId: string | null
  enabled?: boolean
  onSettingsChange?: (settings: PatientSettings) => void
}

/**
 * Hook for real-time patient settings updates.
 * Subscribes to settings changes for a patient.
 */
export function useRealtimeSettings({
  patientId,
  enabled = true,
  onSettingsChange
}: UseRealtimeSettingsOptions) {
  const [settings, setSettings] = useState<PatientSettings | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!enabled || !patientId || !isSupabaseConfigured()) {
      return
    }

    unsubscribeRef.current = subscribeToSettings(patientId, (newSettings) => {
      setSettings(newSettings)
      onSettingsChange?.(newSettings)
    })

    setIsConnected(true)

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
      setIsConnected(false)
    }
  }, [patientId, enabled, onSettingsChange])

  return {
    settings,
    isConnected,
    setSettings // Allow setting initial settings
  }
}

/**
 * Combined hook for all patient-related real-time updates.
 * Use this when you need multiple subscriptions for the same patient.
 */
export function usePatientRealtime(patientId: string | null, enabled = true) {
  const conversations = useRealtimeConversations({ patientId, enabled })
  const activity = useRealtimeActivity({ patientId, enabled })
  const reminders = useRealtimeReminders({ patientId, enabled })
  const settings = useRealtimeSettings({ patientId, enabled })

  const isConnected = conversations.isConnected || 
                     activity.isConnected || 
                     reminders.isConnected || 
                     settings.isConnected

  return {
    conversations,
    activity,
    reminders,
    settings,
    isConnected,
    isSupabaseAvailable: isSupabaseConfigured()
  }
}
