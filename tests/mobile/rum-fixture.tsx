import { useEffect } from "react";
import { startRum, trackRumRoute } from "@/lib/rum/client";
export function RumFixture() {
  useEffect(() => {
    trackRumRoute(location.pathname);
    startRum();
  }, []);
  function interact(duration: number) {
    // Deliberately slow, test-only handlers to exercise real Event Timing.
    const end = performance.now() + duration;
    while (performance.now() < end) {
      /* synthetic main-thread work */
    }
  }
  return (
    <main>
      <button onClick={() => interact(320)}>First slow interaction</button>
      <button onClick={() => interact(240)}>Second slow interaction</button>
    </main>
  );
}
