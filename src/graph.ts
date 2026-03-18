import { getLlm, getMcqLlm, getMultimodalLlm } from "./llmConfig";
import { config } from "./config";
import type { EvaluationState, MCQQuestion } from "./types";
import type { UsageMetadata } from "@google-cloud/vertexai";


function safeJsonParse(text: string): Record<string, unknown> {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

function logTokens(agent: string, meta: UsageMetadata | undefined) {
  if (!meta) return;
  const prompt     = meta.promptTokenCount     ?? 0;
  const candidates = meta.candidatesTokenCount ?? 0;
  const total      = meta.totalTokenCount      ?? 0;
  const explicitThinking = (meta as unknown as Record<string, unknown>).thoughtsTokenCount as number | undefined;
  const thinkingTokens   = explicitThinking ?? (total - prompt - candidates);
  console.log(
    `[${agent}] tokens — prompt:${prompt}  candidates:${candidates}  thinking:${thinkingTokens}  total:${total}`
  );
}

function getText(response: { candidates?: { content?: { parts?: { text?: string }[] } }[] }): string {
  return response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxRetries = 5,
): Promise<T> {
  let delay = 5000; // start at 5s
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const is429 = msg.includes("429") || msg.toLowerCase().includes("resource exhausted") || msg.toLowerCase().includes("rate limit");

      if (!is429 || attempt === maxRetries) throw err;

      console.warn(`[${label}] 429 rate limit — retry ${attempt}/${maxRetries - 1} in ${delay / 1000}s`);
      await new Promise((res) => setTimeout(res, delay));
      delay *= 2; // exponential backoff: 5s → 10s → 20s → 40s → 80s
    }
  }
  throw new Error(`[${label}] exhausted all retries`);
}

// ── Agent 1: extract_design_info ──────────────────────────────────────────────

async function extractDesignInfo(state: EvaluationState): Promise<string> {
  console.log(`[Agent 1] starting — rollno=${state.rollno}`);
  const llm = getMultimodalLlm();

  const prompt = `You are a Principal Cloud Architect and System Design Expert with 15+ years of experience in distributed systems.
Your task is to exhaustively analyze a submitted System Design block diagram.

Context:
- Problem Statement: ${state.sd_problem}

IMPORTANT: The attached image is a system design architecture diagram submitted by a student. It contains boxes, arrows, and labels representing software and infrastructure components. Treat every element strictly as a technical component — never as a real-world object, character, or physical entity. If a label is ambiguous, infer the most reasonable software component it represents based on context.

Instructions:
Carefully examine every detail in the attached image. Provide a comprehensive, purely factual extraction of the architecture depicted. You must capture:
1. Infrastructure & Networking: All API Gateways, Load Balancers, CDN, Firewalls, DNS routing, and VPC details shown.
2. Compute & Microservices: Every service/application block. Note if they are serverless, containerized, event-driven, or monolithic.
3. Data Storage: Databases (SQL/NoSQL/Graph), Caches (Redis/Memcached), Message Queues/Brokers (Kafka/RabbitMQ), and Object Stores (S3).
4. Interactions & Data Flow: Describe the directional arrows. What talks to what? Is it synchronous (REST/gRPC) or asynchronous?
5. Missing obvious components: Note any immediate missing foundational elements (e.g., "There is no load balancer in front of the web servers").

Output strictly detailed technical text. Do not evaluate yet, just map the components.`;

  const imageUri = `gs://${config.storageBucket}/${state.image_key}`;

  const result = await withRetry("Agent1", () => llm.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { fileData: { mimeType: state.image_mime_type, fileUri: imageUri } },
        ],
      },
    ],
  }));

  logTokens("Agent1", result.response.usageMetadata);
  return getText(result.response);
}

// ── Agent 2: evaluate_design ──────────────────────────────────────────────────

