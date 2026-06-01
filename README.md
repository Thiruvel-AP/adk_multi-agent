# AgenticFriend: Real-Time Voice Multi-Agent AI System

A **production-grade voice AI system** built on **Google ADK** with a 5-agent hierarchy powered by **Gemini 2.5 Flash Lite**, a custom VAD-driven STT pipeline using **faster-whisper**, and a chunked TTS pipeline using **facebook/mms-tts-eng** on CUDA  all connected over a **full-duplex WebSocket** with barge-in support.

Three async lanes run concurrently for every voice session: raw PCM audio in → Whisper transcription → ADK agent graph → TTS synthesis → WAV bytes out.

> Built with: `google-adk` · `faster-whisper` · `facebook/mms-tts-eng` · `FastAPI` · `asyncio` · `React` · `Docker` (NVIDIA GPU)

---

## Architecture

```
Browser (React SPA)
        │
        │  WebSocket /voice?session_id=&user_id=
        │  POST      /start-session?session_id=&user_id=
        ▼
FastAPI (uvicorn, port 8000)
        │
        ▼
websocket_handler()   ← asyncio.gather of 3 concurrent lanes
        │
        ├── Lane 1: stt_input_lane()
        │       │
        │       ├── _feed_ws_audio()        Reads WebSocket frames
        │       │       JSON text → config (format, language)
        │       │       JSON text → barge_in → tts_session.clear()
        │       │       bytes    → stt_session.feed(raw_pcm)
        │       │
        │       └── _drain_transcriptions()
        │               async for (text, is_final) in stt_session.transcriptions()
        │               is_final=False → buffer partials locally
        │               is_final=True  → combine, update SessionMemory
        │                              → text_queue.put(Content(...))
        │                              → session_guard.reset_silence_timer()
        │
        ├── Lane 2: adk_connector()
        │       content = await text_queue.get()
        │       async for event in runner.run_async(user_id, session_id, content):
        │           if event.is_final_response():
        │               tts_session.feed(part.text)
        │
        └── Lane 3: tts_output_lane()
                async for audio_bytes in tts_session.audio_chunks():
                    await websocket.send_bytes(audio_bytes)
        │
        ▼
SessionGuard(timeout_minutes=15)
        → is_valid(): (now − start_time) < 15 min
        → check_session_duration(seconds): now − last_action_time ≥ N sec
        → reset_silence_timer(): called on each full utterance
```

---

## Agent Hierarchy (Google ADK)

```
google.adk.apps.App("agentic_friend")
        └── root_agent = checker_agent (LlmAgent, Gemini 2.5 Flash Lite)
                │
                │  Intent classification via semantic analysis
                │  user_input dict: {"user": [...], "agent": [...]}
                │
                ├── Conversational path
                │   └── friend_agent (LlmAgent, Gemini 2.5 Flash Lite)
                │           Emotionally intelligent conversation
                │           output_key="user_input"
                │           Handles: empathy, hesitation, silence, dict memory
                │           Narrates research results back as spoken story
                │
                └── Task path
                    └── planner_agent (LlmAgent, Gemini 2.5 Flash Lite)
                            │
                            │  Routes on task dependency structure:
                            │
                            ├── Sequential dependencies
                            │   └── sequential_flow (SequentialAgent)
                            │           ├── research_agent
                            │           │     tools=[google_search]
                            │           │     output_key="research_findings"
                            │           ├── writer_agent
                            │           │     input: {research_findings}
                            │           └── friend_agent (narrates result)
                            │
                            └── Parallel / independent sub-tasks
                                └── sequential_resultant_flow (SequentialAgent)
                                        ├── parallel_flow (ParallelAgent)
                                        │     ├── Researcher_1  output_key="research_findings_1"
                                        │     ├── Researcher_2  output_key="research_findings_2"
                                        │     ├── Researcher_3  output_key="research_findings_3"
                                        │     ├── Researcher_4  output_key="research_findings_4"
                                        │     └── Researcher_5  output_key="research_findings_5"
                                        ├── Writer_1
                                        │     input: {research_findings_1..5}
                                        │     output_key="writer_findings_1"
                                        └── friend_agent (narrates result)
```

**Agent routing logic (checker_agent):**
- Conversational path: emotional cues, small talk, relational engagement, hesitation → `friend_agent`
- Task path: goal, request, problem, instruction requiring cognitive work → `planner_agent`
- Passes full conversation dict `{user_input}` to friend_agent; passes only the last user utterance as `task` to planner_agent

**Planner routing logic:**
- Logical progression, causal chains, step-dependent output → `sequential_flow`
- Independent subtasks, multi-angle research, parallel facts → `sequential_resultant_flow`

---

## STT Pipeline (`hf_voice_synthesis/SpeechToText.py`)

**Model:** `faster-whisper base.en`  loaded as a class-level singleton, CUDA float16 when GPU present, int8 on CPU

**VAD State Machine Parameters:**

