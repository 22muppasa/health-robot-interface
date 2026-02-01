/**
 * React hook for managing Supabase authentication state.
 * Provides auth state, login/logout functions, and auto-session refresh.
 */

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react'
import {
  supabase,
  isSupabaseConfigured,
  signInGuardian,
  signUpGuardian,
  signOut,
  getCurrentUser,
  Patient,
  Guardian
} from '@/lib/supabase'
import { User, Session } from '@supabase/supabase-js'

interface AuthContextValue {
  // State
  user: User | null
  session: Session | null
  guardian: Guardian | null
  patients: Patient[]
  selectedPatientId: string | null
  isLoading: boolean
  isAuthenticated: boolean
  error: string | null
  
  // Actions
  login: (email: string, password: string) => Promise<boolean>
  signup: (email: string, password: string, name: string, phone?: string, relationship?: string) => Promise<boolean>
  logout: () => Promise<void>
  selectPatient: (patientId: string) => void
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  children: ReactNode
}

export function SupabaseAuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [guardian, setGuardian] = useState<Guardian | null>(null)
  const [patients, setPatients] = useState<Patient[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Check if we should use Supabase auth
  const useSupabaseAuth = isSupabaseConfigured()

  // Initialize auth state on mount
  useEffect(() => {
    if (!useSupabaseAuth) {
      setIsLoading(false)
      return
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      
      if (session?.user) {
        loadUserData(session.user.id)
      } else {
        setIsLoading(false)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        
        if (session?.user) {
          await loadUserData(session.user.id)
        } else {
          setGuardian(null)
          setPatients([])
          setSelectedPatientId(null)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [useSupabaseAuth])

  // Load guardian profile and linked patients
  const loadUserData = async (userId: string) => {
    try {
      const userData = await getCurrentUser()
      if (userData) {
        setGuardian(userData.guardian)
        setPatients(userData.patients)
        
        // Auto-select first patient if none selected
        if (userData.patients.length > 0 && !selectedPatientId) {
          setSelectedPatientId(userData.patients[0].id)
        }
      }
    } catch (err) {
      console.error('Error loading user data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Login function
  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    if (!useSupabaseAuth) {
      setError('Supabase authentication not configured')
      return false
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await signInGuardian(email, password)
      
      if (result) {
        setUser(result.user)
        setSession(result.session)
        setGuardian(result.guardian)
        setPatients(result.patients)
        
        if (result.patients.length > 0) {
          setSelectedPatientId(result.patients[0].id)
        }
        
        return true
      } else {
        setError('Invalid email or password')
        return false
      }
    } catch (err) {
      setError('Login failed. Please try again.')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [useSupabaseAuth])

  // Signup function
  const signup = useCallback(async (
    email: string, 
    password: string, 
    name: string,
    phone?: string,
    relationship?: string
  ): Promise<boolean> => {
    if (!useSupabaseAuth) {
      setError('Supabase authentication not configured')
      return false
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await signUpGuardian(email, password, name, phone, relationship)
      
      if (result) {
        setUser(result.user)
        setSession(result.session)
        // Note: Guardian profile is created in signUpGuardian
        await loadUserData(result.user.id)
        return true
      } else {
        setError('Sign up failed. Please try again.')
        return false
      }
    } catch (err: any) {
      if (err.message?.includes('already registered')) {
        setError('An account with this email already exists')
      } else {
        setError('Sign up failed. Please try again.')
      }
      return false
    } finally {
      setIsLoading(false)
    }
  }, [useSupabaseAuth])

  // Logout function
  const logout = useCallback(async () => {
    setIsLoading(true)
    try {
      await signOut()
      setUser(null)
      setSession(null)
      setGuardian(null)
      setPatients([])
      setSelectedPatientId(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Select patient
  const selectPatient = useCallback((patientId: string) => {
    if (patients.some(p => p.id === patientId)) {
      setSelectedPatientId(patientId)
    }
  }, [patients])

  // Clear error
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const value: AuthContextValue = {
    user,
    session,
    guardian,
    patients,
    selectedPatientId,
    isLoading,
    isAuthenticated: !!user,
    error,
    login,
    signup,
    logout,
    selectPatient,
    clearError
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

/**
 * Hook to access Supabase auth context.
 * Must be used within a SupabaseAuthProvider.
 */
export function useSupabaseAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  
  if (!context) {
    throw new Error('useSupabaseAuth must be used within a SupabaseAuthProvider')
  }
  
  return context
}

/**
 * Hook to check if user is authenticated.
 * Returns loading state while checking.
 */
export function useAuthRequired(): { isAuthenticated: boolean; isLoading: boolean } {
  const { isAuthenticated, isLoading } = useSupabaseAuth()
  return { isAuthenticated, isLoading }
}
