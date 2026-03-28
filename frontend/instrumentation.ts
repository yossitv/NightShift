export async function register() {
  // Only run on the server (not edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWatcher } = await import("./lib/watcher");
    startWatcher();
  }
}
