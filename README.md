# AgenticFriend - Multi-Agent Autonomous Development Kit

  ## 📚 Overview

  This project implements an **AgenticFriend** multi-agent AI system with voice synthesis capabilities, featuring multiple specialized agents  
  for different conversation and task types.

  ## 🏗️ Architecture

  ### Directory Structure
  adk_multi-agent/
  ├── README.md                    # This file
  ├── requirements.txt             # Python dependencies
  ├── docker-compose.yaml          # Container orchestration
  ├── backend/                     # Backend microservices
  │   └── agentic-friend-backend/
  │       ├── main.py             # Flask API entry point
  │       ├── agents/             # Agent definitions
  │       │   ├── checker_agent.py      # Intent verification
  │       │   ├── execution_agents.py   # Task execution
  │       │   ├── friend_agent.py       # Core conversation agent
  │       │   ├── planner_agent.py      # Task planning
  │       │   └── root_agent.py        # Entry point agent
  │       ├── memory/             # Memory management
  │       │   ├── Memory.json
  │       │   └── session_memory.py
  │       ├── voice_synthesis/   # AI voice generation
  │       │   └── hf_voice_synthesis/
  │       └── config/            # Configuration files
  ├── frontend/                   # React frontend
  │   └── agentic-friend-frontend/
  │       ├── src/
  │       │   ├── App.js
  │       │   ├── audio.js       # Audio processing
  │       │   ├── websocket.js   # WebSocket communication
  │       │   ├── index.js
  │       │   ├── ApiExampleComponent.js
  │       │   ├── Loader.js
  │       │   └── sessionService.js
  │       └── package.json
  ├── Dockerfile                 # Container build instructions
  └── config/

  ## 🎯 Core Components

  ### Backend Agents

  #### 1. **Root Agent** (`root_agent.py`)
  - **Purpose**: Entry point for all conversations
  - **Function**: Routes incoming requests to appropriate agents
  - **Capabilities**:
    - Initial greeting and context setup
    - Intent classification
    - Agent orchestration

  #### 2. **Friend Agent** (`friend_agent.py`)
  - **Purpose**: Core conversation management
  - **Function**: Handles main conversation flow
  - **Capabilities**:
    - Natural conversation
    - Memory management
    - Session persistence
    - Context awareness

  #### 3. **Planner Agent** (`planner_agent.py`)
  - **Purpose**: Task planning and breakdown
  - **Function**: Analyzes complex requests into sub-tasks
  - **Capabilities**:
    - Request parsing
    - Sub-task identification
    - Planning conversation structure
    - Intent verification
    - Route selection

  #### 4. **Checker Agent** (`checker_agent.py`)
  - **Purpose**: Intent verification and validation
  - **Function**: Validates request paths
  - **Capabilities**:
    - Intent checking
    - Path validation
    - Error detection
    - Response routing

  #### 5. **Execution Agent** (`execution_agents.py`)
  - **Purpose**: Task execution
  - **Function**: Performs identified sub-tasks
  - **Capabilities**:
    - Task execution
    - Voice synthesis
    - Response generation
    - Streaming responses

  ### Frontend Components

  #### Key Files:
  - **App.js**: Main React component
  - **audio.js**: Audio processing and voice handling
  - **websocket.js**: WebSocket connection management
  - **sessionService.js**: Session state management
  - **ApiExampleComponent.js**: API integration examples
  - **Loader.js/GlobalLoader.js**: Loading states
  - **audio-processor.worklet.js**: Web Audio Worklet for real-time audio

  ## 🔧 Technology Stack

  ### Backend
  - **Framework**: Flask
  - **Language**: Python 3.12+
  - **Voice**: HuggingFace Transformers (whisper-small for transcription, vits for synthesis)
  - **WebSocket**: custom_socket.py
  - **Dependencies**: FastAPI, transformers, websockets, Flask, uvicorn

  ### Frontend
  - **Framework**: React
  - **State Management**: Context API
  - **Audio**: Web Audio API, WebSockets
  - **Styling**: CSS Modules

  ### Containerization
  - **Docker**: Multi-stage builds for frontend and backend
  - **Compose**: Services for development orchestration

  ## 🚀 Quick Start

  ### Prerequisites
  - Docker & Docker Compose
  - Git
  - Node.js (for frontend)
  - Python 3.12+

  ### Installation

  1. **Clone the repository**:
  ```bash
  git clone <repository-url>
  cd adk_multi-agent

  2. Configure environment:
  cp backend/agentic-friend-backend/config/.env.example backend/agentic-friend-backend/config/.env
  # Edit .env with your configuration

  3. Start with Docker:
  docker-compose up --build

  4. Or develop manually:
  # Backend
  cd backend/agentic-friend-backend
  pip install -r requirements.txt
  python main.py

  # Frontend
  cd frontend/agentic-friend-frontend
  npm install
  npm start

  📝 Memory System

  The project uses a persistent memory system:
  - Location: backend/agentic-friend-backend/memory/Memory.json
  - Session Memory: session_memory.py
  - Expiration: time_expiration.py

  Memory includes conversation history, user preferences, and session state.

  🎤 Voice Features

  Voice Synthesis

  - Model: HuggingFace vits small (multi-lingual)
  - Features:
    - Real-time voice generation
    - Voice cloning capability
    - Multi-language support
    - Streaming responses

  Audio Processing

  - Transcription: Whisper small
  - Processing: Web Audio API
  - Optimization: Audio worklets for browser performance

  🔍 API Endpoints

  The backend exposes several endpoints:
  - POST /conversation: Start new conversation
  - GET /status: System status
  - POST /voice: Voice synthesis requests
  - WebSocket /ws: Real-time streaming

  🛠️ Development Tips

  1. Agent Communication: Use WebSocket for inter-agent communication
  2. Memory Management: Session memory is persisted; check expiration settings
  3. Voice Quality: Adjust audio settings in .env for optimal quality
  4. Error Handling: Checkers validate paths before execution
  5. Performance: Monitor Grafana api-latency dashboard for issues

  📊 Monitoring

  - Grafana Dashboard: Check api-latency for API performance
  - WebSocket Logs: Monitor connection health
  - Memory Stats: Review Memory.json for conversation history

  🐛 Debugging

  - Backend: Set DEBUG=true in .env
  - Frontend: Enable React development mode
  - Agents: Use logging_config.py for detailed logs
  - Memory: Inspect session_memory.py for session state

  📦 Project State

  Current Status:
  - ✅ Multi-agent system implemented
  - ✅ Voice synthesis integrated
  - ✅ WebSocket communication established
  - ✅ Memory system in place
  - ⚙️ Optimizing audio processing
  - ⚙️ Enhancing agent coordination