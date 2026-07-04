'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { BookOpen, ChevronRight, CheckCircle2, AlertTriangle, Info, Wrench, Monitor, Camera, Lightbulb, Radio, Layers, FileText, Zap } from 'lucide-react'

interface DocSection {
  id: string
  title: string
  icon: typeof BookOpen
  content: string[]
  tips?: string[]
  warnings?: string[]
}

const docSections: DocSection[] = [
  {
    id: 'quickstart',
    title: 'Quick Start Guide',
    icon: Zap,
    content: [
      'Welcome to the Virtual Studio Broadcasting System. This platform provides a complete zero-density virtual set environment with real-time 3D rendering, photorealistic lighting, and low-latency streaming capabilities.',
      'To begin, select a scene template from the Scene panel on the right. Each template is pre-configured for different broadcast formats including news, weather, talk shows, sports, election coverage, and breaking news scenarios.',
      'The 3D viewport in the center displays your virtual studio in real-time. Use mouse controls to orbit, zoom, and pan the camera. The control panels on the right side allow you to customize every aspect of your production.',
      'Once your scene is configured, switch to the Stream panel to configure your output settings and go live with a single click.',
    ],
    tips: [
      'Start with the "News Desk" template for the most familiar broadcast setup',
      'Use Ctrl+Scroll to zoom in the 3D viewport',
      'The ON AIR button turns red when you are broadcasting live',
    ],
  },
  {
    id: 'scene-templates',
    title: 'Scene Templates',
    icon: Monitor,
    content: [
      'Six pre-configured scene templates are available, each designed for specific broadcast use cases. Templates include full 3D geometry, lighting setups, and AR overlay configurations.',
      'News Desk: Classic anchor desk with dual virtual monitors. Ideal for standard news broadcasts with two-camera switching. Includes integrated lower-third graphics and ticker positioning.',
      'Weather Studio: Features a large weather map wall with animated data points. Optimized for presenter movement and gesture-based interaction with the virtual map display.',
      'Talk Show: Interview-style seating layout with audience camera view. Includes ambient lighting designed for conversational content and guest interactions.',
      'Sports Arena: Equipped with scoreboard display and presentation podium. Designed for pre-game, halftime, and post-game analysis shows with dynamic data visualization.',
      'Election HQ: Multi-screen data wall configuration for real-time results display. Includes dedicated positions for data graphics, maps, and statistical visualizations.',
      'Breaking News: High-impact LED wall with animated breaking news strip. Optimized for urgent, high-energy broadcasts with maximum visual impact.',
    ],
    tips: [
      'Switch templates on-the-fly even during live broadcasts for dynamic show formats',
      'Chroma Key mode enables compositing with external video sources',
      'Each template automatically adjusts AR overlay positions for optimal framing',
    ],
  },
  {
    id: 'camera-tracking',
    title: 'Camera Tracking',
    icon: Camera,
    content: [
      'The virtual camera system supports six preset positions that replicate standard broadcast camera angles. Each preset includes optimized FOV and position settings for professional framing.',
      'Wide Shot: Establishing shot showing the full studio environment. Use at show open, transitions, and multi-presenter segments. FOV is typically set to 50 degrees for natural perspective.',
      'Medium Shot: Standard framing from waist up. The workhorse of news broadcasting, suitable for most presenter segments. Features 40-degree FOV with balanced depth.',
      'Close Up: Tight framing for emphasis, reactions, and detail shots. 30-degree FOV creates intimate framing that draws viewer attention to the subject.',
      'Low Angle: Creates authority and impact, commonly used for dramatic reveals and powerful statements. 55-degree FOV from below eye level.',
      'Overhead: Top-down perspective for demonstrations, product reveals, and creative transitions. 60-degree FOV from directly above the set.',
      'Dolly Zoom: The classic Hitchcock effect combining camera movement with zoom for dramatic tension. Best used sparingly for maximum impact moments.',
      'Auto Tracking enables the virtual camera to follow presenter movement using sensor data. Adjust sensitivity to control how aggressively the camera follows motion.',
    ],
    tips: [
      'Map camera presets to physical switcher buttons for seamless live transitions',
      'Auto Tracking works best with the Wide Shot preset as a starting position',
      'Use keyboard shortcuts to quickly switch between camera positions during live shows',
    ],
  },
  {
    id: 'lighting',
    title: 'Photorealistic Lighting',
    icon: Lightbulb,
    content: [
      'The lighting system uses physically-based rendering (PBR) with three-point lighting plus ambient fill. Each light source simulates real studio fixtures with accurate falloff and color temperature.',
      'Key Light: The primary illumination source, typically positioned at 45 degrees from the subject. Adjust intensity to control the overall exposure of your scene. Higher values create dramatic, high-contrast looks.',
      'Fill Light: Softens shadows created by the key light. Positioned opposite the key light at reduced intensity. Increasing fill creates a flatter, more even look suitable for news broadcasts.',
      'Rim Light: Creates edge separation between subject and background. Essential for depth perception in virtual environments. Cool-toned rim light (blue/white) is standard for broadcast.',
      'Ambient: Global illumination that fills the entire scene evenly. Prevents complete blackness in shadow areas. Keep low for dramatic looks, increase for bright, open environments.',
      'Color Temperature ranges from 2500K (warm tungsten) to 9000K (cool daylight blue). Standard broadcast temperature is 5600K (daylight balanced). Match your virtual lighting to any physical studio lights.',
      'Six presets provide optimized starting points for different production styles. Adjust individual parameters after selecting a preset to fine-tune the look.',
    ],
    warnings: [
      'Extremely high key light values may cause bloom artifacts on reflective surfaces',
      'Very low ambient combined with high key creates deep shadows that may obscure AR overlays',
      'Color temperatures below 3000K may appear too orange for professional broadcast standards',
    ],
  },
  {
    id: 'ar-overlays',
    title: 'AR Overlays',
    icon: Layers,
    content: [
      'The augmented reality overlay system supports six types of broadcast graphics that integrate seamlessly with the 3D virtual environment. Each overlay type is rendered in correct depth order for realistic compositing.',
      'Lower Third: The standard broadcast name/title graphic. Positioned below frame center, typically displaying host name, title, or location. Supports opacity and depth layering for proper scene integration.',
      'Ticker: Scrolling news ticker for headlines, stock data, or sports scores. Full-width display at the bottom of the frame with configurable scroll speed and content sources.',
      'Logo Watermark: Station or network identification in the corner of the frame. Typically locked and semi-transparent to avoid distracting from content.',
      'Data Visual: Real-time data charts, graphs, and statistics. Ideal for election results, financial data, or sports statistics. Supports live data feeds.',
      'Virtual Screen: 3D-rendered monitor that can display camera feeds, graphics, or video content. Positioned in the virtual set with correct perspective and depth.',
      'Particle Effects: Animated particle systems for special events, celebrations, or visual flair. Configurable color, density, and animation patterns.',
      'Each overlay has individual controls for position, opacity, depth layer, visibility, and lock state. The layer system ensures proper compositing order regardless of 3D camera angle.',
    ],
    tips: [
      'Lock critical overlays like logo watermarks to prevent accidental changes during live broadcasts',
      'Use depth layering to create realistic parallax when the camera moves',
      'Lower opacity on tickers and watermarks to maintain readability without obscuring content',
    ],
  },
  {
    id: 'streaming',
    title: 'Live Streaming',
    icon: Radio,
    content: [
      'The streaming engine supports five broadcast protocols optimized for different latency and quality requirements. Each protocol is configured for professional broadcast workflows with enterprise-grade reliability.',
      'SRT (Secure Reliable Transport): The recommended protocol for low-latency contribution feeds. Provides encryption, packet recovery, and adaptive bitrate over unreliable networks. Ideal for remote studio-to-studio connections.',
      'NDI (Network Device Interface): Zero-latency protocol for studio LAN environments. Perfect for connecting virtual studio output to production switchers and graphics systems within the same facility.',
      'RTMP: Industry-standard protocol for CDN distribution and platform streaming. Widely supported but adds 2-5 seconds of latency. Best for social media and web distribution.',
      'WebRTC: Sub-second latency for browser-based viewing. Ideal for remote production monitoring, IFB feeds, and contributor connections. Supports adaptive quality.',
      'HLS: HTTP-based streaming for CDN delivery at scale. Highest compatibility but 6-30 seconds of latency. Use for VOD archiving and large-scale public distribution.',
      'Bitrate settings range from 2 Mbps to 50,000 Mbps to support all quality levels from SD to 4K UHD. Frame rate options include 24fps (cinematic), 30fps (standard), and 60fps (smooth motion).',
      'Latency modes: Ultra-Low targets sub-second end-to-end delivery, Low targets 1-3 seconds, and Normal allows standard buffering for maximum quality.',
    ],
    warnings: [
      'Always test stream connectivity before going live',
      'Ensure your network bandwidth exceeds your configured bitrate by at least 20%',
      '4K 60fps requires a minimum of 25 Mbps upload speed for stable streaming',
      'SRT protocol requires port forwarding or a bonding device for remote connections',
    ],
  },
  {
    id: 'depth-control',
    title: 'Depth & Compositing',
    icon: Layers,
    content: [
      'The depth control system manages how virtual elements are composited in 3D space, affecting perceived depth and focus. Three depth modes provide different levels of immersion and visual complexity.',
      '2D Mode: Traditional flat compositing where all elements exist on a single plane. Fastest rendering, suitable for simple graphics overlays and lower-power systems.',
      '2.5D Mode: Parallax depth mapping creates the illusion of depth using displacement. Elements at different depth layers move at different speeds when the camera pans, creating a convincing 3D effect without full volumetric rendering.',
      '3D Mode: Full volumetric rendering with proper occlusion, parallax, and depth testing. The most realistic compositing mode, essential for AR elements that interact with the physical set.',
      'Depth of Field (DOF) simulation adds cinematic focus effects. The focal distance determines the sharp focus point, while aperture controls how quickly focus falls off. Bokeh intensity adjusts the quality of out-of-focus highlights.',
      'The AR Depth Integration system ensures virtual overlays are correctly positioned relative to real-world depth. Each overlay has a depth value that determines its position in the z-buffer, ensuring proper occlusion and compositing.',
    ],
    tips: [
      '2.5D mode offers the best balance of visual quality and performance for most broadcasts',
      'Enable DOF for interview-style segments where subject isolation is important',
      'Match focal distance to your presenter position for the most natural look',
    ],
  },
]

