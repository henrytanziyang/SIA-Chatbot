import { useState, useRef, useEffect } from 'react';
import { Send, Plane } from 'lucide-react';
import { ChatMessage } from './components/ChatMessage';
import { OptionButtons } from './components/OptionButtons';
import {
  TroubleshootingFlow,
  flows as allFlows,
  components,
  formatComponentAnswer,
  walkFlow,
  WalkStep,
} from './utils/troubleshooting';
import React from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  options?: { label: string; nextId: string }[];
  isMidFlowAnswer?: boolean;
  isAutoAnswered?: boolean;
  autoAnswerLabel?: string;
}

interface PendingNode {
  nodeId: string;
  content: string;
  options: { label: string; nextId: string }[];
}

// ── Qwen config ────────────────────────────────────────────────────────────
const QWEN_API_KEY = import.meta.env.VITE_QWEN_API_KEY;
const QWEN_URL = 'https://openrouter.ai/api/v1/chat/completions';
const QWEN_MODEL = 'qwen/qwen2.5-vl-72b-instruct';

const SYSTEM_PROMPT = `You are an SIA aircraft maintenance engineer assistant specialising in A380 systems. Give short, direct answers only.

Rules:
- 5 lines or fewer per response.
- All answers must be in the context of aviation and aircraft maintenance.
- Lead with the most likely cause and the immediate next action.
- Flag CAUTION or WARNING in one line if safety-critical.
- If the symptom is unclear, ask one short clarifying question — nothing else.
- No introductions, no summaries, no repeated information.`;

const FLOW_CLASSIFIER_PROMPT = `You are a routing classifier for an A380 lavatory troubleshooting assistant.

Given a user message, determine if it is describing an A380 lavatory defect/symptom.
If yes, return ONLY the single most matching flow ID from this list:
- no-water         (no water, water not coming out, dry faucet, nil flow, etc.)
- water-leaking    (leak, dripping, water coming from wrong place, etc.)
- water-nonstop    (water won't stop, continuous flow, keeps running, non-stop, etc.)
- water-temp-adjust (cannot change temperature, temp selector not working, temp stuck, etc.)
- water-not-hot    (cold water, water not heating, lukewarm, no hot water, etc.)
- water-pressure   (high pressure, knocking sound, RCL, skyroom, pressure too high, etc.)

If the message is NOT about an A380 lavatory defect, return: null

Rules:
- Return ONLY the flow ID (e.g. "no-water") or the word "null". Nothing else.
- Be tolerant of typos, abbreviations, and paraphrasing.
- The user does not need to say "A380" or "lavatory" explicitly if context is clear from the symptom.`;

const COMPONENT_CLASSIFIER_PROMPT = `You are a classifier for an A380 lavatory component assistant.

Given a user message, determine if they are asking about a specific component.
If yes, return ONLY the matching component name from this list:
- Faucet
- Thermostat
- Water Heater
- Control Device (CD)

If the message is NOT asking about a component, return: null

Rules:
- Return ONLY the component name exactly as shown, or "null". Nothing else.
- Be tolerant of typos, abbreviations, and paraphrasing.
- "CD", "brain", "power distributor" → Control Device (CD)
- "tap", "temp selector", "temperature selector" → Faucet
- "valve", "mixer", "water mixer" → Thermostat
- "heater" → Water Heater`;

