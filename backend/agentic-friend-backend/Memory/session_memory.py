import json
import logging
import os
import time
from typing import Optional
from google.adk.sessions import BaseSessionService
from google.adk.sessions.session import Session
from google.adk.sessions.base_session_service import (
    GetSessionConfig,
    ListSessionsResponse
)
import asyncio
import base64

# Set up logging
logger = logging.getLogger(__name__) 

# Class to inherit the JSONEncoder class 
class _SafeEncoder(json.JSONEncoder):
    """
    Extends the default JSON encoder to handle types that ADK
    stores internally but JSON doesn't support natively.

    set   → list   (ADK uses sets for tool call deduplication)
    bytes → base64 string (defensive — unlikely but safe)
    """
    def default(self, obj):
        if isinstance(obj, set):
            return list(obj)
        if isinstance(obj, bytes):
            return base64.b64encode(obj).decode("utf-8")
        return super().default(obj)

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
                json.dump(serialized_db, f, indent=4,  cls=_SafeEncoder)
        except Exception as e:
            logger.error(f"[SessionMemory] Exception at save json: {e}", exc_info=True)

    async def _async_save(self):
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._save_to_json)

    def _load_from_json(self):
        """Reconstructs the entire _sessions dictionary from JSON."""
        if not os.path.exists(self.storage_path):
            return

        try:
            with open(self.storage_path, "r") as f:
                content = f.read().strip()

            # Guard: empty file is treated as a fresh start, not an error
            if not content:
                logger.warning("[SessionMemory] Memory.json is empty — starting fresh.")
                return

            raw_data = json.loads(content)
            for key, data in raw_data.items():
                self._sessions[key] = Session(**data)

            logger.info(f"[SessionMemory] Sync Complete: {len(self._sessions)} sessions loaded.")

        except json.JSONDecodeError as e:
            logger.error(f"[SessionMemory] Corrupted JSON — starting fresh. Detail: {e}")
            # Optionally back up the bad file before wiping
            if os.path.exists(self.storage_path):
                os.rename(self.storage_path, self.storage_path + ".corrupted")

        except Exception as e:
            logger.error(f"[SessionMemory] Sync Failed: {e}", exc_info=True)

    async def create_session(
        self,
        *,
        app_name: str = "agentic_friend",
        user_id: str,
        session_id: str,
        **kwargs,
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
            await self._async_save()

            logger.info(f"[SessionMemory] Created and Persisted: {key}")
            return session
        except Exception as e:
            logger.error("Error at create session", exc_info=True)
            # Re-raise the exception so callers can handle it appropriately
            raise e

    async def get_session(
        self,
        *,
        app_name: str = "agentic_friend",
        user_id: str,
        session_id: str,
        **kwargs,
    ) -> Optional[Session]:
        try:
            key = self._key(app_name, user_id, session_id)
            session = self._sessions.get(key)
            logger.info(f"[SessionMemory] get_session({key}): {'found' if session else 'not found'}")
            return session
        except Exception as e:
            logger.error("Exception at get session method", exc_info=True)
            # Return None instead of raising exception to allow graceful handling
            return None

    async def update_session(self, session: Session) -> Session:
        """Updates an existing session and syncs to JSON."""
        try:
            key = self._key(session.app_name, session.user_id, session.id)
            self._sessions[key] = session

            # Save entire updated state to JSON
            await self._async_save()
            return session
        except Exception as e:
            logger.error("Exception at update session method", exc_info=True)
            # Re-raise the exception so callers can handle it appropriately
            raise e

    async def list_sessions(self, *, app_name: str, user_id: Optional[str] = None, **kwargs,) -> ListSessionsResponse:
        try:
            sessions = [
                s for s in self._sessions.values()
                if s.app_name == app_name and (user_id is None or s.user_id == user_id)
            ]
            return ListSessionsResponse(sessions=sessions)
        except Exception as e:
            logger.error("Exception at list sessions method", exc_info=True)
            # Return empty list instead of raising exception to allow graceful handling
            return ListSessionsResponse(sessions=[])

    async def delete_session(self, *, app_name: str, user_id: str, session_id: str, **kwargs,) -> None:
        try:
            key = self._key(app_name, user_id, session_id)
            if key in self._sessions:
                del self._sessions[key]
                await self._async_save() # Sync deletion
                logger.info(f"[SessionMemory] Deleted session: {key}")
        except Exception as e:
            logger.error("Exception at delete session method", exc_info=True)
            # Don't raise exception - deletion failures shouldn't crash the application