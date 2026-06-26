'use client'

import { useStudioStore, type SceneTemplate } from '@/lib/studio-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Monitor, Layout, Palette, Grid3X3 } from 'lucide-react'

const templates: { id: SceneTemplate; label: string; desc: string }[] = [
  { id: 'news-desk', label: 'News Desk', desc: 'Classic anchor desk setup' },
  { id: 'weather-studio', label: 'Weather Studio', desc: 'Large weather map wall' },
  { id: 'talk-show', label: 'Talk Show', desc: 'Interview seating layout' },
  { id: 'sports-arena', label: 'Sports Arena', desc: 'Scoreboard & podium' },
  { id: 'election-hq', label: 'Election HQ', desc: 'Multi-screen data wall' },
  { id: 'breaking-news', label: 'Breaking News', desc: 'LED wall & urgent layout' },
]

export default function ScenePanel() {
  const { scene, setScene } = useStudioStore()

  return (
    <div className="space-y-4">
      <Card className="bg-[#0d0d1a] border-[#2a2a3d]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-[#8ab4f8]">
            <Layout className="w-4 h-4" /> Scene Templates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setScene({ template: t.id })}
                className={`p-3 rounded-lg text-left transition-all border ${
                  scene.template === t.id
                    ? 'bg-[#1a3a5c] border-[#4a90d9] text-white'
                    : 'bg-[#111122] border-[#2a2a3d] text-[#8888aa] hover:border-[#4a90d9]/50'
                }`}
              >
                <div className="text-xs font-semibold">{t.label}</div>
                <div className="text-[10px] mt-0.5 opacity-70">{t.desc}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#0d0d1a] border-[#2a2a3d]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-[#8ab4f8]">
            <Palette className="w-4 h-4" /> Environment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-[#8888aa]">Background Color</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={scene.backgroundColor}
                onChange={(e) => setScene({ backgroundColor: e.target.value })}
                className="w-10 h-8 p-0 border-[#2a2a3d] bg-transparent cursor-pointer"
              />
              <Input
                value={scene.backgroundColor}
                onChange={(e) => setScene({ backgroundColor: e.target.value })}
                className="flex-1 h-8 text-xs bg-[#111122] border-[#2a2a3d] text-[#ccccee]"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-[#8888aa]">Floor Color</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={scene.floorColor}
                onChange={(e) => setScene({ floorColor: e.target.value })}
                className="w-10 h-8 p-0 border-[#2a2a3d] bg-transparent cursor-pointer"
              />
              <Input
                value={scene.floorColor}
                onChange={(e) => setScene({ floorColor: e.target.value })}
                className="flex-1 h-8 text-xs bg-[#111122] border-[#2a2a3d] text-[#ccccee]"
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-[#8888aa] flex items-center gap-2">
              <Grid3X3 className="w-3 h-3" /> Show Grid
            </Label>
            <Switch
              checked={scene.showGrid}
              onCheckedChange={(v) => setScene({ showGrid: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#0d0d1a] border-[#2a2a3d]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-[#8ab4f8]">
            <Monitor className="w-4 h-4" /> Chroma Key
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-[#8888aa]">Enable Chroma Key</Label>
            <Switch
              checked={scene.chromaKey}
              onCheckedChange={(v) => setScene({ chromaKey: v })}
            />
          </div>
          {scene.chromaKey && (
            <div className="space-y-1.5">
              <Label className="text-xs text-[#8888aa]">Key Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={scene.chromaColor}
                  onChange={(e) => setScene({ chromaColor: e.target.value })}
                  className="w-10 h-8 p-0 border-[#2a2a3d] bg-transparent cursor-pointer"
                />
                <Input
                  value={scene.chromaColor}
                  onChange={(e) => setScene({ chromaColor: e.target.value })}
                  className="flex-1 h-8 text-xs bg-[#111122] border-[#2a2a3d] text-[#ccccee]"
                />
              </div>
              <div className="flex gap-1.5 mt-2">
                {['#00ff00', '#0000ff', '#ff00ff', '#00ffff'].map((c) => (
                  <button
                    key={c}
                    onClick={() => setScene({ chromaColor: c })}
                    className="w-8 h-6 rounded border border-[#2a2a3d] transition-transform hover:scale-110"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          )}
          {scene.chromaKey && (
            <Badge variant="outline" className="bg-green-900/30 text-green-400 border-green-700 text-[10px]">
              Chroma Key Active
            </Badge>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
