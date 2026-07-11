import { createContext, useContext, type MutableRefObject } from "react";

export interface ArMotionContextValue {
  opacity: number;
  textDisplay?: string;
}

export const ArMotionContext = createContext<MutableRefObject<ArMotionContextValue> | null>(null);

export function useArMotionRef(): MutableRefObject<ArMotionContextValue> {
  const ref = useContext(ArMotionContext);
  return ref ?? { current: { opacity: 1 } };
}

/** Multiply authored material opacity by the current AR choreography fade. */
export function useArMotionOpacity(baseOpacity: number): number {
  const ref = useArMotionRef();
  return baseOpacity * ref.current.opacity;
}
