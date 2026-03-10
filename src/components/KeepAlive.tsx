import { useEffect, useRef } from "react";
import { ping } from "@/lib/api";

/**
 * Periodically pings the backend to keep it from spinning down on Render.
 * Only runs if the tab is active/visible (standard strategy).
 */
export function KeepAlive() {
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // 20 secs
    const PING_INTERVAL_MS = 20000;

    const runPing = async () => {
      console.debug("[KeepAlive] Pinging backend...");
      await ping();
    };

    // Initial ping
    runPing();

    timerRef.current = setInterval(runPing, PING_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return null; // Side-effect only
}