// ── Qwen API call (general) ────────────────────────────────────────────────
async function callQwen(
  messages: { role: 'user' | 'assistant'; content: string }[]
): Promise<string> {
  const response = await fetch(QWEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${QWEN_API_KEY}`,
    },
    body: JSON.stringify({
      model: QWEN_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any)?.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? 'No response received.';
}

// ── Qwen classifier ────────────────────────────────────────────────────────
async function callClassifier(systemPrompt: string, userMessage: string): Promise<string> {
  const response = await fetch(QWEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${QWEN_API_KEY}`,
    },
    body: JSON.stringify({
      model: QWEN_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!response.ok) return 'null';

  const data = await response.json();
  return (data.choices?.[0]?.message?.content ?? 'null').trim();
}

// ── AI node answer classifier ──────────────────────────────────────────────
// Sends the current question + options to Qwen and asks which option the
// user's message best matches. Returns nextId of matched option, or null.
async function classifyNodeAnswer(
  question: string,
  options: { label: string; nextId: string }[],
  userMessage: string
): Promise<string | null> {
  const optionList = options.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
  const prompt = `You are helping route an aircraft maintenance engineer's response to a troubleshooting question.

Question asked: "${question}"

Available options:
${optionList}

Engineer's message: "${userMessage}"

Rules:
- Return ONLY the number of the option that best matches (e.g. "1" or "2").
- Only match if the engineer's message clearly contains information relevant to this specific question.
- If the message does not contain enough information to answer this question, return: null
- Do not guess — if unsure, return: null`;

  const response = await fetch(QWEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${QWEN_API_KEY}`,
    },
    body: JSON.stringify({
      model: QWEN_MODEL,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) return null;

  const data = await response.json();
  const raw = (data.choices?.[0]?.message?.content ?? '').trim();
  const index = parseInt(raw) - 1;
  if (isNaN(index) || index < 0 || index >= options.length) return null;
  return options[index].nextId;
}

// ── AI-assisted walk ───────────────────────────────────────────────────────
// Walks the flow from flow.startId using:
//   1. Phrase matching (instant, no API call)
//   2. classifyNodeAnswer fallback (Qwen) for nodes phrase matching can't resolve
// Stops at the first node that neither method can answer.
async function aiAssistedWalk(
  flow: TroubleshootingFlow,
  userInput: string
): Promise<WalkStep[]> {
  const steps: WalkStep[] = [];
  let currentId = flow.startId;

  while (true) {
    const node = flow.nodes[currentId];
    if (!node) break;

    // Solution node — nothing left to resolve
    if (!node.options) {
      steps.push({ nodeId: currentId, autoLabel: null });
      break;
    }

    // 1. Try phrase match first (instant)
    const phraseSteps = walkFlow({ ...flow, startId: currentId }, userInput);
    if (phraseSteps.length > 0 && phraseSteps[0].autoLabel !== null) {
      const matched = phraseSteps[0];
      steps.push(matched);
      const nextId = node.options.find(o => o.label === matched.autoLabel)?.nextId;
      if (!nextId) break;
      currentId = nextId;
      continue;
    }

    // 2. AI classifier fallback — handles natural language
    const matchedNextId = await classifyNodeAnswer(
      node.question || '',
      node.options,
      userInput
    );
    if (matchedNextId) {
      const matchedOption = node.options.find(o => o.nextId === matchedNextId)!;
      steps.push({ nodeId: currentId, autoLabel: matchedOption.label });
      currentId = matchedNextId;
      continue;
    }

    // 3. Cannot resolve — present this node to the user
    steps.push({ nodeId: currentId, autoLabel: null });
    break;
  }

  return steps;
}

function getFlowById(id: string): TroubleshootingFlow | null {
  return allFlows.find(f => f.id === id) ?? null;
}

const VALID_COMPONENTS = ['Faucet', 'Thermostat', 'Water Heater', 'Control Device (CD)'];
const VALID_FLOWS = ['no-water', 'water-leaking', 'water-nonstop', 'water-temp-adjust', 'water-not-hot', 'water-pressure'];

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hello! I'm the Singapore Airlines Engineering Support Assistant. Describe the symptoms or defect you're experiencing, and I'll guide you through troubleshooting step-by-step.",
      timestamp: new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const [currentFlow, setCurrentFlow] = useState<TroubleshootingFlow | null>(null);
  const [pendingNode, setPendingNode] = useState<PendingNode | null>(null);
  const [originalInput, setOriginalInput] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const timestamp = () =>
    new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' });

  // ── Apply walk steps to message list ─────────────────────────────────────
  const applyWalkSteps = (flow: TroubleshootingFlow, steps: WalkStep[]) => {
    const newMessages: Message[] = [];

    for (const step of steps) {
      const node = flow.nodes[step.nodeId];
      if (!node) continue;

      if (step.autoLabel !== null) {
        newMessages.push({
          id: `${Date.now()}-${step.nodeId}`,
          role: 'assistant',
          content: node.question || '',
          timestamp: timestamp(),
          isAutoAnswered: true,
          autoAnswerLabel: step.autoLabel,
        });
      } else {
        const isSolution = !node.options;
        newMessages.push({
          id: `${Date.now()}-${step.nodeId}-final`,
          role: 'assistant',
          content: node.question || node.solution || '',
          timestamp: timestamp(),
          options: node.options,
        });

        if (!isSolution) {
          setPendingNode({ nodeId: step.nodeId, content: node.question || '', options: node.options! });
          setCurrentFlow(flow);
        } else {
          setCurrentFlow(null);
          setPendingNode(null);
        }
      }
    }

    setMessages(prev => [...prev, ...newMessages]);
  };

  // ── Advance to next node, then re-scan originalInput ─────────────────────
  // After confirming any node answer, re-scans the original message using
  // aiAssistedWalk so subsequent nodes already mentioned are auto-answered.
  const advanceToNode = async (
    flow: TroubleshootingFlow,
    fromNodeId: string,
    nextId: string,
    autoLabel: string,
    rescanInput: string
  ) => {
    const fromNode = flow.nodes[fromNodeId];
    const nextNode = flow.nodes[nextId];
    if (!nextNode) return;

    const autoMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: fromNode?.question || '',
      timestamp: timestamp(),
      isAutoAnswered: true,
      autoAnswerLabel: autoLabel,
    };

    // Re-scan using AI-assisted walk from the next node
    const subFlow = { ...flow, startId: nextId };
    const furtherSteps = await aiAssistedWalk(subFlow, rescanInput);

    const newMessages: Message[] = [autoMsg];

    for (const step of furtherSteps) {
      const node = flow.nodes[step.nodeId];
      if (!node) continue;

      if (step.autoLabel !== null) {
        newMessages.push({
          id: `${Date.now()}-${step.nodeId}`,
          role: 'assistant',
          content: node.question || '',
          timestamp: timestamp(),
          isAutoAnswered: true,
          autoAnswerLabel: step.autoLabel,
        });
      } else {
        const isSolution = !node.options;
        newMessages.push({
          id: `${Date.now()}-${step.nodeId}-final`,
          role: 'assistant',
          content: node.question || node.solution || '',
          timestamp: timestamp(),
          options: node.options,
        });

        if (!isSolution) {
          setPendingNode({ nodeId: step.nodeId, content: node.question || '', options: node.options! });
          setCurrentFlow(flow);
        } else {
          setCurrentFlow(null);
          setPendingNode(null);
        }
      }
    }

    setMessages(prev => [...prev, ...newMessages]);
  };

  // ── Main send handler ────────────────────────────────────────────────────
  const handleSend = async (messageText?: string) => {
    const textToSend = messageText || input;
    if (!textToSend.trim() || isTyping) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
      timestamp: timestamp(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // ── CASE 1: Mid-flow typed input ──────────────────────────────────────
    // 1a. Phrase match on current node (instant)
    // 1b. AI node classifier (natural language)
    // 1c. Component query
    // 1d. Qwen general answer, then resume
    if (currentFlow && pendingNode) {
      try {
        // 1a. Phrase match
        const subFlow = { ...currentFlow, startId: pendingNode.nodeId };
        const phraseSteps = walkFlow(subFlow, textToSend);

        if (phraseSteps.length > 0 && phraseSteps[0].autoLabel !== null) {
          const matched = phraseSteps[0];
          const currentNode = currentFlow.nodes[pendingNode.nodeId];
          const nextId = currentNode?.options?.find(o => o.label === matched.autoLabel)?.nextId;
          if (nextId) {
            setIsTyping(false);
            await advanceToNode(currentFlow, pendingNode.nodeId, nextId, matched.autoLabel!, originalInput);
            return;
          }
        }

        // 1b. AI node classifier
        const currentNode = currentFlow.nodes[pendingNode.nodeId];
        if (currentNode?.options) {
          const matchedNextId = await classifyNodeAnswer(
            pendingNode.content,
            currentNode.options,
            textToSend
          );
          if (matchedNextId) {
            const matchedOption = currentNode.options.find(o => o.nextId === matchedNextId)!;
            setIsTyping(false);
            await advanceToNode(currentFlow, pendingNode.nodeId, matchedNextId, matchedOption.label, originalInput);
            return;
          }
        }

        // 1c. Component query mid-flow
        const componentName = await callClassifier(COMPONENT_CLASSIFIER_PROMPT, textToSend);
        const componentInfo = components.find(c => c.name === componentName) ?? null;

        if (componentInfo) {
          const answerMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: formatComponentAnswer(componentInfo),
            timestamp: timestamp(),
            isMidFlowAnswer: true,
          };
          const resumeMsg: Message = {
            id: (Date.now() + 2).toString(),
            role: 'assistant',
            content: `To continue troubleshooting:\n\n${pendingNode.content}`,
            timestamp: timestamp(),
            options: pendingNode.options,
          };
          setMessages(prev => [...prev, answerMsg, resumeMsg]);
          setIsTyping(false);
          return;
        }

        // 1d. Qwen general answer, then resume
        const aiResponse = await callQwen([{ role: 'user', content: textToSend }]);
        const answerMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: aiResponse,
          timestamp: timestamp(),
          isMidFlowAnswer: true,
        };
        const resumeMsg: Message = {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: `To continue troubleshooting:\n\n${pendingNode.content}`,
          timestamp: timestamp(),
          options: pendingNode.options,
        };
        setMessages(prev => [...prev, answerMsg, resumeMsg]);

      } catch (err: any) {
        const errMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `⚠️ Could not reach AI assistant: ${err.message}`,
          timestamp: timestamp(),
        };
        const resumeMsg: Message = {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: `To continue troubleshooting:\n\n${pendingNode.content}`,
          timestamp: timestamp(),
          options: pendingNode.options,
        };
        setMessages(prev => [...prev, errMsg, resumeMsg]);
      } finally {
        setIsTyping(false);
      }
      return;
    }

    // ── CASE 2 / 3 / 4: No active flow ───────────────────────────────────
    try {
      const [componentName, flowId] = await Promise.all([
        callClassifier(COMPONENT_CLASSIFIER_PROMPT, textToSend),
        callClassifier(FLOW_CLASSIFIER_PROMPT, textToSend),
      ]);

      // ── CASE 3: Flow takes priority ───────────────────────────────────
      if (VALID_FLOWS.includes(flowId.toLowerCase())) {
        const flow = getFlowById(flowId.toLowerCase());
        if (flow) {
          setOriginalInput(textToSend);
          const steps = await aiAssistedWalk(flow, textToSend);
          setIsTyping(false);
          applyWalkSteps(flow, steps);
          return;
        }
      }

      // ── CASE 2: Pure component query ──────────────────────────────────
      if (VALID_COMPONENTS.includes(componentName)) {
        const componentInfo = components.find(c => c.name === componentName) ?? null;
        if (componentInfo) {
          const assistantMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: formatComponentAnswer(componentInfo),
            timestamp: timestamp(),
          };
          setMessages(prev => [...prev, assistantMsg]);
          setIsTyping(false);
          return;
        }
      }

      // ── CASE 4: Qwen general response ─────────────────────────────────
      const history = [...messages, userMsg]
        .filter(m => !(m.id === '1' && m.role === 'assistant'))
        .map(m => ({ role: m.role, content: m.content }));

      const aiResponse = await callQwen(history);
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponse,
        timestamp: timestamp(),
      };
      setMessages(prev => [...prev, assistantMsg]);

    } catch (err: any) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `⚠️ Error reaching AI assistant: ${err.message}. Please try again.`,
        timestamp: timestamp(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  // ── Option button selected ────────────────────────────────────────────────
  const handleOptionSelect = (option: { label: string; nextId: string }) => {
    if (!currentFlow || !pendingNode) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: option.label,
      timestamp: timestamp(),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    // Re-scan originalInput after advancing so subsequent nodes already
    // mentioned in the original message are auto-answered
    advanceToNode(currentFlow, pendingNode.nodeId, option.nextId, option.label, originalInput)
      .finally(() => setIsTyping(false));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const lastOptionsIndex = messages.reduce((acc, msg, i) => msg.options ? i : acc, -1);

  return (
    // Outer shell — fills the full viewport on mobile, caps at phone width on desktop
    <div className="flex justify-center items-stretch bg-gray-100 overflow-hidden" style={{ height: '100dvh' }}>
      <div className="relative flex flex-col w-full max-w-md bg-background shadow-2xl overflow-hidden" style={{ height: '100%' }}>

        {/* ── Status bar spacer (iOS safe area) ── */}
        <div className="h-safe-top bg-[#00205B]" style={{ paddingTop: 'env(safe-area-inset-top)' }} />

        {/* ── Header ── */}
        <div className="relative bg-gradient-to-r from-[#00205B] via-[#003875] to-[#00205B] text-white px-4 py-3 shadow-md overflow-hidden flex-shrink-0">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#FFB81C]/10 rounded-full blur-2xl" />
          <div className="relative flex items-center gap-3">
            <div className="w-9 h-9 bg-[#FFB81C] rounded-full flex items-center justify-center flex-shrink-0">
              <Plane className="w-4 h-4 text-[#00205B]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-white text-sm font-semibold leading-tight truncate">SIA Engineering Support</h1>
              <p className="text-[#FFB81C]/90 text-xs truncate">Technical Troubleshooting Assistant</p>
            </div>
          </div>
        </div>

        {/* ── Messages ── */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {messages.map((message, index) => (
            <div key={message.id} className="space-y-2">
              {message.isAutoAnswered ? (
                <div className="flex gap-2">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-[#00205B]/40">
                    <Plane className="w-3.5 h-3.5 text-white/70" />
                  </div>
                  <div className="flex flex-col gap-1 max-w-[80%]">
                    <div className="px-3 py-1.5 bg-muted/50 rounded-xl text-xs text-muted-foreground whitespace-pre-wrap opacity-70">
                      {message.content}
                    </div>
                    <div className="px-2.5 py-1 bg-[#00205B]/10 rounded-lg text-xs text-[#00205B] font-medium self-start">
                      ✓ {message.autoAnswerLabel}
                    </div>
                  </div>
                </div>
              ) : (
                <ChatMessage
                  role={message.role}
                  content={message.content}
                  timestamp={message.timestamp}
                />
              )}
              {message.options && index === lastOptionsIndex && !isTyping && (
                <div className="flex justify-start pl-9">
                  <div className="w-full max-w-[85%]">
                    <OptionButtons
                      options={message.options}
                      onSelect={handleOptionSelect}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-2">
              <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-[#00205B]">
                <span className="text-white text-xs leading-none">•••</span>
              </div>
              <div className="flex items-center px-3 py-2.5 bg-muted rounded-2xl">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Input bar (pinned to bottom like WhatsApp) ── */}
        <div
          className="flex-shrink-0 border-t bg-card px-3 py-2"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
        >
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  // Auto-grow textarea
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                }}
                onKeyDown={handleKeyDown}
                placeholder={
                  currentFlow
                    ? 'Type your findings...'
                    : 'Describe the defect, e.g. "A380 lavatory nil water, SOV open"'
                }
                rows={2}
                className="w-full px-3 py-3 bg-input-background rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-[#00205B] text-sm leading-snug"
                style={{ minHeight: '60px', maxHeight: '120px' }}
              />
            </div>
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isTyping}
              className="flex-shrink-0 w-10 h-10 bg-[#00205B] text-white rounded-full disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}