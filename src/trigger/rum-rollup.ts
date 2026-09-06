import { schedules } from "@trigger.dev/sdk";
import { refreshRumP75 } from "@/lib/rum/store";
export const rumRollup = schedules.task({
  id: "rum-vitals-p75-hourly",
  cron: "5 * * * *",
  run: async () => {
    if (process.env.RUM_ENABLED !== "true") return { enabled: false };
    const rows = await refreshRumP75();
    return { rows };
  },
});
