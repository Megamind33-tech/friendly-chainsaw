import { useEffect, useRef } from "react";

import { useDocStore } from "@/document/store";

import { useDataStore } from "@/document/dataSources";

import type { ID, SetNode } from "@/document/types";

import { hasVerseBindings, maxTransitionDurationMs } from "@/ar-engine/arPrep";



/**

 * When event.verseText changes, run OUT → IN on the AR layer so verse swaps

 * animate instead of hard-cutting — same contract as 2D scripture boards.

 * Holds the previous verse during OUT so text doesn't flash early.

 */

export function useVerseTransition(layerId: ID | undefined, nodes: SetNode[], enabled: boolean) {

  const playIn = useDocStore((s) => s.playIn);

  const playOut = useDocStore((s) => s.playOut);

  const holdVerseData = useDocStore((s) => s.holdVerseData);

  const releaseVerseDataHold = useDocStore((s) => s.releaseVerseDataHold);

  const verseText = useDataStore((s) => s.event.values.verseText);

  const verseRef = useDataStore((s) => s.event.values.verseRef);

  const armed = useRef(false);

  const busy = useRef(false);



  useEffect(() => {

    if (!enabled || !layerId || !hasVerseBindings(nodes)) {

      armed.current = false;

      return;

    }



    if (!armed.current) {

      armed.current = true;

      return;

    }



    if (busy.current) return;

    busy.current = true;

    holdVerseData();

    playOut(layerId);

    const outMs = maxTransitionDurationMs(nodes, "out");

    const timer = window.setTimeout(() => {

      releaseVerseDataHold();

      playIn(layerId);

      busy.current = false;

    }, outMs);



    return () => {

      window.clearTimeout(timer);

      busy.current = false;

    };

  }, [verseText, verseRef, layerId, enabled, nodes, playIn, playOut, holdVerseData, releaseVerseDataHold]);

}

