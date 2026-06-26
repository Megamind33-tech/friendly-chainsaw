'use client'

import { useStudioStore, type StreamQuality, type StreamProtocol } from '@/lib/studio-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Radio, Wifi, Monitor, CircleDot, Circle, Signal, Settings, Activity } from 'lucide-react'
import { useState, useEffect } from 'react'

const qualityOptions: { id: StreamQuality; label: string; res: string }[] = [
  { id: '4K-UHD', label: '4K UHD', res: '3840×2160' },
  { id: '1080p-HD', label: '1080p HD', res: '1920×1080' },
  { id: '720p', label: '720p', res: '1280×720' },
  { id: 'SD', label: 'SD', res: '640×480' },
]

const protocolOptions: { id: StreamProtocol; label: string; desc: string }[] = [
  { id: 'SRT', label: 'SRT', desc: 'Secure Reliable Transport - Ultra low latency' },
  { id: 'NDI', label: 'NDI', desc: 'Network Device Interface - Studio LAN' },
  { id: 'RTMP', label: 'RTMP', desc: 'Real-Time Messaging Protocol' },
  { id: 'WebRTC', label: 'WebRTC', desc: 'Browser real-time communication' },
  { id: 'HLS', label: 'HLS', desc: 'HTTP Live Streaming - CDN delivery' },
]

