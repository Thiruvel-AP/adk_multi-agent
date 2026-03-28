import asyncio
import io
import logging
import re
import wave
from typing import AsyncIterator, Optional

import numpy as np
import torch
from transformers import pipeline as hf_pipeline

logger = logging.getLogger(__name__)


class TTSSession:

    # ── Config ────────────────────────────────────────────────────────────────

    MODEL_ID     : str = "facebook/mms-tts-eng"
    SAMPLE_WIDTH : int = 2
    CHANNELS     : int = 1
    MAX_CHARS    : int = 200     
    MIN_WORDS    : int = 3

    _shared_pipeline = None      

    # ── Construction ──────────────────────────────────────────────────────────

    def __init__(self) -> None:
        self._in_q:  asyncio.Queue[Optional[str]]   = asyncio.Queue()
        self._out_q: asyncio.Queue[Optional[bytes]] = asyncio.Queue()
        self._task:  Optional[asyncio.Task]         = None

    # ── Public API ────────────────────────────────────────────────────────────

    async def start(self) -> None:
        """Warm up the TTS model and launch the background processing loop."""
        self._load_pipeline()
        self._task = asyncio.create_task(self._loop(), name="tts-loop")
        logger.info("[TTS] Session started  model=facebook/mms-tts-eng")

    def feed(self, text: str) -> None:
        """
        Non-blocking. Call from your ADK response handler.
        Cleans markdown/symbols then splits into safe chunks internally.
        ADK connector just calls tts_session.feed(part.text) — nothing else needed.
        """
        if not text or not text.strip():
            return
        cleaned = self._clean_text(text)
        if not cleaned:
            return
        for chunk in self._split_text(cleaned):
            if len(chunk.split()) >= self.MIN_WORDS:
                self._in_q.put_nowait(chunk)

    async def audio_chunks(self) -> AsyncIterator[bytes]:
        """Async generator — yields one WAV bytes payload per synthesised chunk."""
        while True:
            chunk = await self._out_q.get()
            if chunk is None:
                return
            yield chunk

    async def stop(self) -> None:
        """Drain the queue and shut down the background loop cleanly."""
        self._in_q.put_nowait(None)
        if self._task:
            await self._task
        logger.info("[TTS] Session stopped.")

    # ── Text cleaning ─────────────────────────────────────────────────────────

    def _clean_text(self, text: str) -> str:
        """
        Strip everything that sounds wrong when spoken aloud.
        Run BEFORE splitting so the full text is cleaned first.
        """
        # Markdown formatting
        text = re.sub(r'\*{1,3}(.*?)\*{1,3}', r'\1', text)
        text = re.sub(r'_{1,2}(.*?)_{1,2}',   r'\1', text)
        text = re.sub(r'`{1,3}.*?`{1,3}',     '',    text)
        text = re.sub(r'#+\s*',               '',    text)
        text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
        text = re.sub(r'!\[.*?\]\(.*?\)',      '',    text)

        # Bullet points and list markers
        text = re.sub(r'^\s*[-•*]\s+', '', text, flags=re.MULTILINE)
        text = re.sub(r'^\s*\d+[.)]\s+', '', text, flags=re.MULTILINE)

        # Symbols → spoken form
        text = re.sub(r'\$(\d+)',        r'\1 dollars', text)
        text = re.sub(r'(\d+)%',         r'\1 percent', text)
        text = re.sub(r'(\d+)\.(\d+)',   r'\1 point \2', text)
        text = re.sub(r'&',              ' and ',  text)
        text = re.sub(r'@',              ' at ',   text)
        text = re.sub(r'#(\w+)',         r'\1',    text)

        # Newlines and excess whitespace
        text = re.sub(r'\n+',    ' ', text)
        text = re.sub(r'\s{2,}', ' ', text)

        # Remove remaining unpronounceable characters
        text = re.sub(r"[^\w\s.,!?;:'\"-]", '', text)

        return text.strip()

    # ── Text splitting ────────────────────────────────────────────────────────

    def _split_text(self, text: str) -> list[str]:
        """
        Split into chunks under MAX_CHARS on sentence boundaries.
        Smaller chunks = faster first audio delivery to the user.
        """
        if len(text) <= self.MAX_CHARS:
            return [text]

        chunks  = []
        current = ""

        for sentence in re.split(r'(?<=[.!?])\s+', text):
            if len(current) + len(sentence) + 1 <= self.MAX_CHARS:
                current = f"{current} {sentence}".strip()
            else:
                if current:
                    chunks.append(current)
                if len(sentence) > self.MAX_CHARS:
                    current = ""
                    for part in re.split(r'(?<=,)\s+', sentence):
                        if len(current) + len(part) + 1 <= self.MAX_CHARS:
                            current = f"{current} {part}".strip()
                        else:
                            if current:
                                chunks.append(current)
                            current = part
                else:
                    current = sentence

        if current:
            chunks.append(current)

        logger.debug(f"[TTS] Split {len(text)} chars → {len(chunks)} chunks")
        return chunks

    # ── Background loop ───────────────────────────────────────────────────────

    async def _loop(self) -> None:
        """Drain the input queue and synthesise each chunk off the event loop."""
        loop = asyncio.get_running_loop()
        while True:
            text = await self._in_q.get()
            if text is None:
                self._out_q.put_nowait(None)
                return
            audio = await loop.run_in_executor(None, self._synthesize, text)
            if audio:
                logger.info(f"[TTS] ✔ {len(text)} chars → {len(audio)} bytes")
                self._out_q.put_nowait(audio)

    # ── clear ─────────────────────────────────────────────────────────────

    def clear(self) -> None:
        """
        Flush all pending TTS chunks immediately.
        Called on barge-in — user interrupted, discard queued audio.
        """
        # Drain the input queue
        while not self._in_q.empty():
            try:
                self._in_q.get_nowait()
            except asyncio.QueueEmpty:
                break

        # Drain the output queue
        while not self._out_q.empty():
            try:
                self._out_q.get_nowait()
            except asyncio.QueueEmpty:
                break

    logger.info("[TTS] Queue cleared — barge-in")

    # ── Synthesis ─────────────────────────────────────────────────────────────

    def _synthesize(self, text: str) -> bytes:
        """
        Blocking — always called via run_in_executor, never on the event loop.

        Pipeline:
          text → MMS TTS (float32 audio + sampling_rate)
               → squeeze + clip → int16 → WAV bytes
        """
        try:
            pipe    = self._load_pipeline()
            outputs = pipe(text)

            audio_f32     = np.squeeze(outputs["audio"]).astype(np.float32)
            audio_f32     = np.clip(audio_f32, -1.0, 1.0)
            sampling_rate = int(outputs["sampling_rate"])
            audio_int16   = (audio_f32 * 32767).astype(np.int16)

            return self._to_wav(audio_int16, sampling_rate)

        except Exception as e:
            logger.error(f"[TTS ERROR] {type(e).__name__}: {e}")
            return b""

    def _to_wav(self, audio_int16: np.ndarray, sampling_rate: int) -> bytes:
        """Wrap raw int16 PCM samples in a WAV container and return bytes."""
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(self.CHANNELS)
            wf.setsampwidth(self.SAMPLE_WIDTH)
            wf.setframerate(sampling_rate)
            wf.writeframes(audio_int16.tobytes())
        return buf.getvalue()

    # ── Model loading ─────────────────────────────────────────────────────────

    @classmethod
    def _load_pipeline(cls):
        """Lazy-load one shared HF pipeline for all TTSSession instances."""
        if cls._shared_pipeline is None:
            device = 0 if torch.cuda.is_available() else -1

            cls._shared_pipeline = hf_pipeline(
                "text-to-speech",
                model=cls.MODEL_ID,
                device=device,
                # ✅ float16 on CUDA — halves memory, ~2x faster inference
                torch_dtype=torch.float16 if device == 0 else torch.float32,
            )

            # ✅ Warm up — first inference on CUDA always slow due to kernel
            # compilation. Run a dummy pass so the real first request is fast.
            if device == 0:
                logger.info("[TTS] Warming up CUDA kernels...")
                cls._shared_pipeline("warming up")
                logger.info("[TTS] Warm-up complete.")

            logger.info(
                f"[TTS] Pipeline loaded  model={cls.MODEL_ID}"
                f"  device={'cuda:float16' if device == 0 else 'cpu:float32'}"
            )
        return cls._shared_pipeline