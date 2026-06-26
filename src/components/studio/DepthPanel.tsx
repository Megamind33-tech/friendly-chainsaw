'use client'

import { useStudioStore } from '@/lib/studio-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Layers, Aperture, Focus, Blend, Box } from 'lucide-react'

export default function DepthPanel() {
  const { depth, setDepth } = useStudioStore()

  return (
    <div className="space-y-4">
      <Card className="bg-[#0d0d1a] border-[#2a2a3d]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-[#8ab4f8]">
            <Layers className="w-4 h-4" /> Depth Mode
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {(['2d', '2.5d', '3d'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setDepth({ mode })}
                className={`p-3 rounded-lg text-center transition-all border ${
                  depth.mode === mode
                    ? 'bg-[#1a3a5c] border-[#4a90d9] text-white'
                    : 'bg-[#111122] border-[#2a2a3d] text-[#8888aa] hover:border-[#4a90d9]/50'
                }`}
              >
                <div className="text-lg font-bold">{mode.toUpperCase()}</div>
                <div className="text-[9px] mt-0.5 opacity-70">
                  {mode === '2d' ? 'Flat composite' : mode === '2.5d' ? 'Parallax depth' : 'Full volumetric'}
                </div>
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1">
            {depth.mode === '2d' && (
              <Badge variant="outline" className="bg-blue-900/30 text-blue-400 border-blue-700 text-[10px] justify-center">
                Flat Layering
              </Badge>
            )}
            {depth.mode === '2.5d' && (
              <Badge variant="outline" className="bg-purple-900/30 text-purple-400 border-purple-700 text-[10px] justify-center col-span-2">
                Parallax Depth Mapping
              </Badge>
            )}
            {depth.mode === '3d' && (
              <Badge variant="outline" className="bg-green-900/30 text-green-400 border-green-700 text-[10px] justify-center col-span-2">
                Volumetric Rendering
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#0d0d1a] border-[#2a2a3d]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-[#8ab4f8]">
            <Focus className="w-4 h-4" /> Depth of Field
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-[#8888aa]">Enable DOF</Label>
            <Switch
              checked={depth.depthOfField}
              onCheckedChange={(v) => setDepth({ depthOfField: v })}
            />
          </div>
          {depth.depthOfField && (
            <>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Label className="text-xs text-[#8888aa]">Focal Distance</Label>
                  <span className="text-[10px] text-[#4a90d9]">{depth.focalDistance.toFixed(1)}m</span>
                </div>
                <Slider
                  value={[depth.focalDistance]}
                  min={0.5}
                  max={20}
                  step={0.5}
                  onValueChange={([v]) => setDepth({ focalDistance: v })}
                  className="[&_[role=slider]]:bg-[#4a90d9]"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Label className="text-xs text-[#8888aa]">Aperture</Label>
                  <span className="text-[10px] text-[#4a90d9]">f/{(1 / depth.aperture).toFixed(1)}</span>
                </div>
                <Slider
                  value={[depth.aperture]}
                  min={0.01}
                  max={0.2}
                  step={0.005}
                  onValueChange={([v]) => setDepth({ aperture: v })}
                  className="[&_[role=slider]]:bg-[#4a90d9]"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Label className="text-xs text-[#8888aa]">Bokeh Intensity</Label>
                  <span className="text-[10px] text-[#4a90d9]">{(depth.bokehIntensity * 100).toFixed(0)}%</span>
                </div>
                <Slider
                  value={[depth.bokehIntensity]}
                  min={0}
                  max={1}
                  step={0.05}
                  onValueChange={([v]) => setDepth({ bokehIntensity: v })}
                  className="[&_[role=slider]]:bg-[#4a90d9]"
                />
              </div>

              {/* Visual DOF representation */}
              <div className="mt-2 p-3 bg-[#111122] rounded-lg border border-[#2a2a3d]">
                <div className="text-[10px] text-[#8888aa] mb-2">Focus Visualization</div>
                <div className="relative h-8 rounded overflow-hidden">
                  <div className="absolute inset-0 flex">
                    <div className="flex-1 flex items-center justify-center" style={{
                      filter: `blur(${Math.max(0, (5 - depth.focalDistance) * depth.aperture * 10 * depth.bokehIntensity)}px)`
                    }}>
                      <Box className="w-4 h-4 text-[#4a90d9]" />
                    </div>
                    <div className="flex-1 flex items-center justify-center" style={{
                      filter: `blur(${Math.max(0, Math.abs(depth.focalDistance - 5) * depth.aperture * 5 * depth.bokehIntensity)}px)`
                    }}>
                      <Box className="w-4 h-4 text-[#4a90d9]" />
                    </div>
                    <div className="flex-1 flex items-center justify-center" style={{
                      filter: `blur(${Math.max(0, (depth.focalDistance - 5) * depth.aperture * 10 * depth.bokehIntensity)}px)`
                    }}>
                      <Box className="w-4 h-4 text-[#4a90d9]" />
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#4a90d9] to-transparent"
                    style={{ left: `${(depth.focalDistance / 20) * 100}%`, width: '20%' }}
                  />
                </div>
                <div className="flex justify-between text-[8px] text-[#666688] mt-1">
                  <span>Near</span>
                  <span>Focus</span>
                  <span>Far</span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="bg-[#0d0d1a] border-[#2a2a3d]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-[#8ab4f8]">
            <Aperture className="w-4 h-4" /> AR Depth Integration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 bg-[#111122] rounded-lg border border-[#2a2a3d]">
            <div className="text-[10px] text-[#8888aa] mb-2">Depth Layer Map</div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-[#666688] w-16">Foreground</span>
                <div className="flex-1 h-3 rounded bg-[#1a3a5c] w-full" />
                <span className="text-[9px] text-[#4a90d9]">0.0</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-[#666688] w-16">Midground</span>
                <div className="flex-1 h-3 rounded bg-[#2a4a6c]" style={{ width: '60%', marginLeft: '20%' }} />
                <span className="text-[9px] text-[#4a90d9]">1.0</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-[#666688] w-16">Background</span>
                <div className="flex-1 h-3 rounded bg-[#3a5a7c]" style={{ width: '40%', marginLeft: '60%' }} />
                <span className="text-[9px] text-[#4a90d9]">2.0</span>
              </div>
            </div>
          </div>

          <div className="p-3 bg-[#111122] rounded-lg border border-[#2a2a3d]">
            <div className="text-[10px] text-[#8888aa] mb-1">Depth Statistics</div>
            <div className="grid grid-cols-2 gap-2 text-[9px]">
              <div>
                <span className="text-[#666688]">AR Layers:</span>{' '}
                <span className="text-[#4a90d9]">5 active</span>
              </div>
              <div>
                <span className="text-[#666688]">Depth Range:</span>{' '}
                <span className="text-[#4a90d9]">0.2 - 2.0</span>
              </div>
              <div>
                <span className="text-[#666688]">Mode:</span>{' '}
                <span className="text-[#4a90d9]">{depth.mode.toUpperCase()}</span>
              </div>
              <div>
                <span className="text-[#666688]">DOF:</span>{' '}
                <span className="text-[#4a90d9]">{depth.depthOfField ? 'Active' : 'Off'}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
