export type RumbleMsg = {
  type: "rumble";
  duration: number;
  weak: number;
  strong: number;
  sequenceId?: number;
};

export type WireMsg =
  | { type: "auth_request"; token: string; clientName?: string }
  | { type: "auth_response"; success: boolean; error?: string; hostSessionId?: string }
  | { type: "hello"; role: "remote" | "host" }
  | RumbleMsg
  | { type: "stop" }
  | {
      type: "status";
      pad: unknown;
      caps: unknown;
      lastRumble: string;
      authenticated?: boolean;
      sessionId?: string;
    }
  | { type: "log"; text: string }
  | { type: "ping"; ts?: number }
  | { type: "pong"; ts?: number };

export function parseMsg(raw: unknown): WireMsg | null {
  if (!raw || typeof raw !== "object") return null;
  const msg = raw as WireMsg;
  if (!msg.type) return null;
  return msg;
}

