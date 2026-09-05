export type ControllerType = "dualsense" | "dualshock4" | "xbox" | "generic";

export type PadSnapshot = {
  connected: boolean;
  index: number | null;
  id: string;
  controllerType: ControllerType;
  modelLabel: string;
  mapping: string;
  buttons: number;
  axes: number;
  pressed: string[];
  hasVibration: boolean;
  hapticType: string;
};

const PS_BUTTON_NAMES = [
  "Cross (×)",
  "Circle (○)",
  "Square (□)",
  "Triangle (△)",
  "L1",
  "R1",
  "L2",
  "R2",
  "Create",
  "Options",
  "L3",
  "R3",
  "D-Up",
  "D-Down",
  "D-Left",
  "D-Right",
  "PS",
  "Touchpad",
  "Mute",
];

const XBOX_BUTTON_NAMES = [
  "A",
  "B",
  "X",
  "Y",
  "LB",
  "RB",
  "LT",
  "RT",
  "View",
  "Menu",
  "LS",
  "RS",
  "D-Up",
  "D-Down",
  "D-Left",
  "D-Right",
  "Xbox",
  "Share",
];

export function detectController(id: string): { type: ControllerType; label: string } {
  const lower = id.toLowerCase();
  if (lower.includes("054c") || lower.includes("dualsense") || lower.includes("wireless controller") && (lower.includes("ps5") || lower.includes("0ce6"))) {
    return { type: "dualsense", label: "PlayStation 5 DualSense" };
  }
  if (lower.includes("dualshock") || lower.includes("05c4") || lower.includes("09cc")) {
    return { type: "dualshock4", label: "PlayStation 4 DualShock 4" };
  }
  if (
    lower.includes("xbox") ||
    lower.includes("045e") ||
    lower.includes("x-box") ||
    lower.includes("microsoft") ||
    lower.includes("series x") ||
    lower.includes("series s") ||
    lower.includes("wireless controller")
  ) {
    if (lower.includes("series") || lower.includes("0b12") || lower.includes("0b13")) {
      return { type: "xbox", label: "Xbox Series X|S Wireless Controller" };
    }
    return { type: "xbox", label: "Xbox Wireless Controller" };
  }
  return { type: "generic", label: id || "Standard Gamepad" };
}

export function emptyPad(): PadSnapshot {
  return {
    connected: false,
    index: null,
    id: "none",
    controllerType: "generic",
    modelLabel: "No Controller Detected",
    mapping: "—",
    buttons: 0,
    axes: 0,
    pressed: [],
    hasVibration: false,
    hapticType: "none",
  };
}

export function getActiveGamepad(): Gamepad | null {
  try {
    const raw = navigator.getGamepads ? navigator.getGamepads() : [];
    if (!raw) return null;
    const pads = Array.from(raw).filter((p): p is Gamepad => Boolean(p && p.connected));
    if (!pads.length) return null;

    // Prioritize gamepad that has vibrationActuator or pressed buttons
    const withVib = pads.find(
      (p) =>
        Boolean(p.vibrationActuator) ||
        Boolean((p as unknown as Record<string, unknown>).hapticActuators)
    );
    if (withVib) return withVib;

    const withPressed = pads.find((p) => p.buttons && p.buttons.some((b) => b.pressed || b.value > 0.1));
    if (withPressed) return withPressed;

    return pads[0] ?? null;
  } catch {
    return null;
  }
}

