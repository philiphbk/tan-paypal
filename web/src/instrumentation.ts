/**
 * Runs once when the server starts. Sweeps for lapsed PayPal holds every 10
 * minutes so a deal nobody opens still moves to EXPIRED. The same sweep is
 * exposed at /api/cron/sweep for an external scheduler.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DISABLE_SWEEPER === "1") return;
  const { sweepAll } = await import("./lib/sweeper");
  const run = () => sweepAll().catch((err) => console.error("Expiry sweep failed:", err));
  setTimeout(run, 15_000).unref();
  setInterval(run, 10 * 60_000).unref();
}
