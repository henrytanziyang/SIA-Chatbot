export interface TroubleshootingNode {
  question?: string;
  solution?: string;
  options?: { label: string; nextId: string }[];
}

export interface TroubleshootingFlow {
  id: string;
  keywords: string[];
  startId: string;
  nodes: Record<string, TroubleshootingNode>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED NODES (referenced by multiple flows)
//
// These nodes appear as shared steps in the flowchart and are duplicated
// per-flow to keep each flow self-contained.
// ─────────────────────────────────────────────────────────────────────────────

const flows: TroubleshootingFlow[] = [

  // ── 1. NO WATER ───────────────────────────────────────────────────────────
  // Path: No Water → Check SOV
  //   SOV Opened → Check CD toggle & CD connectors
  //     CD No Power → Replace CD
  //     CD Powered  → Check Faucet
  //       Faucet No Power → Replace Faucet
  //       Faucet Powered  → Open and check for leaks → Thermostat or Heater → Replace as required
  //   SOV Closed → [SOV is closed — action: open SOV, then re-check]
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'no-water',
    keywords: [
      'no water', 'water not coming', 'water not dispensing',
      'no flow', 'dry faucet', 'nil water',
    ],
    startId: 'check-sov',
    nodes: {
      'check-sov': {
        question: 'Check SOV\n\nIs the SOV opened or closed?',
        options: [
          { label: 'SOV is Opened', nextId: 'check-cd' },
          { label: 'SOV is Closed', nextId: 'sov-closed' },
        ],
      },
      'sov-closed': {
        solution: 'SOV is Closed\n\nOpen the SOV fully and verify that water flow is restored.',
      },
      'check-cd': {
        question: 'Check CD Toggle & CD Connectors\n\nIs the CD receiving power?',
        options: [
          { label: 'CD No Power', nextId: 'replace-cd' },
          { label: 'CD Powered', nextId: 'check-faucet-power' },
        ],
      },
      'replace-cd': {
        solution: 'Replace CD\n\nCD has no power. Check connectors and replace the Control Device (CD) as required.\n\nCAUTION: Ensure power is isolated before replacing the CD.',
      },
      'check-faucet-power': {
        question: 'Check Faucet\n\nIs the faucet receiving power?',
        options: [
          { label: 'Faucet No Power', nextId: 'replace-faucet-no-power' },
          { label: 'Faucet Powered', nextId: 'open-check-leaks' },
        ],
      },
      'replace-faucet-no-power': {
        solution: 'Replace Faucet\n\nFaucet has no power. Replace the faucet unit.\n\nCAUTION: Isolate water supply (SOV) before replacement.',
      },
      'open-check-leaks': {
        question: 'Open and Check for Leaks\n\nCD and faucet are both powered but no water flows. Open the assembly and inspect. What component appears faulty?',
        options: [
          { label: 'Thermostat or Heater issue found', nextId: 'replace-as-required' },
        ],
      },
      'replace-as-required': {
        solution: 'Replace as Required\n\nInspect the thermostat and heater. Replace the faulty component as identified.',
      },
    },
  },

