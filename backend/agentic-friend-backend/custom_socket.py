import asyncio
import json
import logging
from fastapi import WebSocket
from fastapi.websockets import WebSocketDisconnect
import re

from time_expiration import SessionGuard
from hf_voice_synthesis.SpeechToText import STTSession
from hf_voice_synthesis.TextToSpeach import TTSSession
from config.Singleton import SingletonSessionMemory
from config.logging_config import setup_logging
from google.adk.runners import Runner
from google.genai.types import Content, Part
from agents.root_agent import agentic_app

# Set up logging
logger = setup_logging()


async def websocket_handler(
    websocket: WebSocket,
    session_id: str,
    user_id: str,
    singltonRunner: Runner,
):
    logger.info("[VOICE WS] Initializing session...")

    text_queue     = asyncio.Queue()
    shutdown_event = asyncio.Event()
    session_guard  = SessionGuard(timeout_minutes=15)

    stt_session = STTSession()
    tts_session = TTSSession()

    await stt_session.start()
    await tts_session.start()

    logger.info("[VOICE WS] Both lanes ready. Connecting ADK...")

    try:
        await asyncio.gather(
            stt_input_lane(
                shutdown_event=shutdown_event,
                text_queue=text_queue,
                session_guard=session_guard,
                websocket=websocket,
                user_id=user_id,
                session_id=session_id,
                stt_session=stt_session,
                tts_session=tts_session
            ),
            adk_connector(
                shutdown_event=shutdown_event,
                runner=singltonRunner,
                session_id=session_id,
                text_queue=text_queue,
                session_guard=session_guard,
                user_id=user_id,
                tts_session=tts_session,
            ),
            tts_output_lane(
                shutdown_event=shutdown_event,
                websocket=websocket,
                tts_session=tts_session,
            ),
        )
    except WebSocketDisconnect:
        logger.info("[VOICE WS] Client disconnected.")
    except Exception as e:
        logger.error(f"[VOICE WS ERROR] {type(e).__name__}: {e}", exc_info=True)
    finally:
        shutdown_event.set()
        await stt_session.stop()
        await tts_session.stop()
        if websocket.client_state.name != "DISCONNECTED":
            await websocket.close()
        logger.info("[VOICE WS] Session closed.")


# ── Lane 1: STT input ─────────────────────────────────────────────────────────

async def stt_input_lane(
    shutdown_event: asyncio.Event,
    text_queue: asyncio.Queue,
    session_guard: SessionGuard,
    websocket: WebSocket,
    user_id: str,
    session_id: str,
    stt_session: STTSession,
    tts_session: TTSSession
):
    logger.info("[STT LANE] Input lane started.")

    async def _feed_ws_audio():
        """
        Receive messages from the WebSocket and route by type.

        Text  → JSON config  (e.g. {"type":"config","format":"int16"})
        Bytes → raw Int16 PCM audio chunks from the VAD worklet
        """
        while not shutdown_event.is_set():
            if not session_guard.is_valid():
                logger.warning("[STT LANE] Session expired.")
                shutdown_event.set()
                return
            try:
                # receive_bytes() crashes on the config message sent at connect.
                message = await asyncio.wait_for(
                    websocket.receive(), timeout=0.5
                )

                if "text" in message:
                    # ── JSON config from frontend ──────────────────────
                    try:
                        cfg = json.loads(message["text"])
                        if cfg.get("type") == "config":
                            fmt  = cfg.get("format", "int16")
                            lang = cfg.get("language", "en")
                            stt_session.set_format(fmt)
                            logger.info(f"[STT LANE] Config — fmt={fmt}  lang={lang}")
                        elif cfg.get("type") == "barge_in":
                            # User interrupted — flush TTS queue immediately
                            logger.info("[STT LANE] Barge-in detected — clearing TTS queue")
                            tts_session.clear()   # ← new method on TTSSession
                    except json.JSONDecodeError:
                        pass   # ignore malformed text

                elif "bytes" in message and message["bytes"]:
                    # ── Raw PCM audio from VAD worklet ─────────────────
                    stt_session.feed(message["bytes"])

            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"[STT LANE] Receive error: {e}", exc_info=True)
                shutdown_event.set()
                return

    async def _drain_transcriptions():
        """
        Consume transcriptions from STTSession.
        Partials are buffered locally.
        Only a final flush (silence detected) is forwarded to ADK.
        """
        partial_buffer: list[str] = []

        async for user_text, is_final in stt_session.transcriptions():
            if shutdown_event.is_set():
                break

            if not is_final:
                partial_buffer.append(user_text)
                logger.debug(f"[STT LANE] Partial: {user_text}")
                continue

            # Final — combine all partials into one complete utterance
            partial_buffer.append(user_text)
            full_utterance = " ".join(partial_buffer).strip()
            partial_buffer.clear()

            if not full_utterance:
                continue

            logger.info(f"[STT LANE] ✔ Full utterance: {full_utterance}")

            session = await SingletonSessionMemory.get_session(
                app_name=agentic_app.name,
                user_id=user_id,
                session_id=session_id,
            )
            if session:
                session.state["user_input"] = full_utterance
                await SingletonSessionMemory.update_session(session)

            await text_queue.put(
                Content(parts=[Part(text=full_utterance)], role="user")
            )
            session_guard.reset_silence_timer()

    try:
        await asyncio.gather(_feed_ws_audio(), _drain_transcriptions())
    except Exception as e:
        logger.error(f"[STT LANE] Error: {type(e).__name__}: {e}", exc_info=True)

    logger.info("[STT LANE] Input lane ended.")


# ── ADK Connector ─────────────────────────────────────────────────────────────

async def adk_connector(
    shutdown_event: asyncio.Event,
    runner: Runner,
    session_id: str,
    text_queue: asyncio.Queue,
    session_guard: SessionGuard,
    user_id: str,
    tts_session: TTSSession,
):
    logger.info("[ADK] Connector started.")

    while not shutdown_event.is_set():
        if not session_guard.is_valid():
            logger.warning("[ADK] Session expired.")
            shutdown_event.set()
            break

        try:
            content = await asyncio.wait_for(text_queue.get(), timeout=0.5)
        except asyncio.TimeoutError:
            continue

        if not content:
            continue

        logger.info(f"[ADK] Processing: {content}")

        try:
            async for event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=content,
            ):
                if shutdown_event.is_set():
                    break

                if not (event.content and event.content.parts):
                    continue

                if not (hasattr(event, "is_final_response") and event.is_final_response()):
                    continue

                for part in event.content.parts:
                    if part.text:
                        logger.info(f"[ADK] → TTS lane: {part.text}")
                        tts_session.feed(part.text)

        except Exception as e:
            logger.error(f"[ADK] Runner error: {type(e).__name__}: {e}", exc_info=True)

    logger.info("[ADK] Connector ended.")


# ── Lane 2: TTS output ────────────────────────────────────────────────────────

async def tts_output_lane(
    shutdown_event: asyncio.Event,
    websocket: WebSocket,
    tts_session: TTSSession,
):
    logger.info("[TTS LANE] Output lane started.")

    try:
        async for audio_bytes in tts_session.audio_chunks():
            if shutdown_event.is_set():
                break
            await websocket.send_bytes(audio_bytes)
            logger.info(f"[TTS LANE] ✔ Sent {len(audio_bytes)} bytes.")

    except Exception as e:
        logger.error(f"[TTS LANE] Error: {type(e).__name__}: {e}", exc_info=True)
        shutdown_event.set()

    logger.info("[TTS LANE] Output lane ended.")