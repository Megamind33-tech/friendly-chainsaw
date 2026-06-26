'use client'

import { useStudioStore, type LightingPreset } from '@/lib/studio-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { Sun, Lightbulb, Zap, Thermometer } from 'lucide-react'

const lightPresets: { id: LightingPreset; label: string; key: number; fill: number; rim: number; amb: number; temp: number }[] = [
  { id: 'broadcast-standard', label: 'Broadcast Standard', key: 1.2, fill: 0.6, rim: 0.8, amb: 0.3, temp: 5600 },
  { id: 'dramatic', label: 'Dramatic', key: 1.8, fill: 0.2, rim: 1.2, amb: 0.1, temp: 3200 },
  { id: 'soft-interview', label: 'Soft Interview', key: 0.6, fill: 0.8, rim: 0.4, amb: 0.5, temp: 4500 },
  { id: 'news-bright', label: 'News Bright', key: 1.5, fill: 1.0, rim: 0.6, amb: 0.6, temp: 6500 },
  { id: 'cinematic', label: 'Cinematic', key: 1.0, fill: 0.3, rim: 1.5, amb: 0.15, temp: 3800 },
  { id: 'neon-accents', label: 'Neon Accents', key: 0.8, fill: 0.4, rim: 2.0, amb: 0.2, temp: 7500 },
]

export default function LightingPanel() {
  const { lighting, setLighting } = useStudioStore()

  return (
    <div className="space-y-4">
      <Card className="bg-[#0d0d1a] border-[#2a2a3d]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-[#8ab4f8]">
            <Zap className="w-4 h-4" /> Lighting Presets
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {lightPresets.map((p) => (
              <button
                key={p.id}
                onClick={() => setLighting({
                  preset: p.id,
                  keyIntensity: p.key,
                  fillIntensity: p.fill,
                  rimIntensity: p.rim,
                  ambientIntensity: p.amb,
                  colorTemp: p.temp,
                })}
                className={`p-2.5 rounded-lg text-left transition-all border ${
                  lighting.preset === p.id
                    ? 'bg-[#1a3a5c] border-[#4a90d9] text-white'
                    : 'bg-[#111122] border-[#2a2a3d] text-[#8888aa] hover:border-[#4a90d9]/50'
                }`}
              >
                <div className="text-[11px] font-semibold">{p.label}</div>
                <div className="flex gap-1 mt-1">
                  <div className="h-1 rounded-full bg-[#ffaa44]" style={{ width: `${p.key * 30}%` }} />
                  <div className="h-1 rounded-full bg-[#4488ff]" style={{ width: `${p.fill * 30}%` }} />
                  <div className="h-1 rounded-full bg-[#aa88ff]" style={{ width: `${p.rim * 20}%` }} />
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#0d0d1a] border-[#2a2a3d]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-[#8ab4f8]">
            <Sun className="w-4 h-4" /> Light Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label className="text-xs text-[#ffaa44] flex items-center gap-1">
                <Lightbulb className="w-3 h-3" /> Key Light
              </Label>
              <span className="text-[10px] text-[#ffaa44]">{lighting.keyIntensity.toFixed(1)}</span>
            </div>
            <Slider
              value={[lighting.keyIntensity]}
              min={0}
              max={3}
              step={0.1}
              onValueChange={([v]) => setLighting({ keyIntensity: v })}
              className="[&_[role=slider]]:bg-[#ffaa44]"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label className="text-xs text-[#4488ff] flex items-center gap-1">
                <Lightbulb className="w-3 h-3" /> Fill Light
              </Label>
              <span className="text-[10px] text-[#4488ff]">{lighting.fillIntensity.toFixed(1)}</span>
            </div>
            <Slider
              value={[lighting.fillIntensity]}
              min={0}
              max={2}
              step={0.1}
              onValueChange={([v]) => setLighting({ fillIntensity: v })}
              className="[&_[role=slider]]:bg-[#4488ff]"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label className="text-xs text-[#aa88ff] flex items-center gap-1">
                <Lightbulb className="w-3 h-3" /> Rim Light
              </Label>
              <span className="text-[10px] text-[#aa88ff]">{lighting.rimIntensity.toFixed(1)}</span>
            </div>
            <Slider
              value={[lighting.rimIntensity]}
              min={0}
              max={3}
              step={0.1}
              onValueChange={([v]) => setLighting({ rimIntensity: v })}
              className="[&_[role=slider]]:bg-[#aa88ff]"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label className="text-xs text-[#88aa88] flex items-center gap-1">
                <Lightbulb className="w-3 h-3" /> Ambient
              </Label>
              <span className="text-[10px] text-[#88aa88]">{lighting.ambientIntensity.toFixed(1)}</span>
            </div>
            <Slider
              value={[lighting.ambientIntensity]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={([v]) => setLighting({ ambientIntensity: v })}
              className="[&_[role=slider]]:bg-[#88aa88]"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#0d0d1a] border-[#2a2a3d]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-[#8ab4f8]">
            <Thermometer className="w-4 h-4" /> Color Temperature
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Label className="text-xs text-[#8888aa]">Temperature</Label>
              <span className="text-[10px] text-[#4a90d9]">{lighting.colorTemp}K</span>
            </div>
            <Slider
              value={[lighting.colorTemp]}
              min={2500}
              max={9000}
              step={100}
              onValueChange={([v]) => setLighting({ colorTemp: v })}
              className="[&_[role=slider]]:bg-[#4a90d9]"
            />
            <div className="flex justify-between text-[9px] text-[#666688]">
              <span>Warm (2500K)</span>
              <span>Cool (9000K)</span>
            </div>
          </div>
          <div className="h-2 rounded-full" style={{
            background: 'linear-gradient(to right, #ff8833, #ffcc88, #ffffff, #aaccff, #6688ff)'
          }} />
          <div className="flex gap-2 mt-1">
            <Badge variant="outline" className="text-[9px]" style={{
              backgroundColor: lighting.colorTemp < 4000 ? '#ff883322' : 'transparent',
              borderColor: lighting.colorTemp < 4000 ? '#ff8833' : '#2a2a3d',
              color: lighting.colorTemp < 4000 ? '#ff8833' : '#666688'
            }}>
              Warm
            </Badge>
            <Badge variant="outline" className="text-[9px]" style={{
              backgroundColor: lighting.colorTemp >= 4000 && lighting.colorTemp < 6500 ? '#ffcc8822' : 'transparent',
              borderColor: lighting.colorTemp >= 4000 && lighting.colorTemp < 6500 ? '#ffcc88' : '#2a2a3d',
              color: lighting.colorTemp >= 4000 && lighting.colorTemp < 6500 ? '#ffcc88' : '#666688'
            }}>
              Neutral
            </Badge>
            <Badge variant="outline" className="text-[9px]" style={{
              backgroundColor: lighting.colorTemp >= 6500 ? '#aaccff22' : 'transparent',
              borderColor: lighting.colorTemp >= 6500 ? '#aaccff' : '#2a2a3d',
              color: lighting.colorTemp >= 6500 ? '#aaccff' : '#666688'
            }}>
              Cool
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
