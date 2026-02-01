-- Claire Healthcare Robot Interface - Supabase Schema
-- Initial migration: Creates all tables for the health robot system

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PATIENTS TABLE
-- Represents elderly patients using the Claire device
-- ============================================================================
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    room_number VARCHAR(50),
    device_id VARCHAR(255) UNIQUE, -- Unique ID for the physical Claire device
    pairing_code VARCHAR(8), -- 6-8 digit code for family to pair with patient
    pairing_code_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GUARDIANS TABLE  
-- Family members/guardians who monitor patients via the Family Portal
-- Uses Supabase Auth for authentication
-- ============================================================================
CREATE TABLE guardians (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    relationship VARCHAR(100), -- e.g., "Daughter", "Son", "Caregiver"
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GUARDIAN_PATIENTS JUNCTION TABLE
-- Many-to-many relationship: guardians can monitor multiple patients
-- ============================================================================
CREATE TABLE guardian_patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guardian_id UUID NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE, -- Primary guardian has more permissions
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(guardian_id, patient_id)
);

-- ============================================================================
-- PATIENT_SETTINGS TABLE
-- Stores all patient preferences and Claire configuration
-- ============================================================================
CREATE TABLE patient_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE UNIQUE,
    
    -- Display settings
    display_brightness INTEGER DEFAULT 80 CHECK (display_brightness >= 0 AND display_brightness <= 100),
    text_size VARCHAR(20) DEFAULT 'large' CHECK (text_size IN ('small', 'medium', 'large', 'extra-large')),
    high_contrast BOOLEAN DEFAULT FALSE,
    
    -- Voice settings
    voice_volume INTEGER DEFAULT 70 CHECK (voice_volume >= 0 AND voice_volume <= 100),
    speech_rate DECIMAL(3,2) DEFAULT 0.9 CHECK (speech_rate >= 0.5 AND speech_rate <= 2.0),
    voice_type VARCHAR(50) DEFAULT 'alloy',
    
    -- Mode settings
    current_mode VARCHAR(50) DEFAULT 'face' CHECK (current_mode IN ('face', 'companion', 'ambient', 'sleep', 'photo', 'emergency')),
    auto_sleep_enabled BOOLEAN DEFAULT TRUE,
    sleep_time TIME DEFAULT '22:00',
    wake_time TIME DEFAULT '07:00',
    
    -- Privacy settings
    camera_enabled BOOLEAN DEFAULT TRUE,
    microphone_enabled BOOLEAN DEFAULT TRUE,
    conversation_logging BOOLEAN DEFAULT TRUE,
    
    -- Emergency settings
    emergency_contact_id UUID,
    fall_detection_enabled BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- CONTACTS TABLE
-- Quick dial contacts for the patient
-- ============================================================================
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    relationship VARCHAR(100),
    avatar_url TEXT,
    is_emergency_contact BOOLEAN DEFAULT FALSE,
    is_favorite BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- REMINDERS TABLE
-- Medication, appointment, and activity reminders
-- ============================================================================
CREATE TABLE reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    reminder_type VARCHAR(50) DEFAULT 'general' CHECK (reminder_type IN ('medication', 'appointment', 'activity', 'general')),
    
    -- Scheduling
    scheduled_time TIME NOT NULL,
    scheduled_date DATE, -- NULL for recurring daily reminders
    days_of_week INTEGER[], -- Array of days (0=Sunday, 6=Saturday) for recurring
    is_recurring BOOLEAN DEFAULT FALSE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_acknowledged BOOLEAN DEFAULT FALSE,
    last_acknowledged_at TIMESTAMPTZ,
    
    -- Notification settings
    voice_notification BOOLEAN DEFAULT TRUE,
    visual_notification BOOLEAN DEFAULT TRUE,
    
    created_by UUID REFERENCES guardians(id), -- NULL if created by patient via voice
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- CONVERSATION_MESSAGES TABLE
-- Stores all conversations with Claire for history and analytics
-- ============================================================================
CREATE TABLE conversation_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    
    -- Message content
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    
    -- Intent detection results (for analytics)
    detected_intent VARCHAR(100),
    intent_confidence DECIMAL(3,2),
    
    -- Command execution (if applicable)
    command_executed VARCHAR(100),
    command_params JSONB,
    
    -- Session tracking
    session_id UUID, -- Groups messages in a conversation session
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- CALL_SESSIONS TABLE
-- Logs all video/audio calls for safety and analytics
-- ============================================================================
CREATE TABLE call_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    
    -- Call participants
    caller_type VARCHAR(20) NOT NULL CHECK (caller_type IN ('patient', 'guardian', 'nurse', 'external')),
    caller_id UUID, -- Guardian ID if applicable
    caller_name VARCHAR(255),
    
    -- Call details
    call_type VARCHAR(20) DEFAULT 'video' CHECK (call_type IN ('video', 'audio')),
    room_id VARCHAR(255), -- WebRTC room identifier
    
    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    answered_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    
    -- Status
    status VARCHAR(20) DEFAULT 'ringing' CHECK (status IN ('ringing', 'active', 'completed', 'missed', 'declined')),
    end_reason VARCHAR(50), -- 'completed', 'patient_ended', 'caller_ended', 'timeout', 'error'
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INVITE_CODES TABLE
-- For device pairing and family onboarding
-- ============================================================================
CREATE TABLE invite_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) UNIQUE NOT NULL,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    
    -- Code settings
    created_by UUID REFERENCES guardians(id), -- Primary guardian who created the invite
    max_uses INTEGER DEFAULT 1,
    current_uses INTEGER DEFAULT 0,
    
    -- Validity
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- DEVICES TABLE
-- Tracks Claire device registrations and status
-- ============================================================================
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    
    -- Device info
    device_serial VARCHAR(255) UNIQUE NOT NULL,
    device_name VARCHAR(255) DEFAULT 'Claire',
    firmware_version VARCHAR(50),
    
    -- Status
    is_online BOOLEAN DEFAULT FALSE,
    last_seen_at TIMESTAMPTZ,
    last_ip_address VARCHAR(50),
    
    -- Configuration
    config JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ACTIVITY_LOG TABLE
