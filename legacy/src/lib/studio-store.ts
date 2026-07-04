import { create } from 'zustand'

export type SceneTemplate = 'news-desk' | 'weather-studio' | 'talk-show' | 'sports-arena' | 'election-hq' | 'breaking-news'
export type CameraPreset = 'wide-shot' | 'medium-shot' | 'close-up' | 'low-angle' | 'overhead' | 'dolly-zoom'
export type LightingPreset = 'broadcast-standard' | 'dramatic' | 'soft-interview' | 'news-bright' | 'cinematic' | 'neon-accents'
export type ARObjectType = 'lower-third' | 'ticker' | 'logo-watermark' | 'data-visual' | 'virtual-screen' | 'particle-effect'
export type StreamQuality = '4K-UHD' | '1080p-HD' | '720p' | 'SD'
export type StreamProtocol = 'SRT' | 'NDI' | 'RTMP' | 'WebRTC' | 'HLS'

export interface ARObject {
  id: string
  type: ARObjectType
  label: string
  visible: boolean
  position: { x: number; y: number; z: number }
  opacity: number
  depth: number
  locked: boolean
}

export interface CameraState {
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  fov: number
  zoom: number
  preset: CameraPreset
  autoTrack: boolean
  trackingSensitivity: number
}

export interface LightingState {
  preset: LightingPreset
  keyIntensity: number
  fillIntensity: number
  rimIntensity: number
  ambientIntensity: number
  colorTemp: number
}

export interface StreamConfig {
  quality: StreamQuality
  protocol: StreamProtocol
  bitrate: number
  frameRate: number
  latency: 'ultra-low' | 'low' | 'normal'
  outputUrl: string
  isLive: boolean
  recording: boolean
}

export interface SceneConfig {
  template: SceneTemplate
  backgroundColor: string
  floorColor: string
  showGrid: boolean
  chromaKey: boolean
  chromaColor: string
}

export interface DepthConfig {
  mode: '2d' | '2.5d' | '3d'
  focalDistance: number
  aperture: number
  bokehIntensity: number
  depthOfField: boolean
}

interface StudioState {
  // Scene
  scene: SceneConfig
  setScene: (scene: Partial<SceneConfig>) => void

  // Camera
  camera: CameraState
  setCamera: (camera: Partial<CameraState>) => void

  // Lighting
  lighting: LightingState
  setLighting: (lighting: Partial<LightingState>) => void

  // AR Objects
  arObjects: ARObject[]
  addARObject: (obj: ARObject) => void
  removeARObject: (id: string) => void
  updateARObject: (id: string, updates: Partial<ARObject>) => void
  toggleARVisibility: (id: string) => void

  // Streaming
  stream: StreamConfig
  setStream: (stream: Partial<StreamConfig>) => void

  // Depth
  depth: DepthConfig
  setDepth: (depth: Partial<DepthConfig>) => void

  // UI State
  activePanel: 'scene' | 'camera' | 'lighting' | 'ar' | 'stream' | 'depth' | 'docs'
  setActivePanel: (panel: StudioState['activePanel']) => void
  isOnAir: boolean
  setIsOnAir: (v: boolean) => void
  fps: number
  setFps: (v: number) => void
  renderQuality: number
  setRenderQuality: (v: number) => void
}

export const useStudioStore = create<StudioState>((set) => ({
  scene: {
    template: 'news-desk',
    backgroundColor: '#0a0a0f',
    floorColor: '#1a1a2e',
    showGrid: true,
    chromaKey: false,
    chromaColor: '#00ff00',
  },
  setScene: (updates) => set((s) => ({ scene: { ...s.scene, ...updates } })),

  camera: {
    position: { x: 0, y: 2.5, z: 8 },
    rotation: { x: -0.15, y: 0, z: 0 },
    fov: 50,
    zoom: 1,
    preset: 'wide-shot',
    autoTrack: false,
    trackingSensitivity: 0.7,
  },
  setCamera: (updates) => set((s) => ({ camera: { ...s.camera, ...updates } })),

  lighting: {
    preset: 'broadcast-standard',
    keyIntensity: 1.2,
    fillIntensity: 0.6,
    rimIntensity: 0.8,
    ambientIntensity: 0.3,
    colorTemp: 5600,
  },
  setLighting: (updates) => set((s) => ({ lighting: { ...s.lighting, ...updates } })),

  arObjects: [
    { id: 'ar-1', type: 'lower-third', label: 'Host Name Tag', visible: true, position: { x: 0, y: -1.2, z: 2 }, opacity: 0.9, depth: 0.5, locked: false },
    { id: 'ar-2', type: 'ticker', label: 'Breaking News Ticker', visible: true, position: { x: 0, y: -2.0, z: 2 }, opacity: 0.85, depth: 0.3, locked: false },
    { id: 'ar-3', type: 'logo-watermark', label: 'Network Logo', visible: true, position: { x: 2.5, y: 2.0, z: 2 }, opacity: 0.6, depth: 0.2, locked: true },
    { id: 'ar-4', type: 'data-visual', label: 'Live Data Panel', visible: false, position: { x: -2, y: 0.5, z: 2 }, opacity: 0.8, depth: 0.7, locked: false },
    { id: 'ar-5', type: 'virtual-screen', label: 'Virtual Monitor', visible: true, position: { x: 3, y: 1.5, z: -2 }, opacity: 1.0, depth: 1.0, locked: false },
  ],
  addARObject: (obj) => set((s) => ({ arObjects: [...s.arObjects, obj] })),
  removeARObject: (id) => set((s) => ({ arObjects: s.arObjects.filter((o) => o.id !== id) })),
  updateARObject: (id, updates) => set((s) => ({
    arObjects: s.arObjects.map((o) => o.id === id ? { ...o, ...updates } : o),
  })),
  toggleARVisibility: (id) => set((s) => ({
    arObjects: s.arObjects.map((o) => o.id === id ? { ...o, visible: !o.visible } : o),
  })),

  stream: {
    quality: '4K-UHD',
    protocol: 'SRT',
    bitrate: 25000,
    frameRate: 60,
    latency: 'ultra-low',
    outputUrl: 'srt://broadcast.local:5000',
    isLive: false,
    recording: false,
  },
  setStream: (updates) => set((s) => ({ stream: { ...s.stream, ...updates } })),

  depth: {
    mode: '2.5d',
    focalDistance: 5,
    aperture: 0.05,
    bokehIntensity: 0.3,
    depthOfField: false,
  },
  setDepth: (updates) => set((s) => ({ depth: { ...s.depth, ...updates } })),

  activePanel: 'scene',
  setActivePanel: (panel) => set({ activePanel: panel }),
  isOnAir: false,
  setIsOnAir: (v) => set({ isOnAir: v }),
  fps: 60,
  setFps: (v) => set({ fps: v }),
  renderQuality: 1.0,
  setRenderQuality: (v) => set({ renderQuality: v }),
}))
