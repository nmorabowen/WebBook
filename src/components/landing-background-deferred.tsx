"use client";

import { useEffect, useState } from "react";
import { LandingBackground } from "@/components/landing-background";
import { LandingBackgroundStatic } from "@/components/landing-background-static";

export function LandingBackgroundDeferred() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const activate = () => {
      if (!cancelled) {
        setIsReady(true);
      }
    };

    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(() => activate(), { timeout: 600 });
      return () => {
        cancelled = true;
        idleWindow.cancelIdleCallback?.(idleId);
      };
    }

    const timer = window.setTimeout(activate, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return isReady ? <LandingBackground /> : <LandingBackgroundStatic />;
}
