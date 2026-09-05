export type PadSnapshot = {
  connected: boolean;
  index: number | null;
  id: string;
  mapping: string;
  buttons: number;
  axes: number;
  pressed: string[];
  hasVibration: boolean;
  hapticType: string;
};

const BUTTON_NAMES = [
  "Cross",
  "Circle",
  "Square",
  "Triangle",
  "L1",
  "R1",
  "L2",
  "R2",
  "Create",
  "Options",
  "L3",
  "R3",
  "Up",
  "Down",
  "Left",
  "Right",
  "PS",
  "Touch",
  "Mute",
];

export function emptyPad(): PadSnapshot {
  return {
    connected: false,
    index: null,
    id: "none",
    mapping: "—",
    buttons: 0,
    axes: 0,
    pressed: [],
    hasVibration: false,
    hapticType: "none",
  };
}

export function readPad(): PadSnapshot {
  const pads = navigator.getGamepads?.() ?? [];
  const pad = [...pads].find((p) => p && p.connected);
  if (!pad) return emptyPad();

  const pressed: string[] = [];
  pad.buttons.forEach((b, i) => {
    if (b.pressed) pressed.push(BUTTON_NAMES[i] ?? `#${i}`);
  });

  const actuator = pad.vibrationActuator as
    | (GamepadHapticActuator & { type?: string })
    | null
    | undefined;
  return {
    connected: true,
    index: pad.index,
    id: pad.id || "DualSense",
    mapping: pad.mapping || "unmapped",
    buttons: pad.buttons.length,
    axes: pad.axes.length,
    pressed,
    hasVibration: Boolean(actuator),
    hapticType: actuator?.type ?? (actuator ? "unknown" : "none"),
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
  const pads = navigator.getGamepads?.() ?? [];
  const pad = [...pads].find((p) => p && p.connected);
  if (!pad) throw new Error("No controller connected");
  const actuator = pad.vibrationActuator;
  if (!actuator) {
    throw new Error(
      "This browser/controller has no vibration actuator. Android Chrome + DualSense usually does after you press a button.",
    );
  }

  const ms = Math.max(1, Math.min(5000, Math.round(duration)));
  const weakMagnitude = clamp01(weak);
  const strongMagnitude = clamp01(strong);

  if (typeof actuator.playEffect === "function") {
    await actuator.playEffect("dual-rumble", {
      startDelay: 0,
      duration: ms,
      weakMagnitude,
      strongMagnitude,
    });
    return "dual-rumble";
  }

  const extra = actuator as GamepadHapticActuator & {
    pulse?: (value: number, duration: number) => Promise<boolean>;
  };
  if (typeof extra.pulse === "function") {
    await extra.pulse(Math.max(weakMagnitude, strongMagnitude), ms);
    return "pulse";
  }

  throw new Error("Vibration API present but no playEffect/pulse method");
}

export async function stopRumble(): Promise<void> {
  const pads = navigator.getGamepads?.() ?? [];
  const pad = [...pads].find((p) => p && p.connected);
  const actuator = pad?.vibrationActuator;
  if (!actuator) return;
  const reset = (actuator as GamepadHapticActuator & { reset?: () => Promise<undefined> })
    .reset;
  if (typeof reset === "function") {
    await reset.call(actuator);
    return;
  }
  if (typeof actuator.playEffect === "function") {
    await actuator.playEffect("dual-rumble", {
      startDelay: 0,
      duration: 1,
      weakMagnitude: 0,
      strongMagnitude: 0,
    });
  }
}