| Parameter | Value | Purpose |
|---|---|---|
| `SAMPLE_RATE` | 16,000 Hz | Target sample rate for Whisper |
| `SILENCE_GATE` | 0.02 amplitude | Below this = silent chunk |
| `SILENCE_CHUNKS` | 5 consecutive | Trigger end-of-utterance flush |
| `PERIODIC_FLUSH_SEC` | 2.0 s | Mid-speech partial flush interval |
| `OVERLAP_SEC` | 0.1 s | Context carried into next window |
| `MIN_SPEECH_SEC` | 0.3 s | Skip utterances shorter than this |
| `MAX_SPEECH_SEC` | 30.0 s | Hard cap  force partial flush |
| `SPEECH_TIMEOUT_SEC` | 1.2 s | No audio received → final flush |

**Format normalisation:** `_to_float32()` handles int8, int16, int32, int64, uint8, uint16, float32, float64  auto-infers format when `fmt="auto"` via `_infer_fmt()`. All formats normalised to float32 ∈ [−1.0, 1.0] before inference.

**Two flush modes:**
- `mode="partial"`  mid-speech flush every `PERIODIC_FLUSH_SEC` or at `MAX_SPEECH_SEC`; keeps `OVERLAP_SEC` context in buffer; yields `(text, is_final=False)`  caller buffers locally
- `mode="final"`  silence or timeout detected; trims trailing silent chunks; yields `(text, is_final=True)`  caller sends to ADK

**Low-confidence filter:** Whisper segments with `no_speech_prob > 0.6` are discarded before joining.

---

## TTS Pipeline (`hf_voice_synthesis/TextToSpeach.py`)

**Model:** `facebook/mms-tts-eng`  loaded as a class-level singleton; CUDA `torch.float16` when GPU present (halves memory, ~2× faster inference), `float32` on CPU. CUDA warm-up pass on load to pre-compile kernels.

**Text cleaning (`_clean_text`)**  applied before splitting:
- Markdown formatting stripped: `**bold**`, `_italic_`, `` `code` ``, `# headers`, `[link](url)`
- Bullet markers removed: `- item`, `• item`, `1. item`
- Symbols converted to spoken form: `$100` → `100 dollars`, `95%` → `95 percent`, `3.14` → `3 point 14`
- `&` → `and`, `@` → `at`, `#tag` → `tag`
- Newlines collapsed to spaces; non-pronounceable characters removed

**Sentence-boundary splitting (`_split_text`):**
- Chunks kept under `MAX_CHARS=200` on sentence boundaries (`[.!?]`)
- Falls back to clause splits on `,` for sentences exceeding `MAX_CHARS`
- Shorter chunks = faster first-audio delivery (streaming feel)

**Barge-in support:** `tts_session.clear()` drains both `_in_q` and `_out_q` immediately when a `{"type": "barge_in"}` message arrives from the frontend  user speech instantly interrupts agent audio.

**Output format:** Raw int16 PCM → WAV container via `wave` module → `bytes` → sent over WebSocket.

**Minimum length gate:** `MIN_WORDS=3`  chunks with fewer than 3 words are dropped to prevent synthesis artefacts on fragments.

---

## Session Memory (`Memory/session_memory.py`)

Custom `SessionMemory(BaseSessionService)`  implements the Google ADK `BaseSessionService` interface backed by JSON on disk.

**Storage schema:** `{app_name}:{user_id}:{session_id}` → `Session.model_dump()` serialised to `Memory.json`

**`_SafeEncoder`**  extends `json.JSONEncoder`:
- `set` → `list` (ADK uses sets for tool call deduplication)
- `bytes` → base64 string (defensive fallback)

**Async persistence:** `_save_to_json()` is called via `asyncio.get_event_loop().run_in_executor(None, ...)`  never blocks the event loop

**Resilience:**
- Empty `Memory.json` → starts fresh (no crash)
- Corrupted JSON → renames to `Memory.json.corrupted`, starts fresh
- `get_session()` returns `None` on miss rather than raising
- `delete_session()` swallows errors  deletion failures don't crash the app

**Mounted volume path:** `MEMORY_DIR=/app/memory_data` (Docker env var)  sessions survive container restarts

---

## API Surface (`main.py`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/start-session?session_id=&user_id=` | Creates or validates a session. Generates new UUIDs if session invalid. Returns `{session_id, user_id}` |
| `WebSocket` | `/voice?session_id=&user_id=` | Full-duplex voice lane. Validates both params before accepting; closes with code 1008 if missing |

**Session lifecycle:**
1. Frontend calls `POST /start-session` → receives `session_id` + `user_id` UUIDs
2. Frontend opens `WebSocket /voice?session_id=...&user_id=...`
3. Frontend sends `{"type": "config", "format": "int16", "language": "en"}` on connect
4. Frontend streams raw Int16 PCM bytes from AudioWorklet VAD
5. Frontend sends `{"type": "barge_in"}` to interrupt agent speech
6. Backend sends WAV bytes frames back over the same socket

---

## Project Structure

