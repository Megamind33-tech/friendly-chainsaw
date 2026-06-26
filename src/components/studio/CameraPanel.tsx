'use client'

import { useStudioStore, type CameraPreset } from '@/lib/studio-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Camera, Crosshair, Move, Maximize, Eye, Target } from 'lucide-react'

const cameraPresets: { id: CameraPreset; label: string; icon: string; pos: { x: number; y: number; z: number }; fov: number }[] = [
  { id: 'wide-shot', label: 'Wide Shot', icon: 'W', pos: { x: 0, y: 2.5, z: 8 }, fov: 50 },
  { id: 'medium-shot', label: 'Medium Shot', icon: 'M', pos: { x: 0, y: 2, z: 5 }, fov: 40 },
  { id: 'close-up', label: 'Close Up', icon: 'C', pos: { x: 0, y: 1.8, z: 3 }, fov: 30 },
  { id: 'low-angle', label: 'Low Angle', icon: 'L', pos: { x: 0, y: 0.5, z: 6 }, fov: 55 },
  { id: 'overhead', label: 'Overhead', icon: 'O', pos: { x: 0, y: 8, z: 2 }, fov: 60 },
  { id: 'dolly-zoom', label: 'Dolly Zoom', icon: 'D', pos: { x: -3, y: 2, z: 7 }, fov: 35 },
]

export default function CameraPanel() {
  const { camera, setCamera } = useStudioStore()

  return (
    <div className="space-y-4">
      <Card className="bg-[#0d0d1a] border-[#2a2a3d]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-[#8ab4f8]">
            <Camera className="w-4 h-4" /> Camera Presets
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {cameraPresets.map((p) => (
              <button
                key={p.id}
                onClick={() => setCamera({
                  preset: p.id,
                  position: p.pos,
                  fov: p.fov,
                })}
                className={`p-2.5 rounded-lg text-center transition-all border ${
                  camera.preset === p.id
                    ? 'bg-[#1a3a5c] border-[#4a90d9] text-white'
                    : 'bg-[#111122] border-[#2a2a3d] text-[#8888aa] hover:border-[#4a90d9]/50'
                }`}
              >
                <div className="text-lg font-bold mb-0.5">{p.icon}</div>
                <div className="text-[9px] leading-tight">{p.label}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#0d0d1a] border-[#2a2a3d]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-[#8ab4f8]">
            <Move className="w-4 h-4" /> Camera Position
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Label className="text-xs text-[#8888aa]">X Position</Label>
              <span className="text-[10px] text-[#4a90d9]">{camera.position.x.toFixed(1)}</span>
            </div>
            <Slider
              value={[camera.position.x]}
              min={-10}
              max={10}
              step={0.1}
              onValueChange={([v]) => setCamera({ position: { ...camera.position, x: v } })}
              className="[&_[role=slider]]:bg-[#4a90d9]"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Label className="text-xs text-[#8888aa]">Y Position</Label>
              <span className="text-[10px] text-[#4a90d9]">{camera.position.y.toFixed(1)}</span>
            </div>
            <Slider
              value={[camera.position.y]}
              min={0}
              max={10}
              step={0.1}
              onValueChange={([v]) => setCamera({ position: { ...camera.position, y: v } })}
              className="[&_[role=slider]]:bg-[#4a90d9]"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Label className="text-xs text-[#8888aa]">Z Position</Label>
              <span className="text-[10px] text-[#4a90d9]">{camera.position.z.toFixed(1)}</span>
            </div>
            <Slider
              value={[camera.position.z]}
              min={1}
              max={20}
              step={0.1}
              onValueChange={([v]) => setCamera({ position: { ...camera.position, z: v } })}
              className="[&_[role=slider]]:bg-[#4a90d9]"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#0d0d1a] border-[#2a2a3d]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-[#8ab4f8]">
            <Maximize className="w-4 h-4" /> Lens Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Label className="text-xs text-[#8888aa]">FOV</Label>
              <span className="text-[10px] text-[#4a90d9]">{camera.fov}°</span>
            </div>
            <Slider
              value={[camera.fov]}
              min={10}
              max={90}
              step={1}
              onValueChange={([v]) => setCamera({ fov: v })}
              className="[&_[role=slider]]:bg-[#4a90d9]"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Label className="text-xs text-[#8888aa]">Zoom</Label>
              <span className="text-[10px] text-[#4a90d9]">{camera.zoom.toFixed(1)}x</span>
            </div>
            <Slider
              value={[camera.zoom]}
              min={0.5}
              max={5}
              step={0.1}
              onValueChange={([v]) => setCamera({ zoom: v })}
              className="[&_[role=slider]]:bg-[#4a90d9]"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#0d0d1a] border-[#2a2a3d]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-[#8ab4f8]">
            <Target className="w-4 h-4" /> Camera Tracking
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-[#8888aa] flex items-center gap-2">
              <Crosshair className="w-3 h-3" /> Auto Tracking
            </Label>
            <Switch
              checked={camera.autoTrack}
              onCheckedChange={(v) => setCamera({ autoTrack: v })}
            />
          </div>
          {camera.autoTrack && (
            <>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Label className="text-xs text-[#8888aa]">Tracking Sensitivity</Label>
                  <span className="text-[10px] text-[#4a90d9]">{(camera.trackingSensitivity * 100).toFixed(0)}%</span>
                </div>
                <Slider
                  value={[camera.trackingSensitivity]}
                  min={0.1}
                  max={1}
                  step={0.05}
                  onValueChange={([v]) => setCamera({ trackingSensitivity: v })}
                  className="[&_[role=slider]]:bg-[#4a90d9]"
                />
              </div>
              <Badge variant="outline" className="bg-green-900/30 text-green-400 border-green-700 text-[10px]">
                Tracking Active
              </Badge>
            </>
          )}
          <div className="mt-2 p-2 bg-[#111122] rounded-lg border border-[#2a2a3d]">
            <div className="flex items-center gap-2 mb-1.5">
              <Eye className="w-3 h-3 text-[#4a90d9]" />
              <span className="text-[10px] text-[#8888aa]">Camera Info</span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-[9px]">
              <div className="text-[#666688]">POS</div>
              <div className="text-[#666688]">FOV</div>
              <div className="text-[#666688]">PRESET</div>
              <div className="text-[#4a90d9]">{camera.position.x},{camera.position.y},{camera.position.z}</div>
              <div className="text-[#4a90d9]">{camera.fov}°</div>
              <div className="text-[#4a90d9]">{camera.preset}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
