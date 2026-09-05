export type RumbleMsg = {
  type: "rumble";
  duration: number;
  weak: number;
  strong: number;
};

export type WireMsg =
  | { type: "hello"; role: "remote" | "host" }
  | RumbleMsg
  | { type: "stop" }
  | { type: "status"; pad: unknown; caps: unknown; lastRumble: string }
  | { type: "log"; text: string }
  | { type: "ping" }
  | { type: "pong" };

export function parseMsg(raw: unknown): WireMsg | null {
  if (!raw || typeof raw !== "object") return null;
  const msg = raw as WireMsg;
  if (!msg.type) return null;
  return msg;
}
