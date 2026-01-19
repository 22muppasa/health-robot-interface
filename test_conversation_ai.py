#!/usr/bin/env python3
"""
Example: Testing Claire's Conversational AI

This script demonstrates how to interact with Claire's new conversational capabilities.
Run this to test command recognition, natural conversation, and intent detection.
"""

import asyncio
import json
from backend.conversation_manager import ConversationManager
import openai

# Initialize the OpenAI client
client = openai.AsyncOpenAI()

# Create conversation manager
conversation_manager = ConversationManager(client)

async def test_conversation():
    """Test various conversation scenarios."""
    
    test_cases = [
        # Commands
        ("Check my vitals", "Should recognize as command"),
        ("I need a nurse", "Should recognize as command"),
        ("Join the video call", "Should recognize as command"),
        
        # Casual conversation
        ("How are you today?", "Should respond conversationally"),
        ("I'm feeling stressed", "Should respond with empathy"),
        ("Tell me about relaxation techniques", "Should provide advice"),
        
        # Ambiguous
        ("Help", "Should ask for clarification"),
        ("Do something", "Should ask what they need"),
    ]
    
    print("🤖 Claire Conversational AI Test\n")
    print("=" * 60)
    
    for user_input, description in test_cases:
        print(f"\n📝 User: {user_input}")
        print(f"   Expected: {description}")
        
        try:
            result = await conversation_manager.process_message(user_input)
            
            print(f"   Intent: {result.get('intent', 'N/A')}")
            print(f"   Confidence: {result.get('confidence', 0):.0%}")
            print(f"   Execute Command: {result.get('should_execute_command', False)}")
            print(f"   Claire: {result.get('response', 'N/A')[:100]}...")
            
        except Exception as e:
            print(f"   ❌ Error: {str(e)}")

async def test_streaming():
    """Test streaming response."""
    
    print("\n" + "=" * 60)
    print("\n🌊 Testing Streaming Response\n")
    
    user_input = "What should I do to improve my sleep?"
    print(f"User: {user_input}\n")
    print("Claire: ", end="", flush=True)
    
    try:
        async for token in conversation_manager.stream_response(user_input):
            print(token, end="", flush=True)
        print("\n")
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")

async def test_context_management():
    """Test conversation context and history."""
    
    print("=" * 60)
    print("\n📚 Testing Context Management\n")
    
    # Simulate a conversation
    conversation = [
        "My name is John",
        "I'm taking medication for blood pressure",
        "Can you remind me to check my vitals daily?",
    ]
    
    for msg in conversation:
        print(f"User: {msg}")
        result = await conversation_manager.process_message(msg)
        print(f"Claire: {result.get('response', '')[:80]}...\n")
    
    # Show history
    print(f"Conversation history length: {len(conversation_manager.conversation_history)}")
    print(f"Context: {conversation_manager.get_context()}\n")

async def main():
    """Run all tests."""
    print("\n🚀 Claire Conversational AI Examples\n")
    
    try:
        await test_conversation()
        await test_streaming()
        await test_context_management()
        
        print("=" * 60)
        print("✅ All tests completed!")
        
    except Exception as e:
        print(f"\n❌ Test failed: {str(e)}")

if __name__ == "__main__":
    asyncio.run(main())
