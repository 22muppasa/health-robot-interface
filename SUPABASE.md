# Supabase Integration Guide

This guide explains how to set up Supabase for the Claire Healthcare Robot Interface.

## Overview

Claire supports two storage modes:
1. **In-Memory (Default)**: Data is stored in memory and lost on restart. Good for development/demo.
2. **Supabase (Production)**: Data is persisted in PostgreSQL with real-time sync and secure auth.

## Quick Start

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create an account
2. Click "New Project" and fill in:
   - Project name: `claire-healthcare` (or your choice)
   - Database password: Generate a strong password
   - Region: Choose closest to your users
3. Wait for project to initialize (~2 minutes)

### 2. Get Your API Keys

1. In your Supabase dashboard, go to **Settings → API**
2. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJ...` (for frontend)
   - **service_role key**: `eyJ...` (for backend - keep secret!)

### 3. Configure Environment Variables

**Backend** (`backend/.env`):
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
```

**Frontend** (`.env`):
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run Database Migrations

1. Go to your Supabase dashboard → **SQL Editor**
2. Copy the contents of `supabase/migrations/001_initial_schema.sql`
3. Paste and click "Run"

This creates all required tables:
- `patients` - Patient profiles
- `guardians` - Family member accounts  
- `guardian_patients` - Links between guardians and patients
- `patient_settings` - Patient preferences and settings
- `contacts` - Quick dial contacts
- `reminders` - Medication and activity reminders
- `conversation_messages` - Chat history
- `call_sessions` - Video call logs
- `activity_log` - Activity tracking
- `invite_codes` - Device pairing codes
- `devices` - Claire device registry

### 5. Restart the Application

```bash
# Restart backend
cd backend && uvicorn main:app --reload

# Restart frontend (in another terminal)
npm run dev
```

## Features Enabled by Supabase

### Authentication
- **Family Member Login**: Uses Supabase Auth with email/password
- **Device Pairing**: Uses invite codes that link family to patients
- **Session Management**: JWT tokens with auto-refresh

### Real-time Updates
Family members can see live updates in their dashboard:
- New conversation messages
- Activity log entries
- Reminder changes
- Patient settings updates

### Data Persistence
All data survives server restarts:
- Conversation history
- Reminders
- Settings
- Contacts

### Row Level Security (RLS)
- Guardians can only view their linked patients
- Patients can only access their own data
- Backend uses service key to bypass RLS for admin operations

## Architecture

```
┌─────────────────┐      ┌─────────────────┐
│  Claire Device  │      │  Family Portal  │
│  (Patient View) │      │  (Guardian View)│
└────────┬────────┘      └────────┬────────┘
         │                        │
         └──────────┬─────────────┘
                    │
         ┌──────────▼──────────┐
         │    FastAPI Backend  │
         │  (Python + Supabase)│
         └──────────┬──────────┘
                    │
    ┌───────────────┼───────────────┐
    │               │               │
    ▼               ▼               ▼
┌───────┐     ┌──────────┐    ┌──────────┐
│Supabase│     │ OpenAI   │    │ WebSocket│
│  DB    │     │  GPT-4   │    │ Signaling│
└───────┘     └──────────┘    └──────────┘
```

## Hybrid Mode

The application works in hybrid mode:
- **Supabase Realtime**: For conversation/activity updates
- **Custom WebSocket**: For video call signaling (WebRTC)

This provides the best of both worlds:
- Supabase handles auth, data, and real-time subscriptions
- Custom WebSocket handles low-latency video signaling

## Seeding Demo Data

After running migrations, you can seed demo data:

```sql
-- Insert default patient
INSERT INTO patients (id, name, room_number, device_id)
VALUES ('patient-main', 'Patient', '101', 'claire-device-001');

-- Insert default patient settings
INSERT INTO patient_settings (patient_id, current_mode, voice_volume)
VALUES ('patient-main', 'face', 70);

-- Insert demo contacts
INSERT INTO contacts (patient_id, name, relationship, phone, is_emergency_contact)
VALUES 
  ('patient-main', 'Mom', 'mother', '555-123-4567', false),
  ('patient-main', 'Dad', 'father', '555-234-5678', false),
  ('patient-main', 'Dr. Smith', 'doctor', '555-111-0000', true),
  ('patient-main', 'Nurse Station', 'nurse', '555-999-0000', true);
```

## Troubleshooting

### "Supabase not configured" warning
This means the environment variables aren't set. The app will use in-memory storage.

### "Invalid API key" error
Check that you copied the full key without any trailing spaces.

### RLS policy errors
Make sure the migrations ran successfully. Check the SQL Editor for errors.

### Connection issues
Verify your project is active in the Supabase dashboard.

## Next Steps

1. Set up SMS/Email notifications via Supabase Edge Functions
2. Add Supabase Storage for photo frame mode
3. Implement backup and restore functionality
4. Add analytics dashboard using Supabase's built-in analytics
