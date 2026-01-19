#!/usr/bin/env python3
"""
Quick test script to verify TTS functionality
"""

import asyncio
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from voice_service import VoiceService
import openai

class MockState:
    def __init__(self):
        self.assistant_state = "idle"
        self.last_error = None
        self.connections = set()
    
    async def broadcast_update(self):
        pass

async def test_tts():
    """Test TTS generation"""
    print("Testing TTS functionality...")
    
    # Create mock state
    state = MockState()
    
    # Get API key from environment
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY environment variable not set")
        return False
    
    # Create voice service
    voice_service = VoiceService(state, api_key)
    
    # Test text
    test_text = "Hello! I am Claire, your health robot assistant. I can help you with medical questions and support."
    
    print(f"Input text: {test_text}")
    print("\nGenerating audio...")
    
    try:
        audio_base64 = await voice_service.text_to_speech(test_text)
        
        if audio_base64:
            print(f"✅ SUCCESS: Audio generated successfully!")
            print(f"   Base64 length: {len(audio_base64)} characters")
            print(f"   Audio size: ~{len(audio_base64) * 3 // 4 // 1000} KB")
            
            # Save audio file for testing
            import base64
            audio_bytes = base64.b64decode(audio_base64)
            with open("/tmp/test_tts_output.mp3", "wb") as f:
                f.write(audio_bytes)
            print(f"   Audio saved to: /tmp/test_tts_output.mp3")
            
            return True
        else:
            print("❌ FAILED: No audio generated")
            return False
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

async def test_process_command():
    """Test full command processing with TTS"""
    print("\n\nTesting command processing with TTS...")
    
    state = MockState()
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY not set")
        return False
    
    voice_service = VoiceService(state, api_key)
    
    test_command = "What is my current blood pressure?"
    
    print(f"Command: {test_command}")
    print("Processing...")
    
    try:
        await voice_service.process_text_command(test_command)
        
        if state.last_audio:
            print("✅ SUCCESS: Command processed and audio generated!")
            print(f"   Response: {state.last_response}")
            print(f"   Intent: {state.last_intent}")
            print(f"   Audio generated: Yes ({len(state.last_audio)} chars base64)")
            return True
        else:
            print("❌ FAILED: Command processed but no audio generated")
            if state.last_error:
                print(f"   Error: {state.last_error}")
            return False
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

async def main():
    """Run all tests"""
    print("="*60)
    print("TTS and Voice Service Tests")
    print("="*60)
    
    # Test basic TTS
    result1 = await test_tts()
    
    # Test full command processing
    result2 = await test_process_command()
    
    print("\n" + "="*60)
    if result1 and result2:
        print("✅ ALL TESTS PASSED")
        return 0
    else:
        print("❌ SOME TESTS FAILED")
        return 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
