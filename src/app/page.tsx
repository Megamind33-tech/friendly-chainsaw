'use client'

import { Suspense, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useStudioStore } from '@/lib/studio-store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Monitor, Camera, Lightbulb, Layers, Radio, Aperture, BookOpen,
  Circle, Zap, Activity, Cpu, HardDrive, Wifi, Tv, Settings,
  Maximize2, Volume2, RadioIcon, Signal, Clock
} from 'lucide-react'

import ScenePanel from '@/components/studio/ScenePanel'
import CameraPanel from '@/components/studio/CameraPanel'
import LightingPanel from '@/components/studio/LightingPanel'
import ARPanel from '@/components/studio/ARPanel'
import StreamPanel from '@/components/studio/StreamPanel'
import DepthPanel from '@/components/studio/DepthPanel'
import DocsPanel from '@/components/studio/DocsPanel'

const VirtualStudioScene = dynamic(() => import('@/components/studio/VirtualStudioScene'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[#050510] flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-2 border-[#4a90d9] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <div className="text-[#8ab4f8] text-sm font-mono">Initializing 3D Engine...</div>
        <div className="text-[#666688] text-[10px] mt-1 font-mono">Loading virtual studio environment</div>
      </div>
    </div>
  ),
})

const panelConfig = [
  { id: 'scene' as const, label: 'Scene', icon: Monitor },
  { id: 'camera' as const, label: 'Camera', icon: Camera },
  { id: 'lighting' as const, label: 'Lighting', icon: Lightbulb },
  { id: 'ar' as const, label: 'AR', icon: Layers },
  { id: 'stream' as const, label: 'Stream', icon: Radio },
  { id: 'depth' as const, label: 'Depth', icon: Aperture },
  { id: 'docs' as const, label: 'Docs', icon: BookOpen },
]