  // ── 2. WATER LEAKING FROM FAUCET ─────────────────────────────────────────
  // Path: Water leaking from faucet → Check SOV
  //   SOV Closed → Open and check for leaks → Thermostat or Heater → Replace as required
  //   Faucet (SOV open, issue is the faucet) → Check Faucet
  //     Leaking from non-designated outlet → Replace Faucet
  //     Faucet leaking when deactivated → Check Thermostat sound when activated
  //       No click sound → Replace Thermostat
  //       Click sound present → Check for FOD b/w faucet and thermostat
  //         FOD removed / issue resolved → [resolved]
  //         To no avail / recurring → Replace Faucet
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'water-leaking',
    keywords: [
      'leaking', 'leak', 'water leak', 'faucet leak',
      'dripping', 'water drip', 'drips',
    ],
    startId: 'leak-check-sov',
    nodes: {
      'leak-check-sov': {
        question: 'Check SOV\n\nIs the SOV opened or closed?',
        options: [
          { label: 'SOV is Closed', nextId: 'leak-sov-closed' },
          { label: 'SOV is Opened (faucet issue)', nextId: 'leak-check-faucet' },
        ],
      },
      'leak-sov-closed': {
        question: 'Open and Check for Leaks\n\nSOV was closed. Open it and inspect the assembly. What component appears faulty?',
        options: [
          { label: 'Thermostat or Heater issue found', nextId: 'leak-replace-as-required' },
        ],
      },
      'leak-replace-as-required': {
        solution: 'Replace as Required\n\nInspect the thermostat and heater. Replace the faulty component as identified.',
      },
      'leak-check-faucet': {
        question: 'Check Faucet\n\nHow is the faucet leaking?',
        options: [
          { label: 'Leaking from non-designated outlet', nextId: 'replace-faucet-nondesignated' },
          { label: 'Faucet leaking when deactivated', nextId: 'check-thermostat-click' },
        ],
      },
      'replace-faucet-nondesignated': {
        solution: 'Replace Faucet\n\nWater is leaking from a non-designated outlet. Replace the faucet.\n\nCAUTION: Shut off SOV before replacement.',
      },
      'check-thermostat-click': {
        question: 'Check Thermostat Sound When Activated\n\nIs a click sound present when the thermostat activates?',
        options: [
          { label: 'No Click Sound', nextId: 'replace-thermostat-click' },
          { label: 'Click Sound Present', nextId: 'check-fod-leak' },
        ],
      },
      'replace-thermostat-click': {
        solution: 'Replace Thermostat\n\nNo click sound detected — thermostat is faulty. Replace the thermostat.\n\nCAUTION: Isolate electrical supply before replacing.',
      },
      'check-fod-leak': {
        question: 'Check for FOD Between Faucet and Thermostat\n\nWas FOD (Foreign Object Debris) found and removed?',
        options: [
          { label: 'FOD removed — issue resolved', nextId: 'fod-resolved' },
          { label: 'To no avail / recurring issue', nextId: 'replace-faucet-fod' },
        ],
      },
      'fod-resolved': {
        solution: 'FOD Removed\n\nForeign object debris was found and removed between the faucet and thermostat. Verify normal operation after clearing.',
      },
      'replace-faucet-fod': {
        solution: 'Replace Faucet\n\nIssue is recurring or FOD removal did not resolve it. Replace the faucet unit.\n\nCAUTION: Shut off SOV before replacement.',
      },
    },
  },

  // ── 3. WATER FLOW NON-STOP ────────────────────────────────────────────────
  // Path: Water flow non stop → Check timing
  //   Stops after 45s → Clean IR sensor / button
  //   Does not stop after 45s → Check for FOD b/w faucet and thermostat
  //     FOD removed / resolved → [resolved]
  //     To no avail / recurring → Replace Faucet
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'water-nonstop',
    keywords: [
      'non stop', 'nonstop', 'continuous flow', 'wont stop', "won't stop",
      'water keeps flowing', 'water running', 'constant flow', 'keeps running',
    ],
    startId: 'check-timing',
    nodes: {
      'check-timing': {
        question: 'Check Timing\n\nDoes the water stop after 45 seconds?',
        options: [
          { label: 'Stops after 45s', nextId: 'clean-ir-sensor' },
          { label: 'Does not stop after 45s', nextId: 'check-fod-nonstop' },
        ],
      },
      'clean-ir-sensor': {
        solution: 'Clean IR Sensor / Button\n\nWater stops at the 45s safety timeout but the IR sensor is not triggering the cutoff normally. Clean the IR sensor and button assembly.',
      },
      'check-fod-nonstop': {
        question: 'Check for FOD Between Faucet and Thermostat\n\nWas FOD found and removed?',
        options: [
          { label: 'FOD removed — issue resolved', nextId: 'fod-nonstop-resolved' },
          { label: 'To no avail / recurring', nextId: 'replace-faucet-nonstop' },
        ],
      },
      'fod-nonstop-resolved': {
        solution: 'FOD Removed\n\nFOD cleared between faucet and thermostat. Verify water cuts off normally after hand is removed.',
      },
      'replace-faucet-nonstop': {
        solution: 'Replace Faucet\n\nWater flow is non-stop and FOD removal did not resolve the issue. Replace the faucet.\n\nCAUTION: Shut off SOV before replacement.',
      },
    },
  },

  // ── 4. WATER TEMPERATURE CANNOT BE ADJUSTED ──────────────────────────────
  // Path: Water temp cannot be adjusted → Check Heater
  //   Heater is cold → Replace Heater
  //   Heater is warm → Check Thermostat sound when changing temp
  //     No whirring sound → Replace Thermostat
  //     Whirring sound present at every interval → Check Faucet temp indicator
  //       Indicator responsive → Replace as required
  //       Indicator non-responsive → Replace Thermostat
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'water-temp-adjust',
    keywords: [
      'cannot adjust', 'temp not changing', 'temperature cannot', 'temp selector',
      'cannot change temperature', 'temperature adjustment',
    ],
    startId: 'temp-check-heater',
    nodes: {
      'temp-check-heater': {
        question: 'Check Heater\n\nWhat is the condition of the heater?',
        options: [
          { label: 'Heater is Cold', nextId: 'replace-heater-temp' },
          { label: 'Heater is Warm', nextId: 'check-thermostat-whirring-temp' },
        ],
      },
      'replace-heater-temp': {
        solution: 'Replace Heater\n\nHeater is cold — not functioning. Replace the water heater unit.\n\nWARNING: Isolate 115VAC power supply before heater replacement.',
      },
      'check-thermostat-whirring-temp': {
        question: 'Check Thermostat Sound When Changing Temp\n\nIs a whirring sound present at every interval when the temperature is changed?',
        options: [
          { label: 'No Whirring Sound', nextId: 'replace-thermostat-whirring' },
          { label: 'Whirring Sound Present at Every Interval', nextId: 'check-faucet-indicator-temp' },
        ],
      },
      'replace-thermostat-whirring': {
        solution: 'Replace Thermostat\n\nNo whirring sound when changing temperature — thermostat (Valve Water Mixer) is faulty. Replace the thermostat.\n\nCAUTION: Isolate power before replacement.',
      },
      'check-faucet-indicator-temp': {
        question: 'Check Faucet Temp Indicator\n\nIs the temperature indicator on the faucet responsive?',
        options: [
          { label: 'Indicator Responsive', nextId: 'replace-as-required-temp' },
          { label: 'Indicator Non-Responsive', nextId: 'replace-thermostat-indicator' },
        ],
      },
      'replace-as-required-temp': {
        solution: 'Replace as Required\n\nIndicator is responsive but temperature adjustment is still failing. Inspect the faucet and thermostat assembly and replace the faulty component.',
      },
      'replace-thermostat-indicator': {
        solution: 'Replace Thermostat\n\nTemp indicator is non-responsive. Replace the thermostat unit.\n\nCAUTION: Isolate power before replacement.',
      },
    },
  },

  // ── 5. WATER NOT HOT ─────────────────────────────────────────────────────
  // Shares the same Check Heater path as Water Temp Cannot Be Adjusted.
  // Path: Water not hot → Check Heater
  //   Heater is cold → Replace Heater
  //   Heater is warm → Check Thermostat sound when changing temp
  //     No whirring sound → Replace Thermostat
  //     Whirring sound present at every interval → Check Faucet temp indicator
  //       Indicator responsive → Replace as required
  //       Indicator non-responsive → Replace Thermostat
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'water-not-hot',
    keywords: [
      'not hot', 'cold water', 'water cold', 'no hot water',
      'water not heating', 'lukewarm', 'water warm', 'nil hot',
    ],
    startId: 'hot-check-heater',
    nodes: {
      'hot-check-heater': {
        question: 'Check Heater\n\nIs the heater warm to the touch?',
        options: [
          { label: 'Heater is Cold', nextId: 'replace-heater-hot' },
          { label: 'Heater is Warm', nextId: 'check-thermostat-whirring-hot' },
        ],
      },
      'replace-heater-hot': {
        solution: 'Replace Heater\n\nHeater is cold — not operating. Replace the water heater.\n\nWARNING: Isolate 115VAC before replacement.',
      },
      'check-thermostat-whirring-hot': {
        question: 'Check Thermostat Sound When Changing Temp\n\nIs a whirring sound present at every interval when the temperature is changed?',
        options: [
          { label: 'No Whirring Sound', nextId: 'replace-thermostat-hot' },
          { label: 'Whirring Sound Present at Every Interval', nextId: 'check-faucet-indicator-hot' },
        ],
      },
      'replace-thermostat-hot': {
        solution: 'Replace Thermostat\n\nNo whirring sound — thermostat not functioning. Replace thermostat.\n\nCAUTION: Isolate power before replacement.',
      },
      'check-faucet-indicator-hot': {
        question: 'Check Faucet Temp Indicator\n\nIs the temperature indicator on the faucet responsive?',
        options: [
          { label: 'Indicator Responsive', nextId: 'replace-as-required-hot' },
          { label: 'Indicator Non-Responsive', nextId: 'replace-thermostat-indicator-hot' },
        ],
      },
      'replace-as-required-hot': {
        solution: 'Replace as Required\n\nHeater and thermostat appear functional but water is still not hot. Inspect the full assembly and replace the faulty component.',
      },
      'replace-thermostat-indicator-hot': {
        solution: 'Replace Thermostat\n\nTemp indicator non-responsive. Replace thermostat.\n\nCAUTION: Isolate power before replacement.',
      },
    },
  },

  // ── 6. WATER PRESSURE TOO HIGH (RCL) ─────────────────────────────────────
  // Path: Water pressure too high → Is there a knocking sound when restarting CD?
  //   Knocking sound when restarting CD → Ensure SOV is fully opened when faucet is replaced → Replace Faucet
  //   No knocking sound → Replace Faucet
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'water-pressure',
    keywords: [
      'pressure', 'high pressure', 'rcl', 'water pressure',
      'pressure too high', 'knocking', 'knocking sound',
    ],
    startId: 'pressure-knocking',
    nodes: {
      'pressure-knocking': {
        question: 'Water Pressure Too High (RCL)\n\nIs a knocking sound heard when restarting the CD?',
        options: [
          { label: 'Yes — Knocking Sound When Restarting CD', nextId: 'ensure-sov-open' },
          { label: 'No Knocking Sound', nextId: 'replace-faucet-pressure' },
        ],
      },
      'ensure-sov-open': {
        solution: 'Ensure SOV is Fully Opened When Faucet is Replaced\n\nKnocking sound on CD restart indicates residual line pressure. Ensure the SOV is fully opened after faucet replacement to normalise line pressure, then replace the faucet.\n\nCAUTION: Shut off SOV before faucet replacement.',
      },
      'replace-faucet-pressure': {
        solution: 'Replace Faucet\n\nNo knocking sound but pressure is still too high. Replace the faucet and ensure the SOV is fully open afterwards.\n\nCAUTION: Shut off SOV before faucet replacement.',
      },
    },
  },

];

// ── Matcher ────────────────────────────────────────────────────────────────
export function findTroubleshootingFlow(input: string): TroubleshootingFlow | null {
  const lower = input.toLowerCase();
  return flows.find(flow =>
    flow.keywords.some(keyword => lower.includes(keyword))
  ) ?? null;
}
