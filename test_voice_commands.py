#!/usr/bin/env python3
"""Test script to verify voice command recognition and handling"""

import asyncio
import json
import sys
sys.path.insert(0, '/workspaces/health-robot-interface/backend')

from conversation_manager import ConversationManager

async def test_voice_commands():
    """Test various voice command scenarios"""
    
    # Initialize conversation manager
    conversation = ConversationManager()
    
    test_cases = [
        # Pain assessment
        ("I'm experiencing pain in my left knee", "pain_assessment"),
        # Mood check
        ("I'm feeling a bit anxious today", "mood_check"),
        # Reminder setting
        ("Set a reminder for my medication at 2 PM", "set_reminder"),
        # Room service
        ("Can I get a glass of water please?", "room_service"),
        # Health tips
        ("What are some tips for better sleep?", "health_tips"),
        # Medication taken
        ("I just took my medication", "medication_taken"),
        # List reminders
        ("What reminders do I have coming up?", "list_reminders"),
        # General conversation
        ("How are you doing today?", "conversation"),
    ]
    
    print("=" * 80)
    print("VOICE COMMAND RECOGNITION TEST")
    print("=" * 80)
    
    for i, (user_input, expected_intent) in enumerate(test_cases, 1):
        print(f"\nTest {i}: {user_input}")
        print(f"Expected intent: {expected_intent}")
        
        try:
            result = await conversation.process_message(user_input)
            
            print(f"Detected intent: {result.get('intent')}")
            print(f"Confidence: {result.get('confidence', 0):.2f}")
            print(f"Should execute: {result.get('should_execute_command')}")
            print(f"Slots: {result.get('slots', {})}")
            print(f"Response: {result.get('response', '')[:100]}...")
            
            # Check if intent matches expected
            if result.get('intent') == expected_intent:
                print("✓ PASS")
            elif result.get('intent') == "conversation" and expected_intent != "conversation":
                print("⚠ PARTIAL - Treated as conversation, may need more specificity")
            else:
                print("✗ FAIL")
                
        except Exception as e:
            print(f"✗ ERROR: {str(e)}")
    
    print("\n" + "=" * 80)
    print("TEST COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(test_voice_commands())