export default function DocsPanel() {
  const [expandedSection, setExpandedSection] = useState<string | null>('quickstart')

  return (
    <div className="space-y-3">
      <Card className="bg-[#0d0d1a] border-[#2a2a3d]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-[#8ab4f8]">
            <BookOpen className="w-4 h-4" /> Production Documentation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline" className="bg-blue-900/30 text-blue-400 border-blue-700 text-[10px]">
              v3.2.0
            </Badge>
            <Badge variant="outline" className="bg-green-900/30 text-green-400 border-green-700 text-[10px]">
              Production Ready
            </Badge>
            <Badge variant="outline" className="bg-purple-900/30 text-purple-400 border-purple-700 text-[10px]">
              Quick Reference
            </Badge>
          </div>
        </CardContent>
      </Card>

      <ScrollArea className="h-[calc(100vh-200px)]">
        <div className="space-y-2 pr-2">
          {docSections.map((section) => {
            const IconComp = section.icon
            const isExpanded = expandedSection === section.id

            return (
              <Card key={section.id} className="bg-[#0d0d1a] border-[#2a2a3d]">
                <button
                  onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                  className="w-full text-left"
                >
                  <CardHeader className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <IconComp className="w-4 h-4 text-[#4a90d9] shrink-0" />
                      <span className="text-xs font-semibold text-[#ccccee] flex-1">{section.title}</span>
                      <ChevronRight className={`w-3.5 h-3.5 text-[#666688] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </div>
                  </CardHeader>
                </button>
                {isExpanded && (
                  <CardContent className="pt-0 pb-3 px-4 space-y-3">
                    {section.content.map((para, i) => (
                      <p key={i} className="text-[11px] text-[#aaaacc] leading-relaxed">{para}</p>
                    ))}
                    {section.tips && section.tips.length > 0 && (
                      <div className="space-y-1.5 mt-2">
                        {section.tips.map((tip, i) => (
                          <div key={i} className="flex gap-2 items-start p-2 bg-green-900/20 rounded-lg border border-green-800/30">
                            <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0 mt-0.5" />
                            <span className="text-[10px] text-green-300">{tip}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {section.warnings && section.warnings.length > 0 && (
                      <div className="space-y-1.5 mt-2">
                        {section.warnings.map((warning, i) => (
                          <div key={i} className="flex gap-2 items-start p-2 bg-yellow-900/20 rounded-lg border border-yellow-800/30">
                            <AlertTriangle className="w-3 h-3 text-yellow-400 shrink-0 mt-0.5" />
                            <span className="text-[10px] text-yellow-300">{warning}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