```
adk_multi-agent/
├── requirements.txt
├── Dockerfile
├── docker-compose.yaml              # GPU passthrough, volume mounts
├── backend/
│   └── agentic-friend-backend/
│       ├── main.py                  # FastAPI app  /start-session + /voice WebSocket
│       ├── custom_socket.py         # 3-lane async pipeline orchestrator
│       ├── agents/
│       │   ├── root_agent.py        # google.adk.apps.App  binds checker_agent as root
│       │   ├── checker_agent.py     # Intent classifier  routes to friend or planner
│       │   ├── friend_agent.py      # Empathetic conversation + result narration
│       │   ├── planner_agent.py     # Task router  sequential vs parallel execution
│       │   └── execution_agents.py  # research_agent, writer_agent, SequentialAgent, ParallelAgent
│       ├── hf_voice_synthesis/
│       │   ├── SpeechToText.py      # STTSession  faster-whisper, VAD state machine
│       │   └── TextToSpeach.py      # TTSSession  MMS TTS, markdown cleaner, barge-in
│       ├── Memory/
│       │   ├── session_memory.py    # SessionMemory(BaseSessionService)  JSON persistence
│       │   └── Memory.json          # Persistent session store (Docker volume)
│       ├── time_expiration/
│       │   └── time_expiration.py   # SessionGuard  15-min timeout, silence timer
│       └── config/
│           ├── Singleton.py         # Module-level singletons: SessionMemory, Runner
│           ├── logging_config.py    # Structured logging setup
│           └── config-template.txt  # GEMINI_API_KEY + HF_TOKEN
└── frontend/
    └── agentic-friend-frontend/
        ├── src/
        │   ├── App.js               # Main React component
        │   ├── audio.js             # Web Audio API  microphone capture
        │   ├── websocket.js         # WebSocket connection lifecycle
        │   ├── sessionService.js    # Session UUID management
        │   ├── SessionStore.js      # React state store for session
        │   ├── mic.js               # Microphone permissions + stream
        │   ├── useWebSocket.js      # Custom hook  WebSocket state
        │   └── useApiLoader.js      # Loading state hook
        └── public/
            └── audio-processor.worklet.js  # AudioWorklet  VAD, PCM capture
```

---

## Quickstart

### Prerequisites
- Docker + Docker Compose with NVIDIA Container Toolkit
- Google Cloud project with Gemini API enabled → `GEMINI_API_KEY`
- Hugging Face account → `HF_TOKEN` (for MMS TTS model)
- Node.js 18+ (frontend dev only)

### Configure

```bash
cp backend/agentic-friend-backend/config/config-template.txt \
   backend/agentic-friend-backend/config/.env

# Edit .env:
# GEMINI_API_KEY = "your-google-api-key"
# HF_TOKEN = "your-huggingface-token"
```

### Run with Docker (recommended)

```bash
docker-compose up --build
# Backend: http://localhost:8000
# Frontend: http://localhost:3000  (if containerised)
```

### Run manually

```bash
# Backend
cd backend/agentic-friend-backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000

# Frontend
cd frontend/agentic-friend-frontend
npm install && npm start
```

---

## Dependencies

| Package | Version | Role |
|---|---|---|
| `google-adk` | ≥1.24.0 | Agent framework  LlmAgent, SequentialAgent, ParallelAgent, Runner |
| `google-generativeai` | ≥0.8.0 | Gemini 2.5 Flash Lite model access |
| `faster-whisper` | ≥1.1.0 | STT  CTranslate2-optimised Whisper (CUDA float16 / CPU int8) |
| `transformers` | ≥4.41.0 | TTS  facebook/mms-tts-eng HuggingFace pipeline |
| `fastapi` | ≥0.115.0 | Async web framework  WebSocket + REST |
| `uvicorn` | ≥0.30.0 | ASGI server |
| `numpy` | ≥1.24.0 | PCM audio array processing |
| `sentencepiece` | ≥0.2.0 | MMS tokeniser dependency |
| `accelerate` | ≥0.30.0 | HuggingFace CUDA device placement |
| `python-dotenv` | ≥1.0.0 | .env loading |

---

## Sector Applications

| Sector | Application |
|---|---|
| **Technology / LLM Engineering** | Production reference for Google ADK multi-agent pipelines; intent-routing agent pattern; SequentialAgent → ParallelAgent → SequentialAgent composition; real-time WebSocket + voice AI |
| **Healthcare & Omics Research** | Clinical voice assistant template  patient intake, symptom narration, literature search via Research Agent; on-premise CUDA deployment keeps PHI off external APIs |
| **Finance & Analytics** | Voice-driven market research agent  parallel multi-source retrieval, synthesis, and narration; client-facing conversational analytics interface |

---

## Author

**Thiruvel Andagurunathan Pandian**  MSc Data Science, University of Bristol  
Designing real-time agentic AI systems that span LLM orchestration, voice interfaces, and production deployment.  
📍 Bristol, UK · **Eligible for Skilled Worker Visa sponsorship** · Open to UK roles

[![LinkedIn](https://img.shields.io/badge/LinkedIn-%230077B5.svg?logo=linkedin&logoColor=white)](https://linkedin.com/in/Thiruvel-AP)
[![GitHub](https://img.shields.io/badge/GitHub-%23121011.svg?logo=github&logoColor=white)](https://github.com/Thiruvel-AP)
