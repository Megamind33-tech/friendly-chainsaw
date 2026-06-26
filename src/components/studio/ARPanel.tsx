'use client'

import { useStudioStore, type ARObjectType } from '@/lib/studio-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Eye, EyeOff, Lock, Unlock, Plus, Trash2, Layers, Tag, Tv, BarChart3, Sparkles, Monitor } from 'lucide-react'
import { useState } from 'react'

const arTypeIcons: Record<ARObjectType, typeof Tag> = {
  'lower-third': Tag,
  'ticker': Tv,
  'logo-watermark': Eye,
  'data-visual': BarChart3,
  'virtual-screen': Monitor,
  'particle-effect': Sparkles,
}

const arTypeLabels: Record<ARObjectType, string> = {
  'lower-third': 'Lower Third',
  'ticker': 'Ticker',
  'logo-watermark': 'Logo Mark',
  'data-visual': 'Data Visual',
  'virtual-screen': 'Virtual Screen',
  'particle-effect': 'Particles',
}

export default function ARPanel() {
  const { arObjects, addARObject, removeARObject, updateARObject, toggleARVisibility } = useStudioStore()
  const [selectedId, setSelectedId] = useState<string | null>(arObjects[0]?.id || null)
  const [addingType, setAddingType] = useState<ARObjectType | null>(null)

  const selectedObj = arObjects.find(o => o.id === selectedId)

  const handleAdd = (type: ARObjectType) => {
    const id = `ar-${Date.now()}`
    addARObject({
      id,
      type,
      label: `${arTypeLabels[type]} ${arObjects.length + 1}`,
      visible: true,
      position: { x: 0, y: 0, z: 2 },
      opacity: 0.9,
      depth: 0.5,
      locked: false,
    })
    setSelectedId(id)
    setAddingType(null)
  }

  return (
    <div className="space-y-4">
      <Card className="bg-[#0d0d1a] border-[#2a2a3d]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-[#8ab4f8]">
            <Layers className="w-4 h-4" /> AR Overlay Layers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {arObjects.map((obj) => {
            const IconComp = arTypeIcons[obj.type]
            return (
              <div
                key={obj.id}
                onClick={() => setSelectedId(obj.id)}
                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all border ${
                  selectedId === obj.id
                    ? 'bg-[#1a2a3c] border-[#4a90d9]'
                    : 'bg-[#111122] border-[#2a2a3d] hover:border-[#4a90d9]/30'
                }`}
              >
                <IconComp className="w-3.5 h-3.5 text-[#4a90d9] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-[#ccccee] truncate">{obj.label}</div>
                  <div className="text-[9px] text-[#666688]">{arTypeLabels[obj.type]}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleARVisibility(obj.id) }}
                    className="p-1 hover:bg-[#2a2a3d] rounded"
                  >
                    {obj.visible ? (
                      <Eye className="w-3 h-3 text-[#4a90d9]" />
                    ) : (
                      <EyeOff className="w-3 h-3 text-[#666688]" />
                    )}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); updateARObject(obj.id, { locked: !obj.locked }) }}
                    className="p-1 hover:bg-[#2a2a3d] rounded"
                  >
                    {obj.locked ? (
                      <Lock className="w-3 h-3 text-[#ff8844]" />
                    ) : (
                      <Unlock className="w-3 h-3 text-[#666688]" />
                    )}
                  </button>
                  {!obj.locked && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeARObject(obj.id); if (selectedId === obj.id) setSelectedId(null) }}
                      className="p-1 hover:bg-[#2a2a3d] rounded"
                    >
                      <Trash2 className="w-3 h-3 text-[#cc4444]" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {addingType ? (
            <div className="grid grid-cols-3 gap-1.5 mt-2">
              {(Object.keys(arTypeLabels) as ARObjectType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => handleAdd(type)}
                  className="p-2 bg-[#111122] border border-[#2a2a3d] rounded-lg text-center hover:border-[#4a90d9] transition-colors"
                >
                  <div className="text-[9px] text-[#8888aa]">{arTypeLabels[type]}</div>
                </button>
              ))}
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddingType('lower-third')}
              className="w-full mt-2 border-[#2a2a3d] bg-[#111122] text-[#8888aa] hover:bg-[#1a2a3c] hover:text-[#ccccee] text-xs"
            >
              <Plus className="w-3 h-3 mr-1" /> Add AR Overlay
            </Button>
          )}
        </CardContent>
      </Card>

      {selectedObj && (
        <Card className="bg-[#0d0d1a] border-[#2a2a3d]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-[#8ab4f8]">
              <Sparkles className="w-4 h-4" /> Properties: {selectedObj.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#8888aa]">Label</Label>
              <Input
                value={selectedObj.label}
                onChange={(e) => updateARObject(selectedObj.id, { label: e.target.value })}
                className="h-7 text-xs bg-[#111122] border-[#2a2a3d] text-[#ccccee]"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <Label className="text-xs text-[#8888aa]">Position X</Label>
                <span className="text-[10px] text-[#4a90d9]">{selectedObj.position.x.toFixed(1)}</span>
              </div>
              <Slider
                value={[selectedObj.position.x]}
                min={-5}
                max={5}
                step={0.1}
                onValueChange={([v]) => updateARObject(selectedObj.id, { position: { ...selectedObj.position, x: v } })}
                className="[&_[role=slider]]:bg-[#4a90d9]"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <Label className="text-xs text-[#8888aa]">Position Y</Label>
                <span className="text-[10px] text-[#4a90d9]">{selectedObj.position.y.toFixed(1)}</span>
              </div>
              <Slider
                value={[selectedObj.position.y]}
                min={-3}
                max={5}
                step={0.1}
                onValueChange={([v]) => updateARObject(selectedObj.id, { position: { ...selectedObj.position, y: v } })}
                className="[&_[role=slider]]:bg-[#4a90d9]"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <Label className="text-xs text-[#8888aa]">Opacity</Label>
                <span className="text-[10px] text-[#4a90d9]">{(selectedObj.opacity * 100).toFixed(0)}%</span>
              </div>
              <Slider
                value={[selectedObj.opacity]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={([v]) => updateARObject(selectedObj.id, { opacity: v })}
                className="[&_[role=slider]]:bg-[#4a90d9]"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <Label className="text-xs text-[#8888aa]">Depth Layer</Label>
                <span className="text-[10px] text-[#4a90d9]">{selectedObj.depth.toFixed(1)}</span>
              </div>
              <Slider
                value={[selectedObj.depth]}
                min={0}
                max={2}
                step={0.1}
                onValueChange={([v]) => updateARObject(selectedObj.id, { depth: v })}
                className="[&_[role=slider]]:bg-[#4a90d9]"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-[#8888aa]">Visible</Label>
              <Switch
                checked={selectedObj.visible}
                onCheckedChange={() => toggleARVisibility(selectedObj.id)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-[#8888aa]">Locked</Label>
              <Switch
                checked={selectedObj.locked}
                onCheckedChange={(v) => updateARObject(selectedObj.id, { locked: v })}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-[#0d0d1a] border-[#2a2a3d]">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs text-[#8888aa]">Layer Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {arObjects.map((obj, i) => (
              <div key={obj.id} className="flex items-center gap-2 text-[9px]">
                <span className="text-[#666688] w-4">#{i + 1}</span>
                <div className="flex-1 h-1.5 rounded bg-[#111122]">
                  <div
                    className="h-full rounded transition-all"
                    style={{
                      width: `${obj.opacity * 100}%`,
                      backgroundColor: obj.visible ? '#4a90d9' : '#333355',
                      marginLeft: `${obj.depth * 15}%`,
                    }}
                  />
                </div>
                <span className={`w-2 h-2 rounded-full ${obj.visible ? 'bg-green-500' : 'bg-[#333355]'}`} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
