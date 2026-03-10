# AI Chat Improvement Proposal

> **Date:** 2026-03-10
> **Scope:** System prompt design, tool design, model selection, libraries, architecture, and workflows for the Attraccess AI assistant.
> **Constraint:** Customers run on non-AI-optimized hardware. Default model target is ~8B parameters.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Implementation Audit](#2-current-implementation-audit)
3. [System Prompt Design](#3-system-prompt-design)
4. [Tool / Function Calling Design](#4-tool--function-calling-design)
5. [Model Selection](#5-model-selection)
6. [RAG & Retrieval](#6-rag--retrieval)
7. [Context & Conversation Management](#7-context--conversation-management)
8. [Libraries & Infrastructure](#8-libraries--infrastructure)
9. [Multi-Model Architecture](#9-multi-model-architecture)
10. [Frontend UX Improvements](#10-frontend-ux-improvements)
11. [Safety & Guardrails](#11-safety--guardrails)
12. [Evaluation & Testing](#12-evaluation--testing)
13. [Implementation Roadmap](#13-implementation-roadmap)

---

## 1. Executive Summary

The current AI chat implementation is a solid foundation: Vercel AI SDK streaming, Ollama-backed inference, RAG over documentation, OpenAPI-driven tool calling, and a rich UI with json-render components. However, several areas can be significantly improved for small (~8B) models running on consumer hardware.

**Top 5 high-impact changes:**

1. **Switch default chat model from `llama3.2` to `qwen3:8b`** — 40%+ better tool-calling accuracy at the same parameter count
2. **Restructure system prompt** — current prompt is ~800+ tokens of prose; small models need <400 tokens of structured instructions
3. **Add constrained/structured output** for tool calls — eliminates malformed JSON and hallucinated parameters
4. **Implement hybrid search** (BM25 + vector) for RAG — current approach loads ALL embeddings into memory for every query
5. **Add conversation summarization** — currently no context management; long conversations will exceed context window

---

## 2. Current Implementation Audit

### Architecture Overview

```
Frontend (React)                    Backend (NestJS)              Inference
─────────────────                  ──────────────────            ──────────
AiChatPanel.tsx                    AiController                  Ollama
  └── useAiChat.ts ──HTTP POST──> POST /api/ai/chat             llama3.2
       (AI SDK useChat)              └── AiService.chat()        nomic-embed-text
       DefaultChatTransport            ├── buildSystemPrompt()
       streaming response              ├── ToolRegistry.buildTools()
                                       ├── createOllama() provider
                                       └── streamText() ──────> Ollama API
```

### What Works Well

| Area | Details |
|------|---------|
| **Streaming** | Proper AI SDK streaming with `pipeUIMessageStreamToResponse` |
| **Tool execution** | OpenAPI-indexed endpoint search + arbitrary API calls with user's session cookie |
| **RAG** | Markdown chunking + Ollama embeddings + cosine similarity search |
| **Rich UI** | json-render components (tables, charts, navigation buttons, link lists) |
| **Configuration** | DB-backed settings with hot-reload via event emitter |
| **Model management** | Auto-pull missing models with progress tracking |
| **Conversation persistence** | SQLite-backed conversation history |

### Issues Identified

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| 1 | **System prompt too verbose for 8B models** | High | ~800+ tokens of natural language prose with embedded JSON examples. Small models struggle with long unstructured instructions. |
| 2 | **No structured output enforcement** | High | Tool calls rely entirely on the model generating valid JSON. `llama3.2` frequently produces malformed args (evidenced by the `extractStringArg` fallback method accepting alternate parameter names). |
| 3 | **RAG loads ALL embeddings into memory** | High | `search()` calls `this.embeddingRepo.find()` with no filter — loads every embedding row, computes cosine similarity in JS. This won't scale beyond a few hundred docs. |
| 4 | **No conversation context management** | High | Full message history is sent every turn. No summarization, no sliding window, no token budgeting. Will hit context limits on longer conversations. |
| 5 | **Default model (`llama3.2`) poor at tool calling** | High | Llama 3.2 3B is too small; even the 8B variant scores significantly below Qwen3 8B on function-calling benchmarks. |
| 6 | **No token budgeting** | Medium | System prompt + tool definitions + resource context + full conversation + RAG results all compete for context. No tracking or limiting. |
| 7 | **4 tools always loaded** | Medium | All 4 tools are always injected regardless of query. Small models handle 5-10 tools but accuracy drops if tool descriptions are verbose. |
| 8 | **No caching** | Medium | Every query re-computes embeddings, re-fetches resources, re-builds system prompt from scratch. |
| 9 | **Chunking strategy is basic** | Low | Heading-based splitting with 2000-char hard limit. No overlap between chunks, no semantic boundaries. |
| 10 | **No evaluation framework** | Low | No way to measure or regression-test agent quality across model/prompt changes. |

---

## 3. System Prompt Design

### Problem

The current system prompt is ~800+ tokens of natural language with embedded JSON code blocks for the json-render guide. Research shows that 8B models are significantly more sensitive to prompt structure than larger models.

### Current Prompt Structure

```
[Role definition - 2 lines]
[5-bullet capability list]
[8-bullet guidelines section - natural language]
[User name injection]
[JSON_RENDER_GUIDE - ~400 tokens of code examples]
[Resource list - variable length, up to 15 items]
```

### Recommendations

#### 3.1 Use XML-structured sections instead of prose

Small models parse XML tags more reliably than markdown headers or natural language sections. This is a well-established pattern from Anthropic's and the broader prompt engineering community.

```xml
<role>Attraccess AI assistant for makerspace resource management.</role>

<rules>
- Be concise. Respond in the user's language.
- Use searchEndpoints before callEndpoint.
- Say "I don't know" when uncertain.
- Explain actions before executing tools.
</rules>

<output_format>
Use json-render code blocks for rich UI:
- navigation-buttons: {"type":"navigation-buttons","buttons":[{"label":"...","route":"..."}]}
- data-table: {"type":"data-table","columns":[...],"rows":[...]}
- bar-chart/line-chart: {"type":"bar-chart","data":[{"name":"...","value":N}],"xKey":"name","yKey":"value"}
- info-card: {"type":"info-card","title":"...","description":"..."}
- link-list: {"type":"link-list","links":[{"label":"...","url":"..."}]}
</output_format>

<context>
User: {{userName}}
Resources: {{resourceList}}
</context>
```

#### 3.2 Keep total system prompt under 400 tokens

**Target budget:**
- Role + rules: ~100 tokens
- Output format (compressed): ~150 tokens
- User context: ~50 tokens
- Resource list: ~100 tokens (cap at 5-8 most relevant resources)

**How to compress the json-render guide:** Instead of full examples with code blocks for each component, provide a compressed one-liner schema per component. The model only needs the structure, not a full rendered example.

#### 3.3 Move detailed examples to few-shot messages

Instead of embedding json-render examples in the system prompt, inject 1-2 few-shot conversation turns as the first messages:

```json
{"role": "user", "content": "Show me my resources"},
{"role": "assistant", "content": "Here are your resources:\n```json-render\n{\"type\":\"data-table\",\"columns\":[\"Name\",\"Status\"],\"rows\":[[\"Laser Cutter\",\"Available\"]]}\n```"}
```

This teaches format-by-example without bloating the system prompt. Research shows 1-3 few-shot examples are optimal for 8B models.

#### 3.4 Reduce resource context

Current: up to 15 resources with full status detail (~20 tokens each = 300 tokens).
Proposed: top 5 most relevant resources, more compact format:

```
Resources: LaserCutter(available,access), 3DPrinter(in-use:Bob,access), CNC(available,no-access)
```

This cuts resource context from ~300 to ~60 tokens.

---

## 4. Tool / Function Calling Design

### Problem

The 4 tools have verbose descriptions. Small models frequently hallucinate parameter names (the `extractStringArg` fallback confirms this). No parameter validation or constrained generation.

### Recommendations

#### 4.1 Shorten tool descriptions to <100 tokens each

**Current** `searchEndpoints` description (43 words):
> "Search for available API endpoints by keyword or intent. Use this to discover what API operations are available before calling them. Returns matching endpoints with their method, path, parameters, and description."

**Proposed** (18 words):
> "Search API endpoints by keyword. Returns matching operations with method, path, and parameters."

Apply the same compression to all 4 tools. Research shows small models perform better with concise tool descriptions.

#### 4.2 Add constrained output for tool parameters

Use the Vercel AI SDK's built-in Zod schema validation to enforce output structure. The current implementation already defines Zod schemas — ensure `strict` mode is enabled so the model cannot add extra properties.

Additionally, consider adopting **llguidance** or **Outlines** (if switching to a Python-based inference stack) for grammar-constrained generation that forces valid JSON at the token level, eliminating malformed tool calls entirely.

For the Ollama + Vercel AI SDK stack, Ollama now supports structured output via the `format` parameter — the `ollama-ai-provider-v2` should propagate this. Test and enable it.

#### 4.3 Implement tool call validation + retry

When a tool call fails (malformed args, missing required params), return a structured error message and let the model retry with a corrected call. Current behavior catches some cases via `extractStringArg` but doesn't provide feedback to the model.

```typescript
// Proposed: return actionable error to model
return {
  error: 'Invalid: "query" parameter is required (got "keyword" instead). Call again with {"query": "your search term"}.'
};
```

#### 4.4 Consider dynamic tool injection

Instead of always loading all 4 tools, use a lightweight classifier or keyword match to decide which tools are relevant:

- User asks about documentation → inject only `searchDocs` + `searchDocumentation`
- User asks to perform an action → inject only `searchEndpoints` + `callEndpoint`
- Ambiguous → inject all 4

This reduces the tool definition token cost from ~400 to ~200 tokens for most queries. For 8B models with limited context, this matters.

---

## 5. Model Selection

### Problem

The default `llama3.2` is Meta's 3B model (despite the name suggesting 3.2B). It scores poorly on function-calling benchmarks. Even if the 8B Llama 3.1 is used, it significantly underperforms Qwen3 8B for tool calling.

### Recommendations

#### 5.1 Change default chat model to `qwen3:8b`

| Model | Tool Calling F1 | Context Window | Notes |
|-------|----------------|----------------|-------|
| **Qwen3 8B** | **0.933** | 128K | Best tool calling at 8B. Dual-mode (thinking/non-thinking). |
| Llama 3.1 8B | ~0.75 | 128K | Decent general purpose, weaker on tools. |
| Granite 3.3 8B | High | 128K | IBM enterprise model. Strong tool use. |
| Ministral 8B | Good | 128K | Mistral's edge model. Built-in function calling. |
| Phi-4-mini (3.8B) | Competitive | 128K | Microsoft. Punches above weight on reasoning. |

**Primary recommendation:** `qwen3:8b` — Docker's August 2025 evaluation confirmed it as the best local model for tool calling at the 8B scale.

**Secondary recommendation:** `granite3.3-dense:8b` — IBM's model specifically trained for tool use, JSON output, and RAG tasks.

#### 5.2 Quantization guidance

| Quantization | Quality | RAM (8B model) | Recommendation |
|-------------|---------|-----------------|----------------|
| Q8_0 | ~99% | ~8.5 GB | Best quality. Use if RAM allows. |
| **Q5_K_M** | **~95-97%** | **~5.5 GB** | **Production sweet spot.** |
| Q4_K_M | ~90-93% | ~4.5 GB | Acceptable for basic chat. Tool calling degrades. |
| Q3_K_M | ~85% | ~3.5 GB | Avoid for agent tasks. |

**Critical finding:** Q4 formats introduce unacceptable losses for instruction-following (IFEval) tasks, which directly impacts tool calling accuracy. Use Q5_K_M minimum for agent workloads.

**Recommendation:** Default to `qwen3:8b-q5_k_m` in the settings UI. Provide a dropdown with presets:
- "High quality" → Q8_0 (~8.5 GB RAM)
- "Balanced" → Q5_K_M (~5.5 GB RAM)
- "Low memory" → Q4_K_M (~4.5 GB RAM, warning about reduced tool accuracy)

#### 5.3 Embedding model

The current `nomic-embed-text` is a good choice. The v2 release supports Matryoshka dimensions (truncate to 256 dims for faster search with minimal quality loss). Consider updating to `nomic-embed-text:v2` when available on Ollama.

---

## 6. RAG & Retrieval

### Problem

1. `search()` loads ALL embeddings from the database and computes cosine similarity in JavaScript — O(n) per query
2. Chunking is heading-based with no overlap
3. No hybrid search (keyword + semantic)
4. `textSearch()` reads ALL markdown files from disk on every call

### Recommendations

#### 6.1 Use pgvector or sqlite-vss for vector search

Instead of loading all embeddings into JS and computing cosine similarity manually, use a vector-capable database extension:

**Option A: sqlite-vss** (if staying with SQLite)
- SQLite extension for vector similarity search
- Approximate nearest neighbors via IVF index
- Queries return top-K results without loading all rows

**Option B: pgvector** (if migrating to PostgreSQL)
- Production-grade vector similarity with HNSW indexes
- Sub-millisecond top-K queries on millions of vectors
- Also enables hybrid search with `pg_textsearch` for BM25

**Minimum viable improvement:** Add a `LIMIT` clause and approximate filtering. Even sorting by a pre-computed hash bucket would beat loading 100% of rows.

#### 6.2 Implement hybrid search (BM25 + vector)

Combine keyword search (BM25) with semantic search (vector similarity) using Reciprocal Rank Fusion (RRF):

```
score(doc) = 1/(k + rank_bm25(doc)) + 1/(k + rank_vector(doc))
```

Where `k` is typically 60.

This catches exact term matches (product names, technical terms, error codes) that embeddings miss, while also catching semantic matches that keyword search misses.

**Implementation approach:**
1. Run `textSearch()` (keyword) and `search()` (vector) in parallel
2. Merge results using RRF scoring
3. Return top-K merged results

#### 6.3 Improve chunking

**Current:** Split on H1-H3 headings, hard limit at 2000 characters, no overlap.

**Proposed:**
- Target chunk size: 256-512 tokens (~500-1000 characters)
- Add 20-30% overlap between chunks to preserve boundary context
- Use `RecursiveCharacterTextSplitter`-style logic: try to split on paragraphs → sentences → words
- Prepend parent heading hierarchy to each chunk for context

```typescript
// Example: chunk with heading context
"## Resources > ### Permissions\n\nUsers can be granted access to resources..."
```

#### 6.4 Cache search results

Add a short-TTL cache (30-60 seconds) for:
- Embedding computations for queries
- RAG search results for identical queries
- Resource context (changes infrequently)

---

## 7. Context & Conversation Management

### Problem

The full message history is sent to the model every turn. No summarization, no sliding window, no token counting. For a model with 8K-128K context, this will eventually fail.

### Recommendations

#### 7.1 Implement token budgeting

Explicitly allocate context window capacity:

| Component | Budget | Current |
|-----------|--------|---------|
| System prompt | 300-400 tokens | ~800+ tokens |
| Tool definitions | 300-500 tokens | ~400 tokens |
| RAG context | 500-1500 tokens | unlimited |
| Resource context | 100 tokens | ~300 tokens |
| Conversation history | 2000-4000 tokens | unlimited |
| Current turn + response | 1000-2000 tokens | unlimited |
| **Total** | **~4200-8400 tokens** | **uncontrolled** |

Use the `ai` SDK's `tokenCount` or a fast tokenizer (tiktoken) to count actual tokens before sending to the model.

#### 7.2 Sliding window + summarization

Implement a hybrid approach:

1. Keep the last **8-10 message exchanges** in full fidelity
2. When conversation exceeds the token budget, summarize older messages into a compressed representation
3. Store the summary as a special "context" message at the start of the conversation

The Vercel AI SDK supports custom message transformations. Implement this as a preprocessing step before `streamText()`.

**Example summary format:**
```
Previous conversation summary: User asked about 3D printer availability.
Assistant confirmed printer was available and showed how to start a usage session via the API.
User then asked about billing. Assistant showed their current balance of 15.50 EUR.
```

#### 7.3 Add `maxTokens` to streamText

Set `maxTokens` in the `streamText` call to prevent runaway generation:

```typescript
streamText({
  model,
  system: systemPrompt,
  messages: modelMessages,
  tools,
  maxTokens: 2048, // Prevent runaway generation
  stopWhen: stepCountIs(15),
});
```

---

## 8. Libraries & Infrastructure

### Current Stack

| Component | Library | Version |
|-----------|---------|---------|
| Inference | Ollama | via `ollama` npm package |
| AI SDK | `ai` (Vercel AI SDK) | latest |
| Provider | `ollama-ai-provider-v2` | latest |
| Frontend | `@ai-sdk/react` | `useChat` hook |
| Schema | `zod` | for tool parameters |
| Markdown | `react-markdown` + `remark-gfm` | rendering |

### Recommendations

#### 8.1 Keep Ollama + Vercel AI SDK (no change needed)

The current stack is well-chosen:
- **Ollama** is the best developer-experience inference engine for local models
- **Vercel AI SDK** is the best TypeScript-native AI framework with streaming, tool calling, and React hooks
- The AI SDK 6 (2026) adds structured output improvements that benefit this use case

No reason to switch to LangChain or other orchestration frameworks — they add complexity without clear benefits for this use case.

#### 8.2 Consider adding `ollama` structured output mode

Ollama supports a `format` parameter for structured output. When using tool calling, configure the provider to use JSON mode:

```typescript
const ollamaProvider = createOllama({
  baseURL: this.ollamaService.baseUrl + '/api',
});
const model = ollamaProvider.chat(this.ollamaService.modelName, {
  structuredOutputs: true, // Enable structured JSON generation
});
```

This uses Ollama's grammar-constrained generation to ensure valid JSON in tool calls.

#### 8.3 Add a tokenizer for budget tracking

Install `js-tiktoken` or `gpt-tokenizer` for fast client-side token counting:

```bash
pnpm add js-tiktoken
```

Use it to implement the token budgeting described in Section 7.1.

#### 8.4 Consider adding a reranker

For RAG quality, add a lightweight cross-encoder reranker after initial retrieval. Options:
- `bge-reranker-v2-m3` via Ollama (if supported) or Hugging Face
- Simple approach: use the chat model itself as a reranker with a prompt like "Rate relevance of this passage to the query on a scale of 1-10"

---

## 9. Multi-Model Architecture

### Problem

A single 8B model handles everything: chat, reasoning, tool calling, and RAG comprehension. Some tasks (simple greetings, FAQ lookups) don't need the full model, while complex multi-step operations might benefit from a larger model.

### Recommendations

#### 9.1 Query routing (Phase 2)

Implement a lightweight router that classifies queries before routing to the appropriate handler:

```
User Query → Router → Simple FAQ?     → Rule-based/cached response (no LLM needed)
                     → Doc lookup?    → RAG-only (embed + retrieve + format)
                     → Tool action?   → Full agent loop (chat model + tools)
                     → Complex?       → Larger model (optional cloud API)
```

**Implementation:** A simple keyword/regex classifier or a tiny model (e.g., Phi-4-mini 3.8B) can route queries. For the MVP, even a rule-based system works:
- Queries matching "hi|hello|hey|thanks" → canned response
- Queries matching "how|what|where|docs|documentation" → RAG-only path
- Queries matching "start|stop|create|delete|update|show me|list" → tool-calling path

#### 9.2 Optional cloud model fallback (Phase 3)

Allow administrators to configure an optional cloud API (OpenAI, Anthropic, etc.) as a fallback for complex queries. The Vercel AI SDK already supports multiple providers:

```typescript
// Settings: optional cloud API key
if (query.isComplex && cloudApiKey) {
  model = createOpenAI({ apiKey: cloudApiKey }).chat('gpt-4o-mini');
} else {
  model = ollamaProvider.chat(this.ollamaService.modelName);
}
```

This gives customers the option to use cloud models for better quality when needed, while keeping the default fully local.

#### 9.3 Speculative decoding (Phase 3)

For customers with enough RAM, enable speculative decoding:
- Draft model: `qwen3:1.7b` (tiny, fast)
- Verify model: `qwen3:8b` (full quality)
- Result: 1.5-2x speedup with zero quality loss

This requires Ollama/vLLM support for speculative decoding, which is improving rapidly.

---

## 10. Frontend UX Improvements

### Current State

The frontend is clean and functional: Drawer-based chat panel, message list with tool call visualization, json-render components, error display with retry button, model download progress indicator.

### Recommendations

#### 10.1 Add conversation list/history panel

Currently, conversations are persisted in the database but only the current conversation is accessible. Add a panel or dropdown showing previous conversations that users can resume.

#### 10.2 Add suggested prompts / quick actions

When the chat is empty, show 3-4 suggested prompts based on the user's context:
- "Show available resources"
- "Check my billing balance"
- "How do I use the laser cutter?"
- "Start using [resource name]"

This reduces the blank-slate problem and teaches users what the AI can do.

#### 10.3 Add typing indicator improvements

Currently uses a simple loading spinner. Consider showing:
- "Thinking..." during reasoning
- "Searching documentation..." during tool calls
- "Calling API..." during endpoint calls

The tool call parts already show status, but a top-level indicator would improve perceived responsiveness.

#### 10.4 Streaming tool results

Currently, tool call results appear after full completion. Consider progressively revealing tool call status as they execute, giving the user real-time feedback.

#### 10.5 Add a "stop generating" button

Allow users to interrupt long-running generations. The AI SDK supports cancellation via `chat.stop()`.

---

## 11. Safety & Guardrails

### Current State

No explicit guardrails. The model can call any API endpoint the user has access to. No input/output filtering.

### Recommendations

#### 11.1 Implement code-based guardrails (not prompt-based)

Small models are unreliable at following safety instructions in prompts. Implement guardrails architecturally:

**Input guardrails:**
- Rate limiting on chat endpoint (already behind auth, but add per-user rate limits)
- Maximum message length validation
- Basic PII detection before sending to model (optional)

**Output guardrails:**
- Validate tool call parameters against the OpenAPI schema before execution
- Allowlist/blocklist for API endpoints the AI can call (e.g., block `DELETE` operations by default)
- Maximum response length enforcement

**Tool call guardrails:**
- Require confirmation for destructive operations (DELETE, dangerous POST)
- Log all tool calls with user ID for audit
- Rate limit tool calls per conversation (current `stepCountIs(15)` is good)

#### 11.2 Add an endpoint allowlist

Not all API endpoints should be AI-callable. Create an allowlist/blocklist:

```typescript
const BLOCKED_PATTERNS = [
  /DELETE.*\/users/,          // Can't delete users
  /POST.*\/settings/,         // Can't change system settings
  /.*\/admin\/.*/,           // No admin endpoints
];
```

#### 11.3 Implement a confirmation flow for mutations

For POST/PUT/PATCH/DELETE calls, return a confirmation prompt to the user before executing:

```
AI: I'll create a new resource usage session for the Laser Cutter. Shall I proceed?
User: Yes
AI: [executes callEndpoint]
```

This can be implemented with a two-step tool call pattern or a client-side confirmation dialog.

---

## 12. Evaluation & Testing

### Problem

No way to measure or regression-test agent quality. Prompt changes, model changes, and quantization changes could silently degrade quality.

### Recommendations

#### 12.1 Build a test suite

Create a set of 20-50 test conversations covering:
- Simple FAQ questions → expect correct documentation references
- Resource queries → expect correct resource data
- API actions → expect correct tool calls with correct parameters
- Edge cases → malformed input, out-of-scope questions, multilingual

#### 12.2 Automated evaluation

Run the test suite against each model/prompt change and measure:
- **Tool call accuracy:** Did it call the right tool with the right parameters?
- **Response relevance:** Did it answer the question? (LLM-as-judge)
- **Latency:** Time to first token, total response time
- **Token efficiency:** Total tokens used per conversation

#### 12.3 A/B testing infrastructure

When testing new models or prompts, support running both in parallel:
- Route 50% of users to the new configuration
- Compare quality metrics
- Roll back if quality drops

---

## 13. Implementation Roadmap

### Phase 1: Quick Wins (1-2 weeks)

| # | Change | Impact | Effort |
|---|--------|--------|--------|
| 1 | **Change default model to `qwen3:8b`** | High | Low — settings default change |
| 2 | **Compress system prompt to <400 tokens** | High | Low — rewrite prompt |
| 3 | **Shorten tool descriptions** | Medium | Low — edit text |
| 4 | **Add `maxTokens: 2048` to streamText** | Medium | Trivial |
| 5 | **Add "stop generating" button** | Medium | Low — `chat.stop()` |
| 6 | **Reduce resource context to top 5** | Low | Low — change `limit` variable |
| 7 | **Add quantization guidance to settings UI** | Low | Low — help text |

### Phase 2: Core Improvements (2-4 weeks)

| # | Change | Impact | Effort |
|---|--------|--------|--------|
| 8 | **Implement sliding window + summarization** | High | Medium |
| 9 | **Add hybrid search (BM25 + vector RRF)** | High | Medium |
| 10 | **Fix RAG to use indexed vector search** (sqlite-vss or query limit) | High | Medium |
| 11 | **Improve chunking** (smaller chunks, overlap, heading context) | Medium | Medium |
| 12 | **Add token budgeting** | Medium | Medium |
| 13 | **Add endpoint allowlist/blocklist** | Medium | Low |
| 14 | **Add conversation history panel** | Medium | Medium |
| 15 | **Add suggested prompts** | Low | Low |
| 16 | **Enable Ollama structured output mode** | Medium | Low — test + enable |

### Phase 3: Advanced (4-8 weeks)

| # | Change | Impact | Effort |
|---|--------|--------|--------|
| 17 | **Query routing** (simple → RAG-only → full agent) | High | High |
| 18 | **Optional cloud model fallback** | Medium | Medium |
| 19 | **Build evaluation test suite** | Medium | High |
| 20 | **Confirmation flow for mutations** | Medium | Medium |
| 21 | **Semantic caching** | Low | Medium |
| 22 | **Cross-encoder reranker for RAG** | Low | Medium |

---

## Appendix A: Model Comparison Cheat Sheet

| Model | Params | Tool F1 | Best For | Ollama Tag |
|-------|--------|---------|----------|------------|
| Qwen3 | 8B | 0.933 | Tool calling, agent tasks | `qwen3:8b` |
| Granite 3.3 Dense | 8B | High | Enterprise, RAG, JSON | `granite3.3-dense:8b` |
| Llama 3.1 | 8B | Good | General purpose | `llama3.1:8b` |
| Ministral | 8B | Good | Edge, function calling | `ministral:8b` |
| Phi-4-mini | 3.8B | Competitive | Low memory, reasoning | `phi4-mini` |
| Qwen3 | 1.7B | Moderate | Router, draft model | `qwen3:1.7b` |

## Appendix B: Token Budget Template

```
┌─────────────────────────────────┬──────────┐
│ Component                       │ Tokens   │
├─────────────────────────────────┼──────────┤
│ System prompt                   │ 300-400  │
│ Tool definitions (4 tools)      │ 300-400  │
│ RAG context (top 3-5 chunks)    │ 500-1500 │
│ Resource context (5 resources)  │ 60-100   │
│ Conversation summary            │ 100-200  │
│ Recent messages (8-10 turns)    │ 2000-3000│
│ Current user message            │ 50-500   │
│ Response budget                 │ 1000-2000│
├─────────────────────────────────┼──────────┤
│ TOTAL                           │ ~4300-8100│
└─────────────────────────────────┴──────────┘
```

## Appendix C: Proposed Compressed System Prompt

```xml
<role>Attraccess AI assistant. Makerspace/FabLab resource management platform.</role>
<rules>
- Concise. Match user's language.
- searchEndpoints to find APIs, then callEndpoint to execute.
- searchDocs/searchDocumentation for documentation questions.
- Explain before acting. Admit uncertainty.
</rules>
<ui>
json-render blocks in markdown: navigation-buttons, data-table, bar-chart, line-chart, info-card, link-list.
Format: ```json-render {"type":"<component>", ...}```
</ui>
<context>
User: {{name}}
Resources: {{compact_resource_list}}
</context>
```

Estimated: ~200 tokens (down from ~800+).

## Appendix D: Sources

- Docker: Local LLM Tool Calling Evaluation (Aug 2025) — model benchmarks
- Berkeley Function Calling Leaderboard V4 — tool calling accuracy
- Vercel AI SDK 6 documentation — streaming, structured output
- NAACL 2025 Prompt Compression Survey — prompt engineering for small models
- LLMLingua (Microsoft) — prompt compression techniques
- Firecrawl: Best Chunking Strategies for RAG 2026 — chunking research
- Superlinked: Optimizing RAG with Hybrid Search & Reranking — hybrid search patterns
- Red Hat: vLLM vs llama.cpp vs Ollama — inference engine comparison
- LangChain: State of AI Agents 2025 — context engineering patterns
- arXiv 2512.15943: Small Language Models for Efficient Agentic Tool Calling