export function readPad(): PadSnapshot {
  const pad = getActiveGamepad();
  if (!pad) return emptyPad();

  const info = detectController(pad.id);
  const buttonMap = info.type === "xbox" ? XBOX_BUTTON_NAMES : PS_BUTTON_NAMES;

  const pressed: string[] = [];
  if (pad.buttons) {
    pad.buttons.forEach((b, i) => {
      if (b && (b.pressed || b.value > 0.15)) {
        pressed.push(buttonMap[i] ?? `#${i}`);
      }
    });
  }

  // Look for any vibration actuator available
  const pAny = pad as unknown as Record<string, unknown>;
  const actuator = (pad.vibrationActuator ||
    (Array.isArray(pAny.hapticActuators) ? pAny.hapticActuators[0] : null)) as
    | (GamepadHapticActuator & { type?: string })
    | null
    | undefined;

  const hasVib = Boolean(actuator || ("vibrate" in navigator));

  return {
    connected: true,
    index: pad.index,
    id: pad.id || "Controller",
    controllerType: info.type,
    modelLabel: info.label,
    mapping: pad.mapping || "standard",
    buttons: pad.buttons ? pad.buttons.length : 0,
    axes: pad.axes ? pad.axes.length : 0,
    pressed,
    hasVibration: hasVib,
    hapticType: actuator?.type ?? (actuator ? "dual-rumble" : "haptic"),
  };
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export async function playRumble(
  duration: number,
  weak: number,
  strong: number,
): Promise<string> {
  const ms = Math.max(20, Math.min(5000, Math.round(duration)));
  const weakMagnitude = clamp01(weak);
  const strongMagnitude = clamp01(strong);

  // Always re-query all connected gamepads right before triggering
  const pad = getActiveGamepad();
  const allRaw = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter((p): p is Gamepad => Boolean(p && p.connected)) : [];
  const candidates = [pad, ...allRaw].filter((p): p is Gamepad => Boolean(p));
  // Deduplicate gamepads
  const uniquePads = Array.from(new Set(candidates));

  const errors: string[] = [];

  for (const candidate of uniquePads) {
    const pAny = candidate as unknown as Record<string, unknown>;
    // Try vibrationActuator as well as hapticActuators array or custom properties
    const actuatorList: any[] = [];
    if (candidate.vibrationActuator) actuatorList.push(candidate.vibrationActuator);
    if (Array.isArray(pAny.hapticActuators)) actuatorList.push(...pAny.hapticActuators);
    if (pAny.haptics) actuatorList.push(pAny.haptics);

    for (const actuator of actuatorList) {
      if (!actuator) continue;

      // 1. Standard Gamepad dual-rumble playEffect
      if (typeof actuator.playEffect === "function") {
        try {
          await actuator.playEffect("dual-rumble", {
            startDelay: 0,
            duration: ms,
            weakMagnitude,
            strongMagnitude,
          });
          return "dual-rumble";
        } catch (e) {
          errors.push(`playEffect(dual-rumble): ${e}`);
          // Some browsers/devices expect "trigger-rumble"
          try {
            await actuator.playEffect("trigger-rumble", {
              startDelay: 0,
              duration: ms,
              weakMagnitude,
              strongMagnitude,
            });
            return "trigger-rumble";
          } catch (e2) {
            errors.push(`playEffect(trigger-rumble): ${e2}`);
          }
        }
      }

      // 2. Pulse method fallback (common in Firefox / WebXR / older Chromium)
      if (typeof actuator.pulse === "function") {
        try {
          await actuator.pulse(Math.max(weakMagnitude, strongMagnitude), ms);
          return "pulse";
        } catch (e) {
          errors.push(`pulse: ${e}`);
        }
      }
    }
  }

  // 3. Fallback to device hardware vibration (Android phone/tablet)
  if ("vibrate" in navigator && typeof navigator.vibrate === "function") {
    try {
      const ok = navigator.vibrate(ms);
      if (ok) {
        return uniquePads.length > 0 ? "phone vibration (controller actuator not exposed)" : "phone vibration";
      }
    } catch (e) {
      errors.push(`vibrate: ${e}`);
    }
  }

  if (uniquePads.length === 0) {
    throw new Error("No controller detected. Please tap any button on your controller to wake it up.");
  }

  const detail = errors.length > 0 ? ` (${errors.join("; ")})` : "";
  throw new Error(`Controller detected (${uniquePads[0].id}), but vibration is blocked or unsupported by this browser. Tip: On Android Chrome, press a controller button and tap the screen once.${detail}`);
}

export async function stopRumble(): Promise<void> {
  const pad = getActiveGamepad();
  if (pad) {
    const pAny = pad as unknown as Record<string, unknown>;
    const actuator = (pad.vibrationActuator ||
      (Array.isArray(pAny.hapticActuators) ? pAny.hapticActuators[0] : null)) as
      | (GamepadHapticActuator & {
          reset?: () => Promise<unknown>;
          playEffect?: (type: string, params: unknown) => Promise<unknown>;
        })
      | null
      | undefined;

    if (actuator) {
      if (typeof actuator.reset === "function") {
        try {
          await actuator.reset();
          return;
        } catch {}
      }
      if (typeof actuator.playEffect === "function") {
        try {
          await actuator.playEffect("dual-rumble", {
            startDelay: 0,
            duration: 1,
            weakMagnitude: 0,
            strongMagnitude: 0,
          });
          return;
        } catch {}
      }
    }
  }

  if ("vibrate" in navigator && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(0);
    } catch {}
  }
}
