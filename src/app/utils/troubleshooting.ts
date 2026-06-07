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
  // Phrase-based fast path. Keep phrases for structured/unambiguous inputs.
  // Natural language falls back to classifyNodeAnswer (AI) in App.tsx.
  nodeAnswerMap: Record<string, { phrases: string[]; nextId: string; label: string }[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT KNOWLEDGE BASE
// ─────────────────────────────────────────────────────────────────────────────

export interface ComponentInfo {
  name: string;
  aliases: string[];
  function: string;
  properFunctions: string[];
}

export const components: ComponentInfo[] = [
  {
    name: 'Faucet',
    aliases: ['faucet', 'tap', 'temperature selector', 'temp selector'],
    function: 'Temperature Selector & Sensor',
    properFunctions: [
      'Sensor and buttons are sensitive to touch.',
      'Water stops when hand is removed from sensor range.',
      'Water does not leak when the faucet is inactive.',
    ],
  },
  {
    name: 'Thermostat',
    aliases: ['thermostat', 'valve', 'water mixer', 'mixer'],
    function: 'Valve / Water Mixer',
    properFunctions: [
      'Produces a click sound when starting and stopping water dispense.',
      'Produces a whirring sound when the temperature is being changed.',
    ],
  },
  {
    name: 'Water Heater',
    aliases: ['heater', 'water heater'],
    function: 'Heater',
    properFunctions: [
      'Warm to the touch during normal operation.',
      'Heats water to 50°C.',
    ],
  },
  {
    name: 'Control Device',
    aliases: ['control device', 'cd', 'brain', 'power distributor'],
    function: 'Brain / Power Distributor',
    properFunctions: [
      '28 VDC LED is permanently on.',
      '115 VAC LED turns on when the power switch is on.',
      'Heater LED powers on when the heater is actively heating (demanded by thermostat).',
      'Water flow automatically stops after 45s even if hands are present, in case of IR sensor failure.',
      'Clean mode temporarily disables water supply for 60s to allow cleaning of the sink.',
    ],
  },
];

export function findComponentInfo(input: string): ComponentInfo | null {
  const lower = input.toLowerCase();
  return components.find(c =>
    c.aliases.some(alias => lower.includes(alias))
  ) ?? null;
}

export function formatComponentAnswer(c: ComponentInfo): string {
  const lines = [
    `${c.name} — ${c.function}`,
    '',
    'Normal / proper functions:',
    ...c.properFunctions.map((f, i) => `${i + 1}. ${f}`),
  ];
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-WALK HELPER (phrase-match only)
// ─────────────────────────────────────────────────────────────────────────────

export interface WalkStep {
  nodeId: string;
  autoLabel: string | null;
}

/**
 * Walks the flow from startId using phrase matching only.
 * Stops at the first node that cannot be phrase-matched.
 * App.tsx's aiAssistedWalk wraps this with an AI fallback.
 */
export function walkFlow(
  flow: TroubleshootingFlow,
  userInput: string
): WalkStep[] {
  const lower = userInput.toLowerCase();
  const steps: WalkStep[] = [];
  let currentId = flow.startId;

  while (true) {
    const node = flow.nodes[currentId];
    if (!node) break;

    if (!node.options) {
      steps.push({ nodeId: currentId, autoLabel: null });
      break;
    }

    const answers = flow.nodeAnswerMap[currentId] ?? [];
    let matched: { phrases: string[]; nextId: string; label: string } | null = null;
    for (const answer of answers) {
      if (answer.phrases.some(p => lower.includes(p))) {
        matched = answer;
        break;
      }
    }

    if (matched) {
      steps.push({ nodeId: currentId, autoLabel: matched.label });
      currentId = matched.nextId;
    } else {
      steps.push({ nodeId: currentId, autoLabel: null });
      break;
    }
  }

  return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// TROUBLESHOOTING FLOWS
// ─────────────────────────────────────────────────────────────────────────────

export const flows: TroubleshootingFlow[] = [

  // ── 1. NO WATER ───────────────────────────────────────────────────────────
  {
    id: 'no-water',
    keywords: [
      'no water', 'water not coming', 'water not dispensing',
      'no flow', 'dry faucet', 'nil water', 'nil flow',
    ],
    startId: 'check-sov',
    nodeAnswerMap: {
      'check-sov': [
        {
          label: 'SOV is Opened',
          nextId: 'check-cd',
          phrases: ['sov is open', 'sov open', 'sov opened', 'sov is opened'],
        },
        {
          label: 'SOV is Closed',
          nextId: 'sov-closed',
          phrases: ['sov is closed', 'sov closed'],
        },
      ],
      'sov-closed': [
        {
          label: 'Leak from faucet',
          nextId: 'check-faucet',
          phrases: ['leak from faucet', 'faucet leak', 'leaking from faucet'],
        },
        {
          label: 'Leak from thermostat or heater',
          nextId: 'replace-as-required',
          phrases: ['leak from thermostat', 'leak from heater', 'thermostat leak', 'heater leak'],
        },
      ],
      'check-faucet': [
        {
          label: 'Leaking from non-designated outlet',
          nextId: 'replace-faucet-leaking',
          phrases: ['non-designated', 'non designated', 'wrong outlet', 'leaking from non'],
        },
        {
          label: 'Faucet leaking when deactivated',
          nextId: 'replace-thermostat-leaking',
          phrases: ['leaking when deactivated', 'leaking when inactive', 'faucet deactivated'],
        },
      ],
      'check-cd': [
        {
          label: 'Control Device No Power',
          nextId: 'replace-cd',
          phrases: ['Control Device no power', 'Control Device has no power', 'no power to Control Device', 'Control Device not powered'],
        },
        {
          label: 'Control Device Powered',
          nextId: 'check-faucet-power',
          phrases: ['Control Device powered', 'Control Device has power', 'Control Device receiving power', 'Control Device is powered'],
        },
      ],
      'check-faucet-power': [
        {
          label: 'Faucet No Power',
          nextId: 'replace-faucet-no-power',
          phrases: ['faucet no power', 'faucet has no power', 'no power to faucet', 'faucet not powered'],
        },
        {
          label: 'Faucet Powered',
          nextId: 'check-thermostat-sound',
          phrases: ['faucet powered', 'faucet has power', 'faucet receiving power', 'faucet is powered'],
        },
      ],
      'check-thermostat-sound': [
        {
          label: 'No click sound',
          nextId: 'replace-thermostat-no-sound',
          phrases: ['no click', 'no click sound', 'thermostat no click', 'no sound from thermostat'],
        },
        {
          label: 'Click sound present',
          nextId: 'check-for-fod',
          phrases: ['click present', 'click sound present', 'clickout', 'thermostat clicks', 'click heard'],
        },
      ],
    },
    nodes: {
      'check-sov': {
        question: 'Check SOV\n\nIs the SOV opened or closed?',
        options: [
          { label: 'SOV is Opened', nextId: 'check-cd' },
          { label: 'SOV is Closed', nextId: 'sov-closed' },
        ],
      },
      'sov-closed': {
        question: 'SOV is Closed\n\nOpen the SOV fully and check if water is flowing properly or if there is any leaks.',
        options: [
          { label: 'Leak from faucet', nextId: 'check-faucet' },
          { label: 'Leak from thermostat or heater', nextId: 'replace-as-required' },
          { label: 'Water flowing properly with no leaks', nextId: 'issue-resolved'},
          { label: 'Faucet has no water', nextId: 'check-cd'},
        ],
      },
      'issue-resolved': {
        solution: 'Faucet has water now. To monitor for recurrence.',
      },
      'check-faucet': {
        question: 'Check leakage location\n\nHow is the water leaking?',
        options: [
          { label: 'Leaking from non-designated outlet', nextId: 'replace-faucet-leaking' },
          { label: 'Faucet leaking when deactivated', nextId: 'replace-thermostat-leaking' },
        ],
      },
      'replace-as-required': {
        solution: 'Replace as Required\n\nInspect the thermostat and heater. Replace the faulty component as identified.',
      },
      'replace-faucet-leaking': {
        solution: 'Faucet is most likely leaking. You can try replacing the faucet unit.',
      },
      'replace-thermostat-leaking': {
        solution: 'Thermostat is most likely the issue. You can try replacing the thermostat unit.',
      },
      'check-cd': {
        question: 'Check Control Device Toggle & Connectors\n\nIs the Control Device receiving power?',
        options: [
          { label: 'Control Device No Power', nextId: 'replace-cd' },
          { label: 'Control Device Powered', nextId: 'check-faucet-power' },
        ],
      },
      'replace-cd': {
        solution: 'Control Device has no power. Check connectors and replace the Control Device as required.',
      },
      'check-faucet-power': {
        question: 'Check Faucet\n\nIs the faucet receiving power?',
        options: [
          { label: 'Faucet No Power', nextId: 'replace-faucet-no-power' },
          { label: 'Faucet Powered', nextId: 'check-thermostat-sound' },
        ],
      },
      'replace-faucet-no-power': {
        solution: 'Without power, the faucet sensor cannot activate to trigger water flow. You can try replacing the faucet unit.',
      },
      'check-thermostat-sound': {
        question: 'Check thermostat for sound\n\nDoes the thermostat make a click sound when activated?',
        options: [
          { label: 'No click sound', nextId: 'replace-thermostat-no-sound' },
          { label: 'Click sound present', nextId: 'check-for-fod' },
        ],
      },
      'replace-thermostat-no-sound': {
        solution: 'Thermostat is most likely the issue. You can try replacing the thermostat unit.',
      },
      'check-for-fod': {
        solution: 'FOD between the faucet and thermostat can obstruct the water path or interfere with connections. You can try removing any FOD between faucet and thermostat.',
      },
    },
  },

  // ── 2. WATER LEAKING ─────────────────────────────────────────────────────
  {
    id: 'water-leaking',
    keywords: [
      'leaking', 'leak', 'water leak', 'faucet leak',
      'dripping', 'water drip', 'drips',
    ],
    startId: 'check-faucet',
    nodeAnswerMap: {
      'check-faucet': [
        {
          label: 'Leaking from non-designated outlet',
          nextId: 'replace-faucet-leaking',
          phrases: ['non-designated', 'non designated', 'wrong outlet', 'leaking from non'],
        },
        {
          label: 'Faucet leaking when deactivated',
          nextId: 'replace-thermostat-leaking',
          phrases: ['leaking when deactivated', 'leaking when inactive', 'faucet deactivated'],
        },
      ],
    },
    nodes: {
      'check-faucet': {
        question: 'Check leakage location\n\nHow is the water leaking?',
        options: [
          { label: 'Leaking from non-designated outlet', nextId: 'replace-faucet-leaking' },
          { label: 'Faucet leaking when deactivated', nextId: 'replace-thermostat-leaking' },
        ],
      },
      'replace-faucet-leaking': {
        solution: 'Faucet is leaking. You can try replacing the faucet unit.',
      },
      'replace-thermostat-leaking': {
        solution: 'Thermostat is the issue. You can try replacing the thermostat unit.',
      },
    },
  },

  // ── 3. WATER FLOW NON-STOP ────────────────────────────────────────────────
  {
    id: 'water-nonstop',
    keywords: [
      'non stop', 'nonstop', 'continuous flow', 'wont stop', "won't stop",
      'water keeps flowing', 'water running', 'constant flow', 'keeps running',
    ],
    startId: 'check-timing',
    nodeAnswerMap: {
      'check-timing': [
        {
          label: 'Stops after 45s',
          nextId: 'clean-ir-sensor',
          phrases: ['stops after 45', 'stops at 45', 'stopped after 45'],
        },
        {
          label: 'Does not stop after 45s',
          nextId: 'replace-thermostat',
          phrases: ['does not stop after 45', 'wont stop after 45', "won't stop after 45"],
        },
      ],
      'clean-ir-sensor': [
        {
          label: 'Yes, still flowing',
          nextId: 'replace-faucet',
          phrases: ['still flowing', 'still nonstop', 'still running'],
        },
        {
          label: 'No, issue resolved',
          nextId: 'issue-resolved',
          phrases: ['resolved', 'issue resolved', 'stopped after clean'],
        },
      ],
    },
    nodes: {
      'check-timing': {
        question: 'Check Timing\n\nDoes the water stop after 45 seconds?',
        options: [
          { label: 'Stops after 45s', nextId: 'clean-ir-sensor' },
          { label: 'Does not stop after 45s', nextId: 'replace-thermostat' },
        ],
      },
      'replace-thermostat': {
        solution: 'Thermostat is the issue. You can try replacing the thermostat unit.',
      },
      'clean-ir-sensor': {
        question: 'Clean the IR Sensor / Button\n\nAfter cleaning, is the water still flowing non-stop?',
        options: [
          { label: 'Yes, still flowing', nextId: 'replace-faucet' },
          { label: 'No, issue resolved', nextId: 'issue-resolved' },
        ],
      },
      'replace-faucet': {
        solution: 'The IR sensor inside the faucet is likely faulty and continuously triggering water flow even without presence detection. You can try replacing the faucet unit.',
      },
      'issue-resolved': {
        solution: 'Cleaning the IR sensor restored normal operation. A dirty or obstructed sensor can falsely signal that hands are present, keeping the valve open. To monitor for recurrence.',
      },
    },
  },

  // ── 4. WATER TEMPERATURE CANNOT BE ADJUSTED ──────────────────────────────
  {
    id: 'water-temp-adjust',
    keywords: [
      'cannot adjust', 'temp not changing', 'temperature cannot',
      'temp selector', 'cannot change temperature', 'temperature adjustment',
    ],
    startId: 'faucet-temperature-indicator',
    nodeAnswerMap: {
      'faucet-temperature-indicator': [
        {
          label: 'Yes, responsive',
          nextId: 'check-thermostat-whirring',
          phrases: ['indicator ok', 'indicator responsive', 'faucet indicator ok'],
        },
        {
          label: 'No, non-responsive',
          nextId: 'replace-faucet',
          phrases: ['indicator not responsive', 'indicator unresponsive', 'indicator not working'],
        },
      ],
      'check-thermostat-whirring': [
        {
          label: 'Yes, whirring present',
          nextId: 'check-heater',
          phrases: ['whirring present', 'thermostat whirring', 'whirring sound'],
        },
        {
          label: 'No whirring / knocking sound when restarting Control Device',
          nextId: 'replace-thermostat-whirring',
          phrases: ['no whirring', 'no whirring sound', 'knocking sound'],
        },
      ],
      'check-heater': [
        {
          label: 'Heater is Cold',
          nextId: 'replace-heater',
          phrases: ['heater cold', 'heater is cold', 'cold heater'],
        },
        {
          label: 'Heater is Warm',
          nextId: 'replace-thermostat',
          phrases: ['heater warm', 'heater is warm', 'warm heater'],
        },
      ],
    },
    nodes: {
      'faucet-temperature-indicator': {
        question: 'Check the faucet temperature indicator\n\nIs the indicator responsive?',
        options: [
          { label: 'Yes, responsive', nextId: 'check-thermostat-whirring' },
          { label: 'No, non-responsive', nextId: 'replace-faucet' },
        ],
      },
      'replace-faucet': {
        solution: 'A non-responsive temperature indicator means the faucet cannot communicate the desired temperature to the thermostat. You can try replacing the faucet unit.',
      },
      'check-thermostat-whirring': {
        question: 'Check thermostat sound when changing temperature\n\nIs a whirring sound present at every interval?',
        options: [
          { label: 'Yes, whirring present', nextId: 'check-heater' },
          { label: 'No whirring / knocking sound when restarting Control Device', nextId: 'replace-thermostat-whirring' },
        ],
      },
      'replace-thermostat-whirring': {
        solution: 'No whirring sound — thermostat (Valve Water Mixer) is faulty. Replace the thermostat.',
      },
      'check-heater': {
        question: 'Check Heater\n\nWhat is the condition of the heater?',
        options: [
          { label: 'Heater is Cold', nextId: 'replace-heater' },
          { label: 'Heater is Warm', nextId: 'replace-thermostat' },
        ],
      },
      'replace-heater': {
        solution: 'Heater is cold — not functioning. Replace the water heater unit.',
      },
      'replace-thermostat': {
        solution: 'Thermostat is the issue. You can try replacing the thermostat unit.',
      },
    },
  },

  // ── 5. WATER NOT HOT ─────────────────────────────────────────────────────
  {
    id: 'water-not-hot',
    keywords: [
      'not hot', 'cold water', 'water cold', 'no hot water',
      'water not heating', 'lukewarm', 'water warm', 'nil hot',
    ],
    startId: 'faucet-temperature-indicator',
    nodeAnswerMap: {
      'faucet-temperature-indicator': [
        {
          label: 'Yes, responsive',
          nextId: 'check-thermostat-whirring',
          phrases: ['indicator ok', 'indicator responsive', 'faucet indicator ok'],
        },
        {
          label: 'No, non-responsive',
          nextId: 'replace-faucet',
          phrases: ['indicator not responsive', 'indicator unresponsive', 'indicator not working'],
        },
      ],
      'check-thermostat-whirring': [
        {
          label: 'Yes, whirring present',
          nextId: 'check-heater',
          phrases: ['whirring present', 'thermostat whirring', 'whirring sound'],
        },
        {
          label: 'No whirring / knocking sound when restarting Control Device',
          nextId: 'replace-thermostat-whirring',
          phrases: ['no whirring', 'no whirring sound', 'knocking sound'],
        },
      ],
      'check-heater': [
        {
          label: 'Heater is Cold',
          nextId: 'replace-heater',
          phrases: ['heater cold', 'heater is cold', 'cold heater'],
        },
        {
          label: 'Heater is Warm',
          nextId: 'replace-thermostat',
          phrases: ['heater warm', 'heater is warm', 'warm heater'],
        },
      ],
    },
    nodes: {
      'faucet-temperature-indicator': {
        question: 'Check the faucet temperature indicator\n\nIs the indicator responsive?',
        options: [
          { label: 'Yes, responsive', nextId: 'check-thermostat-whirring' },
          { label: 'No, non-responsive', nextId: 'replace-faucet' },
        ],
      },
      'replace-faucet': {
        solution: 'Temperature indicator is non-responsive. You can try replacing the faucet unit.',
      },
      'check-thermostat-whirring': {
        question: 'Check thermostat sound when changing temperature\n\nIs a whirring sound present at every interval?',
        options: [
          { label: 'Yes, whirring present', nextId: 'check-heater' },
          { label: 'No whirring / knocking sound when restarting Control Device', nextId: 'replace-thermostat-whirring' },
        ],
      },
      'replace-thermostat-whirring': {
        solution: 'No whirring sound — thermostat (Valve Water Mixer) is faulty. Replace the thermostat.',
      },
      'check-heater': {
        question: 'Check Heater\n\nWhat is the condition of the heater?',
        options: [
          { label: 'Heater is Cold', nextId: 'replace-heater' },
          { label: 'Heater is Warm', nextId: 'replace-thermostat' },
        ],
      },
      'replace-heater': {
        solution: 'Heater is cold — not operating. Replace the water heater.',
      },
      'replace-thermostat': {
        solution: 'Thermostat is the issue. You can try replacing the thermostat unit.',
      },
    },
  },

  // ── 6. WATER PRESSURE TOO HIGH (RCL) ─────────────────────────────────────
  {
    id: 'water-pressure',
    keywords: [
      'pressure', 'high pressure', 'rcl', 'water pressure',
      'pressure too high', 'knocking', 'knocking sound', 'skyroom',
    ],
    startId: 'replace-faucet-pressure',
    nodeAnswerMap: {},
    nodes: {
      'replace-faucet-pressure': {
        solution: 'Ensure the SOV is fully open when the faucet is replaced.',
      },
    },
  },

];

// ── Flow matcher ───────────────────────────────────────────────────────────
export function findTroubleshootingFlow(input: string): TroubleshootingFlow | null {
  const lower = input.toLowerCase();
  return flows.find(flow =>
    flow.keywords.some(keyword => lower.includes(keyword))
  ) ?? null;
}
