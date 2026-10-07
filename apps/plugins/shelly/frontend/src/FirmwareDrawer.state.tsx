export const POLL_INTERVAL_MS = 5000;
export // A Shelly OTA takes ~30-90s including the reboot; past this we stop claiming
// progress and let the operator re-check manually.
const UPDATE_TIMEOUT_MS = 5 * 60 * 1000;