export default function StreamPanel() {
  const { stream, setStream, isOnAir, setIsOnAir } = useStudioStore()
  const [elapsedTime, setElapsedTime] = useState(0)

  // Reset timer when going off air
  const [wasOnAir, setWasOnAir] = useState(false)
  if (wasOnAir && !isOnAir) {
    setElapsedTime(0)
    setWasOnAir(false)
  }
  if (!wasOnAir && isOnAir) {
    setWasOnAir(true)
  }

  useEffect(() => {
    if (!isOnAir) return
    const id = setInterval(() => {
      setElapsedTime((t) => t + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [isOnAir])

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-4">
      {/* ON AIR Control */}
      <Card className={`bg-[#0d0d1a] border-2 ${isOnAir ? 'border-red-500 shadow-[0_0_20px_rgba(255,0,0,0.2)]' : 'border-[#2a2a3d]'}`}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full ${isOnAir ? 'bg-red-500 animate-pulse' : 'bg-[#333355]'}`} />
              <div>
                <div className={`text-lg font-bold ${isOnAir ? 'text-red-400' : 'text-[#666688]'}`}>
                  {isOnAir ? 'ON AIR' : 'STANDBY'}
                </div>
                {isOnAir && (
                  <div className="text-xs text-[#8888aa] font-mono">{formatTime(elapsedTime)}</div>
                )}
              </div>
            </div>
            <Button
              onClick={() => setIsOnAir(!isOnAir)}
              className={`${isOnAir
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
              } px-6`}
            >
              {isOnAir ? 'STOP' : 'GO LIVE'}
            </Button>
          </div>
          {isOnAir && (
            <div className="mt-3 flex items-center gap-2">
              <Badge variant="outline" className="bg-red-900/30 text-red-400 border-red-700 text-[10px] animate-pulse">
                <Circle className="w-2 h-2 mr-1 fill-red-400" /> LIVE
              </Badge>
              <Badge variant="outline" className="bg-green-900/30 text-green-400 border-green-700 text-[10px]">
                <Signal className="w-2.5 h-2.5 mr-1" /> Connected
              </Badge>
              <Badge variant="outline" className="bg-blue-900/30 text-blue-400 border-blue-700 text-[10px]">
                <Activity className="w-2.5 h-2.5 mr-1" /> {stream.fps || 60} FPS
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quality */}
      <Card className="bg-[#0d0d1a] border-[#2a2a3d]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-[#8ab4f8]">
            <Monitor className="w-4 h-4" /> Output Quality
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {qualityOptions.map((q) => (
              <button
                key={q.id}
                onClick={() => setStream({ quality: q.id })}
                className={`p-2.5 rounded-lg text-center transition-all border ${
                  stream.quality === q.id
                    ? 'bg-[#1a3a5c] border-[#4a90d9] text-white'
                    : 'bg-[#111122] border-[#2a2a3d] text-[#8888aa] hover:border-[#4a90d9]/50'
                }`}
              >
                <div className="text-xs font-semibold">{q.label}</div>
                <div className="text-[9px] opacity-70">{q.res}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Protocol */}
      <Card className="bg-[#0d0d1a] border-[#2a2a3d]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-[#8ab4f8]">
            <Wifi className="w-4 h-4" /> Stream Protocol
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {protocolOptions.map((p) => (
            <button
              key={p.id}
              onClick={() => setStream({ protocol: p.id })}
              className={`w-full p-2.5 rounded-lg text-left transition-all border flex items-center gap-3 ${
                stream.protocol === p.id
                  ? 'bg-[#1a3a5c] border-[#4a90d9] text-white'
                  : 'bg-[#111122] border-[#2a2a3d] text-[#8888aa] hover:border-[#4a90d9]/50'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                stream.protocol === p.id ? 'bg-[#4a90d9]/30 text-[#4a90d9]' : 'bg-[#1a1a2e] text-[#666688]'
              }`}>
                {p.id}
              </div>
              <div>
                <div className="text-[11px] font-semibold">{p.label}</div>
                <div className="text-[9px] opacity-70">{p.desc}</div>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Bitrate & Framerate */}
      <Card className="bg-[#0d0d1a] border-[#2a2a3d]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-[#8ab4f8]">
            <Settings className="w-4 h-4" /> Encoding
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Label className="text-xs text-[#8888aa]">Bitrate (Mbps)</Label>
              <span className="text-[10px] text-[#4a90d9]">{stream.bitrate}</span>
            </div>
            <Slider
              value={[stream.bitrate]}
              min={2}
              max={50000}
              step={500}
              onValueChange={([v]) => setStream({ bitrate: v })}
              className="[&_[role=slider]]:bg-[#4a90d9]"
            />
            <div className="flex justify-between text-[9px] text-[#666688]">
              <span>2 Mbps</span>
              <span>50,000 Mbps</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Label className="text-xs text-[#8888aa]">Frame Rate</Label>
              <span className="text-[10px] text-[#4a90d9]">{stream.frameRate} fps</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[24, 30, 60].map((fps) => (
                <button
                  key={fps}
                  onClick={() => setStream({ frameRate: fps })}
                  className={`p-1.5 rounded text-[10px] font-semibold transition-all border ${
                    stream.frameRate === fps
                      ? 'bg-[#1a3a5c] border-[#4a90d9] text-white'
                      : 'bg-[#111122] border-[#2a2a3d] text-[#8888aa]'
                  }`}
                >
                  {fps}fps
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-[#8888aa]">Latency Mode</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['ultra-low', 'low', 'normal'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setStream({ latency: mode })}
                  className={`p-1.5 rounded text-[10px] font-semibold transition-all border ${
                    stream.latency === mode
                      ? 'bg-[#1a3a5c] border-[#4a90d9] text-white'
                      : 'bg-[#111122] border-[#2a2a3d] text-[#8888aa]'
                  }`}
                >
                  {mode === 'ultra-low' ? 'Ultra-Low' : mode === 'low' ? 'Low' : 'Normal'}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Output URL & Recording */}
      <Card className="bg-[#0d0d1a] border-[#2a2a3d]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-[#8ab4f8]">
            <Radio className="w-4 h-4" /> Output
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-[#8888aa]">Stream URL</Label>
            <Input
              value={stream.outputUrl}
              onChange={(e) => setStream({ outputUrl: e.target.value })}
              className="h-8 text-xs bg-[#111122] border-[#2a2a3d] text-[#ccccee] font-mono"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-[#8888aa] flex items-center gap-1">
              <CircleDot className="w-3 h-3" /> Local Recording
            </Label>
            <button
              onClick={() => setStream({ recording: !stream.recording })}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                stream.recording ? 'bg-red-600' : 'bg-[#2a2a3d]'
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                stream.recording ? 'translate-x-4' : 'translate-x-1'
              }`} />
            </button>
          </div>
          {stream.recording && (
            <Badge variant="outline" className="bg-red-900/30 text-red-400 border-red-700 text-[10px]">
              <Circle className="w-2 h-2 mr-1 fill-red-400" /> Recording
            </Badge>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