-- Tracks significant patient activities for guardian monitoring
-- ============================================================================
CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    
    activity_type VARCHAR(50) NOT NULL,
    -- Types: 'mode_change', 'reminder_acknowledged', 'call_made', 'call_received',
    --        'emergency_triggered', 'wake_word_detected', 'settings_changed'
    
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Patients
CREATE INDEX idx_patients_device_id ON patients(device_id);
CREATE INDEX idx_patients_pairing_code ON patients(pairing_code) WHERE pairing_code IS NOT NULL;

-- Guardian-Patient relationships
CREATE INDEX idx_guardian_patients_guardian ON guardian_patients(guardian_id);
CREATE INDEX idx_guardian_patients_patient ON guardian_patients(patient_id);

-- Contacts
CREATE INDEX idx_contacts_patient ON contacts(patient_id);
CREATE INDEX idx_contacts_favorite ON contacts(patient_id, is_favorite) WHERE is_favorite = TRUE;

-- Reminders
CREATE INDEX idx_reminders_patient ON reminders(patient_id);
CREATE INDEX idx_reminders_active ON reminders(patient_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_reminders_scheduled ON reminders(scheduled_time, scheduled_date);

-- Conversation messages
CREATE INDEX idx_conversation_patient ON conversation_messages(patient_id);
CREATE INDEX idx_conversation_session ON conversation_messages(session_id);
CREATE INDEX idx_conversation_created ON conversation_messages(patient_id, created_at DESC);

-- Call sessions
CREATE INDEX idx_calls_patient ON call_sessions(patient_id);
CREATE INDEX idx_calls_active ON call_sessions(patient_id, status) WHERE status = 'active';

-- Activity log
CREATE INDEX idx_activity_patient ON activity_log(patient_id);
CREATE INDEX idx_activity_created ON activity_log(patient_id, created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Helper function: Check if user is guardian for patient
CREATE OR REPLACE FUNCTION is_guardian_for_patient(p_patient_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM guardian_patients 
        WHERE patient_id = p_patient_id AND guardian_id = p_user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- GUARDIANS: Users can only see/edit their own guardian profile
CREATE POLICY guardians_select_own ON guardians
    FOR SELECT USING (id = auth.uid());

CREATE POLICY guardians_update_own ON guardians
    FOR UPDATE USING (id = auth.uid());

-- PATIENTS: Guardians can view patients they're linked to
CREATE POLICY patients_select_guardian ON patients
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM guardian_patients 
            WHERE patient_id = patients.id AND guardian_id = auth.uid()
        )
    );

-- GUARDIAN_PATIENTS: Guardians can view their own links
CREATE POLICY guardian_patients_select ON guardian_patients
    FOR SELECT USING (guardian_id = auth.uid());

-- Primary guardians can add new guardian links
CREATE POLICY guardian_patients_insert ON guardian_patients
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM guardian_patients 
            WHERE patient_id = guardian_patients.patient_id 
            AND guardian_id = auth.uid() 
            AND is_primary = TRUE
        )
    );

-- PATIENT_SETTINGS: Guardians can view/edit settings for their patients
CREATE POLICY patient_settings_select ON patient_settings
    FOR SELECT USING (is_guardian_for_patient(patient_id, auth.uid()));

CREATE POLICY patient_settings_update ON patient_settings
    FOR UPDATE USING (is_guardian_for_patient(patient_id, auth.uid()));

-- CONTACTS: Guardians can manage contacts for their patients
CREATE POLICY contacts_all ON contacts
    FOR ALL USING (is_guardian_for_patient(patient_id, auth.uid()));

-- REMINDERS: Guardians can manage reminders for their patients
CREATE POLICY reminders_all ON reminders
    FOR ALL USING (is_guardian_for_patient(patient_id, auth.uid()));

-- CONVERSATION_MESSAGES: Guardians can view conversations for their patients
CREATE POLICY conversation_select ON conversation_messages
    FOR SELECT USING (is_guardian_for_patient(patient_id, auth.uid()));

-- CALL_SESSIONS: Guardians can view calls for their patients
CREATE POLICY calls_select ON call_sessions
    FOR SELECT USING (is_guardian_for_patient(patient_id, auth.uid()));

-- ACTIVITY_LOG: Guardians can view activity for their patients
CREATE POLICY activity_select ON activity_log
    FOR SELECT USING (is_guardian_for_patient(patient_id, auth.uid()));

-- ============================================================================
-- SERVICE ROLE POLICIES
-- The backend uses service role key and bypasses RLS
-- These policies are for the frontend/client access only
-- ============================================================================

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_patients_updated_at
    BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_guardians_updated_at
    BEFORE UPDATE ON guardians
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_settings_updated_at
    BEFORE UPDATE ON patient_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at
    BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reminders_updated_at
    BEFORE UPDATE ON reminders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_devices_updated_at
    BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INITIAL SEED DATA (for development)
-- ============================================================================

-- This will be run separately or via the backend seeding script
