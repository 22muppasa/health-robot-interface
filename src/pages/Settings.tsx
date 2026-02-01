import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Mic, Zap, Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MicrophoneSettings } from '@/components/MicrophoneSettings';
import { MicrophoneTest } from '@/components/MicrophoneTest';

export default function SettingsPage() {
  const [sensitivityValue, setSensitivityValue] = useState(0.7);

  return (
    <div className="min-h-screen w-full bg-background">
      <div className="w-full h-full overflow-y-auto p-3 sm:p-4 md:p-5 lg:p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Settings</h1>
            <p className="text-sm md:text-base text-muted-foreground">
              Optimize Claire's performance and your preferences
            </p>
          </div>
        </div>

        {/* Settings Tabs */}
        <Tabs defaultValue="audio" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="audio" className="flex items-center gap-2">
              <Mic className="w-4 h-4" />
              <span className="hidden sm:inline">Audio</span>
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              <span className="hidden sm:inline">Performance</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              <span className="hidden sm:inline">Alerts</span>
            </TabsTrigger>
          </TabsList>

          {/* Audio Settings Tab */}
          <TabsContent value="audio" className="space-y-6">
            <MicrophoneSettings onSensitivityChange={setSensitivityValue} />
            <MicrophoneTest />
          </TabsContent>

          {/* Performance Settings Tab */}
          <TabsContent value="performance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Response Optimization</CardTitle>
                <CardDescription>
                  Settings to reduce output delay and improve responsiveness
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Streaming Priority</label>
                  <select className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background">
                    <option value="fast">Fast (Lower Quality)</option>
                    <option value="balanced" selected>
                      Balanced
                    </option>
                    <option value="quality">Quality (Slower)</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Control the trade-off between response speed and accuracy
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Audio Generation</label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" defaultChecked className="w-4 h-4 rounded" />
                    <span className="text-sm">Enable parallel audio generation (faster responses)</span>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Generate audio while response is still streaming
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Response Caching</label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" defaultChecked className="w-4 h-4 rounded" />
                    <span className="text-sm">Cache common responses (instant replay)</span>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Reuse responses to frequently asked questions
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Connection Type</label>
                  <select className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background">
                    <option value="http">HTTP/2 Streaming</option>
                    <option value="websocket">WebSocket (Real-time)</option>
                    <option value="webrtc">WebRTC (Lowest Latency)</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    WebRTC provides the lowest latency but requires more bandwidth
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">System Resources</CardTitle>
                <CardDescription>
                  Manage how Claire uses your device resources
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">CPU Priority</label>
                  <select className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background">
                    <option value="low">Low (Battery Friendly)</option>
                    <option value="normal" selected>
                      Normal
                    </option>
                    <option value="high">High (Performance Focused)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Memory Usage</label>
                  <select className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background">
                    <option value="minimal">Minimal (&lt; 50MB)</option>
                    <option value="normal" selected>
                      Normal (&lt; 200MB)
                    </option>
                    <option value="aggressive">Aggressive (&lt; 500MB)</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Performance Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">Avg Response Time</p>
                    <p className="text-lg font-bold">1.2s</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">Network Latency</p>
                    <p className="text-lg font-bold">45ms</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">TTS Duration</p>
                    <p className="text-lg font-bold">1.8s</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">Accuracy</p>
                    <p className="text-lg font-bold">98.5%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notification Settings Tab */}
          <TabsContent value="notifications" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Reminder Notifications</CardTitle>
                <CardDescription>
                  Configure how and when you receive reminders
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" defaultChecked className="w-4 h-4 rounded" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Voice Notifications</p>
                    <p className="text-xs text-muted-foreground">
                      Receive verbal reminders from Claire
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" defaultChecked className="w-4 h-4 rounded" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Visual Alerts</p>
                    <p className="text-xs text-muted-foreground">
                      Show on-screen notifications
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Sound Effects</p>
                    <p className="text-xs text-muted-foreground">
                      Play notification sounds
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" defaultChecked className="w-4 h-4 rounded" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Medication Reminders</p>
                    <p className="text-xs text-muted-foreground">
                      Alert for medication times
                    </p>
                  </div>
                </label>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Alert Timing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Reminder Advance Notice</label>
                  <select className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background">
                    <option value="5">5 minutes before</option>
                    <option value="15" selected>
                      15 minutes before
                    </option>
                    <option value="30">30 minutes before</option>
                    <option value="60">1 hour before</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Quiet Hours</label>
                  <div className="flex gap-2">
                    <input
                      type="time"
                      defaultValue="22:00"
                      className="flex-1 px-3 py-2 border border-input rounded-md text-sm"
                    />
                    <span className="flex items-center text-muted-foreground">to</span>
                    <input
                      type="time"
                      defaultValue="08:00"
                      className="flex-1 px-3 py-2 border border-input rounded-md text-sm"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Reminders will be silent during these hours
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Save Button */}
        <div className="mt-8 flex gap-2 justify-end">
          <Link to="/">
            <Button variant="outline">Back</Button>
          </Link>
          <Button className="px-6">Save Settings</Button>
        </div>
      </div>
    </div>
  );
}
