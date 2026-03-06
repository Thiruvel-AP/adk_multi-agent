import json
import os
import time
from typing import Optional
from google.adk.sessions import BaseSessionService
from google.adk.sessions.session import Session
from google.adk.sessions.base_session_service import (
    GetSessionConfig, 
    ListSessionsResponse
)

class SessionMemory(BaseSessionService):
    """JSON-backed session service storing the entire session dictionary."""
    def __init__(self):
        # Point to the mounted volume path
        memory_dir = os.environ.get("MEMORY_DIR", "/app/memory_data")
        os.makedirs(memory_dir, exist_ok=True)  # safety: ensure dir exists
        self.storage_path = os.path.join(memory_dir, "Memory.json")
        self._sessions: dict[str, Session] = {}
        self._load_from_json()

    def _key(self, app_name: str, user_id: str, session_id: str) -> str:
        """Create a unique storage key from the three identifiers."""
        return f"{app_name}:{user_id}:{session_id}"

    def _save_to_json(self):
        """Serializes the entire _sessions dictionary to JSON."""
        try:
            # We must convert Session objects to dicts so JSON can save them
            serialized_db = {}
            for key, session in self._sessions.items():
                serialized_db[key] = session.model_dump()

            with open(self.storage_path, "w") as f:
                json.dump(serialized_db, f, indent=4)
        except Exception as e:
            print(f"[SessionMemory] Exception at save json: {e}")

    def _load_from_json(self):
        """Reconstructs the entire _sessions dictionary from JSON."""
        if os.path.exists(self.storage_path):
            try:
                with open(self.storage_path, "r") as f:
                    raw_data = json.load(f)
                    for key, data in raw_data.items():
                        # Rebuild the full Session object from the saved dict
                        self._sessions[key] = Session(**data) 
                print(f"[SessionMemory] Sync Complete: {len(self._sessions)} sessions loaded.")
            except Exception as e:
                print(f"[SessionMemory] Sync Failed: {e}")

    async def create_session(
        self,
        *,
        app_name: str = "agentic_friend",
        user_id: str,
        session_id: str,
    ) -> Session:
        try:
            session = Session(
                id=session_id,
                app_name=app_name,
                user_id=user_id,
                state={"user_input" : ""},
                events=[]
            )

            key = self._key(app_name, user_id, session_id)
            self._sessions[key] = session
            
            # Save entire state to JSON
            self._save_to_json()
            
            print(f"[SessionMemory] Created and Persisted: {key}")
            return session
        except Exception as e:
            print("Error at create session", e)

    async def get_session(
        self,
        *,
        app_name: str = "agentic_friend",
        user_id: str,
        session_id: str,
    ) -> Optional[Session]:
        try:
            key = self._key(app_name, user_id, session_id)
            session = self._sessions.get(key)
            print(f"[SessionMemory] get_session({key}): {'found' if session else 'not found'}")
            return session
        except Exception as e:
            print("Exception at get session method", e)

    async def update_session(self, session: Session) -> Session:
        """Updates an existing session and syncs to JSON."""
        key = self._key(session.app_name, session.user_id, session.id)
        self._sessions[key] = session
        
        # Save entire updated state to JSON
        self._save_to_json()
        return session

    async def list_sessions(self, *, app_name: str, user_id: Optional[str] = None) -> ListSessionsResponse:
        sessions = [
            s for s in self._sessions.values() 
            if s.app_name == app_name and (user_id is None or s.user_id == user_id)
        ]
        return ListSessionsResponse(sessions=sessions)

    async def delete_session(self, *, app_name: str, user_id: str, session_id: str) -> None:
        key = self._key(app_name, user_id, session_id)
        if key in self._sessions:
            del self._sessions[key]
            self._save_to_json() # Sync deletion
            print(f"[SessionMemory] Deleted session: {key}")