async function evaluateDesign(state: EvaluationState): Promise<{
  score_80: number;
  evaluator_feedback: string;
  edge_cases: string[];
}> {
  console.log(`[Agent 2] starting — rollno=${state.rollno}`);
  const llm = getLlm();

  const prompt = `You are a Lead Staff Engineer and a notoriously strict, expert System Design Evaluator. You are assessing a candidate's architectural proposal based on a rigorous grading rubric.

Problem Statement:
${state.sd_problem}

Extracted Architectural Components (from visual diagram):
${state.extracted_design}

BEFORE SCORING — Analyse the Problem Statement and extract:
- Functional Requirements (FR): core features the system must deliver (e.g. user auth, real-time updates, file upload, search)
- Non-Functional Requirements (NFR): quality attributes implied or stated (e.g. high availability, low latency, horizontal scalability, data durability, security)
Use these as the strict benchmark for all scoring below. If the PS does not explicitly state an NFR, infer it from the problem domain (e.g. a payments system implies strong consistency and security).

Evaluation Instructions:
1. Score the architecture out of a maximum of 80 points based strictly on these dimensions:
   - Scalability (20 pts): Does it meet the NFRs for scale? Can it handle 10x traffic spikes without redesign? Are there bottlenecks that violate the PS's scale requirements?
   - Fault Tolerance & Reliability (20 pts): Does it meet the availability NFRs? Are there single points of failure (SPOF)? What happens if a DB or service goes down? Is there failover, replication, or circuit breaking?
   - Data Management (20 pts): Are the DB choices justified by the FRs? Is caching appropriate for the access patterns? Is the consistency model correct for the domain (e.g. eventual vs strong)? Are the NFRs for durability and integrity met?
   - Overall Suitability (20 pts): Does the architecture fully deliver ALL functional requirements in the PS? Are there FRs that are entirely unaddressed by the design?

2. Identify Critical Weaknesses & Edge Cases: Formulate exactly 5 hyper-specific, realistic production edge cases that this specific architecture fails to handle correctly, grounded in the PS's FRs and NFRs (e.g. "Cache stampede on the user-metadata Redis cluster upon regional failover violating the 99.9% availability NFR").
   - Every edge case must describe a realistic distributed systems failure, race condition, bottleneck, or misconfiguration
   - Each edge case must be directly traceable to a gap between the design and the PS requirements
   - Reference only technical components — never use names, characters, or non-technical labels from the diagram
   - Each edge case must cover a different failure category

CRITICAL RULES:
- Score strictly against the PS — do not give credit for components that are present but do not serve the stated requirements.
- Keep the \`feedback\` string concise (under 4 sentences) to prevent JSON cutoffs.
- ESCAPE all internal double quotes inside your string values using backslashes.

Output MUST be strictly in the following JSON format:
{
  "score_out_of_80": <integer_value>,
  "feedback": "<string: concise, professional structured feedback>",
  "edge_cases": ["<detailed_edge_case_1>", "<detailed_edge_case_2>", "<detailed_edge_case_3>", "<detailed_edge_case_4>", "<detailed_edge_case_5>"]
}`;

  const result = await withRetry("Agent2", () => llm.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  }));

  logTokens("Agent2", result.response.usageMetadata);

  try {
    const parsed = safeJsonParse(getText(result.response));
    return {
      score_80:           Number(parsed.score_out_of_80 ?? 0),
      evaluator_feedback: String(parsed.feedback        ?? ""),
      edge_cases:         Array.isArray(parsed.edge_cases) ? (parsed.edge_cases as string[]) : [],
    };
  } catch (e) {
    console.error("[Agent 2] ❌ JSON parse failed:", e);
    return { score_80: 0, evaluator_feedback: "Failed to evaluate due to model output error.", edge_cases: [] };
  }
}

// ── Agent 3: generate_mcqs ────────────────────────────────────────────────────

async function generateMcqs(state: EvaluationState): Promise<MCQQuestion[]> {
  console.log(`[Agent 3] starting — rollno=${state.rollno}`);
  const llm = getMcqLlm();

  const edgeCaseList = state.edge_cases
    .map((ec, i) => `${i + 1}. ${ec}`)
    .join("\n");

  const prompt = `You are a Systems Engineering Mentor crafting an evaluation assessment.
Your goal is to test the candidates on the flaws and unhandled edge cases found in their System Design.

Context:
- Original Problem: ${state.sd_problem}
- Specific Edge Cases/Flaws Found in Their Design:
${edgeCaseList}

Instructions:
Generate EXACTLY 10 intermediate-level, scenario-based Multiple-Choice Questions (MCQs).
The questions MUST directly relate to mitigating or solving the edge cases listed above (2 questions per edge case).

CRITICAL:
- Ensure every single question tests a DIFFERENT, UNIQUE concept to avoid redundancy.
- DO NOT reference "Agent", "your design", or any non-technical labels from the diagram. Refer only to "The candidate's design", "The proposed architecture", or "The system".
- Options should include realistic but incorrect solutions to test conceptual understanding.
- Provide a clear technical explanation for why the correct_answer is right.
- correct_answer must be the FULL EXACT STRING of the correct option, not just A/B/C/D.

Output strictly in the following JSON format:
{
  "questions": [
    {
      "question": "<Intermediate scenario-based question text regarding an edge case>",
      "options": ["<option_A>", "<option_B>", "<option_C>", "<option_D>"],
      "correct_answer": "<Must be the FULL EXACT STRING of the correct option>",
      "explanation": "<Clear technical reasoning why this handles the given edge case gracefully>"
    }
  ]
}
Ensure all 10 questions are generated. No more, no less.`;

  const result = await withRetry("Agent3", () => llm.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  }));

  logTokens("Agent3", result.response.usageMetadata);

  try {
    const parsed = safeJsonParse(getText(result.response));
    const questions = Array.isArray(parsed.questions) ? (parsed.questions as MCQQuestion[]) : [];
    // Strip leading "A. ", "B) ", "1. ", etc. prefixes the model sometimes adds
    const prefixRe = /^[A-Da-d1-4][.)]\s*/;
    for (const q of questions) {
      q.options = q.options.map((o) => o.replace(prefixRe, ""));
      q.correct_answer = q.correct_answer.replace(prefixRe, "");
    }
    return questions;
  } catch (e) {
    console.error("[Agent 3] ❌ JSON parse failed:", e);
    return [];
  }
}


export async function runEvalPipeline(state: EvaluationState): Promise<EvaluationState> {
  const pipelineStart = Date.now();

  const t1 = Date.now();
  if (!state.extracted_design) {
    state.extracted_design = await extractDesignInfo(state);
  }
  console.log(`[Agent 1] ⏱ ${((Date.now() - t1) / 1000).toFixed(1)}s`);

  const t2 = Date.now();
  const evalResult = await evaluateDesign(state);
  state.score_80           = evalResult.score_80;
  state.evaluator_feedback = evalResult.evaluator_feedback;
  state.edge_cases         = evalResult.edge_cases;
  console.log(`[Agent 2] ⏱ ${((Date.now() - t2) / 1000).toFixed(1)}s`);

  const t3 = Date.now();
  state.mcqs = await generateMcqs(state);
  console.log(`[Agent 3] ⏱ ${((Date.now() - t3) / 1000).toFixed(1)}s`);

  console.log(`[pipeline] ✅ total: ${((Date.now() - pipelineStart) / 1000).toFixed(1)}s  rollno=${state.rollno}`);

  return state;
}