function StatusBar() {
  const { isOnAir, fps, stream, scene, camera } = useStudioStore()
  const [simFps, setSimFps] = useState(60)
  const [simBitrate, setSimBitrate] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setSimFps(58 + Math.floor(Math.random() * 4))
      if (isOnAir) {
        setSimBitrate(stream.bitrate + Math.floor(Math.random() * 500 - 250))
      } else {
        setSimBitrate(0)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [isOnAir, stream.bitrate])

  return (
    <div className="h-7 bg-[#080812] border-t border-[#1a1a2e] flex items-center px-3 gap-4 text-[9px] font-mono">
      <div className="flex items-center gap-1.5">
        <Cpu className="w-3 h-3 text-[#4a90d9]" />
        <span className="text-[#8888aa]">GPU:</span>
        <span className="text-[#4a90d9]">{simFps} FPS</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Activity className="w-3 h-3 text-[#4a90d9]" />
        <span className="text-[#8888aa]">Render:</span>
        <span className="text-[#4a90d9]">{stream.quality}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Wifi className="w-3 h-3 text-[#4a90d9]" />
        <span className="text-[#8888aa]">Out:</span>
        <span className="text-[#4a90d9]">{stream.protocol}</span>
      </div>
      {isOnAir && (
        <div className="flex items-center gap-1.5">
          <Signal className="w-3 h-3 text-green-400" />
          <span className="text-[#8888aa]">Bitrate:</span>
          <span className="text-green-400">{simBitrate} kbps</span>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <HardDrive className="w-3 h-3 text-[#4a90d9]" />
        <span className="text-[#8888aa]">Scene:</span>
        <span className="text-[#4a90d9]">{scene.template}</span>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <Clock className="w-3 h-3 text-[#666688]" />
        <span className="text-[#666688]">{new Date().toLocaleTimeString()}</span>
      </div>
    </div>
  )
}

export default function Home() {
  const { activePanel, setActivePanel, isOnAir, setIsOnAir, stream } = useStudioStore()
  const [viewportFullscreen, setViewportFullscreen] = useState(false)

  const renderPanel = () => {
    switch (activePanel) {
      case 'scene': return <ScenePanel />
      case 'camera': return <CameraPanel />
      case 'lighting': return <LightingPanel />
      case 'ar': return <ARPanel />
      case 'stream': return <StreamPanel />
      case 'depth': return <DepthPanel />
      case 'docs': return <DocsPanel />
    }
  }

  return (
    <div className="h-screen w-screen bg-[#050510] flex flex-col overflow-hidden">
      {/* Top Header Bar */}
      <header className="h-11 bg-[#0a0a18] border-b border-[#1a1a2e] flex items-center px-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-[#4a90d9] to-[#2a5a8c] rounded flex items-center justify-center">
              <Tv className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#ccccee] tracking-wide">VIRTUAL STUDIO</div>
              <div className="text-[8px] text-[#666688] -mt-0.5">Broadcast System v3.2</div>
            </div>
          </div>
          <Separator orientation="vertical" className="h-6 bg-[#2a2a3d]" />
          <div className="flex items-center gap-2">
            {isOnAir ? (
              <Badge className="bg-red-600 text-white text-[9px] animate-pulse px-2 py-0.5">
                <Circle className="w-1.5 h-1.5 mr-1 fill-white" /> ON AIR
              </Badge>
            ) : (
              <Badge variant="outline" className="border-[#2a2a3d] text-[#666688] text-[9px] px-2 py-0.5">
                STANDBY
              </Badge>
            )}
            {stream.recording && (
              <Badge className="bg-red-800 text-red-200 text-[9px] px-2 py-0.5">
                <Circle className="w-1.5 h-1.5 mr-1 fill-red-200" /> REC
              </Badge>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewportFullscreen(!viewportFullscreen)}
            className="h-7 px-2 text-[#666688] hover:text-[#ccccee] hover:bg-[#1a1a2e]"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            onClick={() => setIsOnAir(!isOnAir)}
            className={`h-7 px-4 text-xs font-bold ${
              isOnAir
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isOnAir ? (
              <><Circle className="w-2.5 h-2.5 mr-1.5 fill-white" /> STOP</>
            ) : (
              <><Zap className="w-2.5 h-2.5 mr-1.5" /> GO LIVE</>
            )}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* 3D Viewport */}
        <div className={`relative ${viewportFullscreen ? 'flex-1' : 'flex-1'}`}>
          <VirtualStudioScene />

          {/* Viewport Overlay */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5">
            <div className="bg-[#0a0a18]/80 backdrop-blur-sm rounded px-2 py-1 flex items-center gap-1.5 border border-[#1a1a2e]">
              <div className={`w-1.5 h-1.5 rounded-full ${isOnAir ? 'bg-red-500 animate-pulse' : 'bg-[#333355]'}`} />
              <span className="text-[9px] font-mono text-[#8ab4f8]">
                {isOnAir ? 'LIVE' : 'PREVIEW'}
              </span>
            </div>
            <div className="bg-[#0a0a18]/80 backdrop-blur-sm rounded px-2 py-1 border border-[#1a1a2e]">
              <span className="text-[9px] font-mono text-[#666688]">
                {stream.quality} | {stream.protocol} | {stream.frameRate}fps
              </span>
            </div>
          </div>

          {/* Safe Area Guides */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-[90%] h-[90%] border border-[#4a90d9]/10 rounded" />
            <div className="absolute w-[80%] h-[80%] border border-[#4a90d9]/5 rounded" />
          </div>

          {/* Crosshair Center */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-8 h-8 relative">
              <div className="absolute top-0 left-1/2 -translate-x-px w-0.5 h-2.5 bg-[#4a90d9]/20" />
              <div className="absolute bottom-0 left-1/2 -translate-x-px w-0.5 h-2.5 bg-[#4a90d9]/20" />
              <div className="absolute left-0 top-1/2 -translate-y-px h-0.5 w-2.5 bg-[#4a90d9]/20" />
              <div className="absolute right-0 top-1/2 -translate-y-px h-0.5 w-2.5 bg-[#4a90d9]/20" />
            </div>
          </div>
        </div>

        {/* Right Control Panel */}
        {!viewportFullscreen && (
          <div className="w-[340px] bg-[#0a0a18] border-l border-[#1a1a2e] flex flex-col shrink-0">
            {/* Panel Tabs */}
            <div className="h-10 bg-[#080812] border-b border-[#1a1a2e] flex items-center px-1 gap-0.5 shrink-0">
              {panelConfig.map((panel) => {
                const IconComp = panel.icon
                return (
                  <button
                    key={panel.id}
                    onClick={() => setActivePanel(panel.id)}
                    className={`flex-1 h-8 rounded flex items-center justify-center gap-1 transition-all text-[10px] font-medium ${
                      activePanel === panel.id
                        ? 'bg-[#1a3a5c] text-[#8ab4f8]'
                        : 'text-[#666688] hover:text-[#aaaacc] hover:bg-[#111122]'
                    }`}
                  >
                    <IconComp className="w-3 h-3" />
                    <span className="hidden xl:inline">{panel.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Panel Content */}
            <ScrollArea className="flex-1">
              <div className="p-3">
                {renderPanel()}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <StatusBar />
    </div>
  )
}
