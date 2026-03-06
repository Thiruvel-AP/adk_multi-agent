# Memory/singleton.py
from Memory.session_memory import SessionMemory

# Import Runner class 
from google.adk.runners import Runner

# Import app from agents.root_agent
from agents.root_agent import agentic_app

SingletonSessionMemory: SessionMemory = SessionMemory()

SingletonRunner: Runner = Runner(
    app_name=agentic_app.name,
    agent=agentic_app.root_agent,
    session_service=SingletonSessionMemory
)