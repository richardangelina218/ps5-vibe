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
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    await nav.wakeLock?.request("screen");
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

export function sanitizeSessionId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 24);
}

export function peerIdFor(code: string): string {
  const clean = sanitizeSessionId(code) || "default";
  return `ps5vibe-${clean.toUpperCase()}`;
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
