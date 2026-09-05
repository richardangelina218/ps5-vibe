export type CapabilityStatus = {
  secure: boolean;
  gamepadApi: boolean;
  peerApi: boolean;
  wakeLock: boolean;
  userAgent: string;
};

export function capabilities(): CapabilityStatus {
  return {
    secure: window.isSecureContext,
    gamepadApi: typeof navigator.getGamepads === "function",
    peerApi: typeof RTCPeerConnection === "function",
    wakeLock: "wakeLock" in navigator,
    userAgent: navigator.userAgent,
  };
}

export function isAndroidChrome(): boolean {
  const ua = navigator.userAgent;
  return /Android/i.test(ua) && /Chrome/i.test(ua) && !/Edg/i.test(ua);
}

export async function keepAwake(): Promise<boolean> {
  // 1. Try standard Wake Lock API
  try {
    if ("wakeLock" in navigator) {
      const nav = navigator as Navigator & {
        wakeLock: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
      };
      await nav.wakeLock.request("screen");
      return true;
    }
  } catch {
    // Falls through to fallback or user-gesture requirement
  }

  // 2. Invisible loop audio/video element fallback to keep screen alive
  try {
    let dummy = document.getElementById("dummy-awake-media") as HTMLVideoElement | null;
    if (!dummy) {
      dummy = document.createElement("video");
      dummy.id = "dummy-awake-media";
      dummy.setAttribute("playsinline", "");
      dummy.setAttribute("loop", "");
      dummy.setAttribute("muted", "");
      dummy.style.position = "fixed";
      dummy.style.top = "-9999px";
      dummy.style.opacity = "0.01";
      dummy.style.pointerEvents = "none";
      dummy.style.width = "1px";
      dummy.style.height = "1px";
      // 1x1 empty black frame base64 webm
      dummy.src = "data:video/webm;base64,GkXfo0AgQoaBAUL3gQFC8oEEQvOBCEKCQACFHVZXRtaVRUQWRjT3ZlcmNsb2NrZWQ=";
      document.body.appendChild(dummy);
      await dummy.play();
    }
    return true;
  } catch {
    return false;
  }
}

export function randomCode(len = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

export const DEFAULT_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:openrelay.metered.ca:80" },
];

export function sanitizeSessionId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 24);
}

export function peerIdFor(code: string): string {
  const clean = sanitizeSessionId(code) || "room1";
  return `pv2-${clean}`;
}

export function hashToken(str: string): string {
  // Simple quick fast hash for client passcode check
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
