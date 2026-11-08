// Microphone helpers for the talk screen: secure-context check, Permissions API state, and a friendly way to ask.
// The browser prompt is only ever triggered by requestMic(), which the UI calls AFTER explaining why in big text.

export type MicState = "granted" | "prompt" | "denied" | "insecure" | "unsupported";
export type MicResult = "granted" | "denied" | "nodevice" | "error";

/** Where the page is served from matters: getUserMedia only exists on https:// or http://localhost. */
export function micContextProblem(): "insecure" | "unsupported" | null {
  if (typeof window === "undefined") return "unsupported";
  if (!window.isSecureContext) return "insecure";
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  return null;
}

/** Current microphone permission without triggering a prompt. */
export async function micState(): Promise<MicState> {
  const problem = micContextProblem();
  if (problem) return problem;
  try {
    const p = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return p.state === "granted" ? "granted" : p.state === "denied" ? "denied" : "prompt";
  } catch {
    return "prompt"; // Safari / older browsers have no mic entry in the Permissions API: we find out by asking
  }
}

/** Triggers the browser's own permission prompt, then releases the mic straight away (the agent session opens its own stream). */
export async function requestMic(): Promise<MicResult> {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    return "granted";
  } catch (e) {
    const n = (e as DOMException)?.name;
    if (n === "NotAllowedError" || n === "SecurityError" || n === "PermissionDeniedError") return "denied";
    if (n === "NotFoundError" || n === "OverconstrainedError" || n === "DevicesNotFoundError") return "nodevice";
    return "error";
  }
}

/** Plain-language steps for turning the microphone back on, for the browser the player is using. */
export function reEnableSteps(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1))
    return "Open Settings, find Safari (or your browser), tap Microphone, and choose Allow. Then come back here.";
  if (/Firefox/.test(ua)) return "Click the small microphone or padlock next to the web address, clear the blocked microphone setting, then try again.";
  if (/Android/.test(ua)) return "Tap the padlock next to the web address, tap Permissions, turn Microphone on, then try again.";
  return "Click the padlock (or settings icon) next to the web address, set Microphone to Allow, then reload this page.";
}
