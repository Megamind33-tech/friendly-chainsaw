import { Rect } from "react-konva";

interface SafeAreasProps {
  width: number;
  height: number;
}

/** Title/action-safe guide overlay — editor-only chrome, never in the renderer. */
export function SafeAreas({ width, height }: SafeAreasProps) {
  const actionInsetX = width * 0.05;
  const actionInsetY = height * 0.05;
  const titleInsetX = width * 0.1;
  const titleInsetY = height * 0.1;

  return (
    <>
      <Rect
        x={actionInsetX}
        y={actionInsetY}
        width={width - actionInsetX * 2}
        height={height - actionInsetY * 2}
        stroke="#4a90d9"
        strokeWidth={1}
        dash={[6, 6]}
        listening={false}
        opacity={0.3}
      />
      <Rect
        x={titleInsetX}
        y={titleInsetY}
        width={width - titleInsetX * 2}
        height={height - titleInsetY * 2}
        stroke="#4a90d9"
        strokeWidth={1}
        dash={[6, 6]}
        listening={false}
        opacity={0.15}
      />
    </>
  );
}
