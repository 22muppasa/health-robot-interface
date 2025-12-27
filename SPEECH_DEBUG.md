# Speech Recognition Debugging Guide

## Quick Test Steps

1. **Open your browser's Developer Tools**
   - Chrome/Edge: Press `F12` or `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
   - Firefox: Press `F12`
   - Look at the **Console** tab

2. **Check if you see these messages when Voice Assistant is enabled:**
   ```
   🎧 Wake word detection started - listening for "claire"
   ```

3. **Try speaking and look for these messages:**
   ```
   Detected: [what you said] (final: false)
   Detected: [what you said] (final: true)
   ```

## Common Issues

### "Browser Not Supported"
- Your browser doesn't support Web Speech API
- **Solution**: Use Chrome, Firefox, Edge, or Safari (latest versions)

### No "Wake word detection started" message
- Microphone permission not granted
- **Solution**: 
  1. Click the microphone icon in your browser address bar
  2. Allow microphone access
  3. Refresh the page
  4. Try again

### Messages show but "Wake word detected" doesn't appear
- The system heard you but didn't recognize the word "Claire"
- **Solution**: 
  1. Speak more clearly
  2. Say "Claire" followed by a pause
  3. Then say your command (e.g., "check my vitals")
  4. Example: "Claire... [wait] ...check my vitals"

### Getting "audio-capture" error
- Browser can't access your microphone
- **Solution**:
  1. Check if another app is using the microphone
  2. Restart the browser
  3. Check system audio settings

### Getting "no-speech" error and it stops
- This is normal! The system is just waiting for you to speak
- The system will automatically restart listening

## Test Procedure

1. Open browser console (F12)
2. Enable Voice Assistant (toggle the switch)
3. Wait for 🎧 message
4. Speak clearly: "Claire check my vitals"
5. Look for 🎤 Wake word detected message
6. Should see assistant response or error

## What happens with each message

| Message | Meaning | Action |
|---------|---------|--------|
| 🎧 Started | Ready to listen | Speak now |
| Detected: | Heard some speech | Continue speaking |
| 🎤 Wake word detected | Recognized "Claire" | Process command |
| ⏹️ Ended | Stopped listening | System will restart |
| 🔄 Restarting | Preparing to listen again | Wait a moment |
| ❌ Error | Something went wrong | Check error type |

## Advanced Debugging

Enable extra logging by adding this to browser console:
```javascript
// Increase logging
window.localStorage.debug = '*'
```

Then refresh and try again.
