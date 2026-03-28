import asyncio
import logging
import time
from typing import AsyncIterator, Optional

import numpy as np
import torch
from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)


class STTSession:

    # ── Config ────────────────────────────────────────────────────────────────

    SAMPLE_RATE        : int   = 16_000
    SILENCE_GATE       : float = 0.02    # amplitude below this = silent chunk
    SILENCE_CHUNKS     : int   = 5       # consecutive silent chunks → end of utterance
    PERIODIC_FLUSH_SEC : float = 2.0     # flush mid-speech every N seconds
    OVERLAP_SEC        : float = 0.1     # keep last N sec as context for next window
    MIN_SPEECH_SEC     : float = 0.3     # skip utterances shorter than this
    MAX_SPEECH_SEC     : float = 30.0    # hard cap — force flush
    SPEECH_TIMEOUT_SEC : float = 1.2     # no audio for this long → end of utterance

    _FMT_REGISTRY: dict[str, tuple] = {
        "int8":    (np.int8,    2 ** 7,   False),
        "int16":   (np.int16,   2 ** 15,  False),
        "int32":   (np.int32,   2 ** 31,  False),
        "int64":   (np.int64,   2 ** 63,  False),
        "uint8":   (np.uint8,   2 ** 7,   True),
        "uint16":  (np.uint16,  2 ** 15,  True),
        "float32": (np.float32, 1.0,      False),
        "float64": (np.float64, 1.0,      False),
    }

    _shared_model: Optional[WhisperModel] = None

    # ── Construction ──────────────────────────────────────────────────────────

    def __init__(self) -> None:
        self._fmt      = "auto"
        self._language = "en"

        self._buffer        : list[np.ndarray] = []
        self._silent_chunks : int              = 0
        self._speaking      : bool             = False
        self._last_flush_t  : float            = 0.0

        self._in_q:  asyncio.Queue[Optional[bytes]]              = asyncio.Queue()
        self._out_q: asyncio.Queue[Optional[tuple[str, bool]]]   = asyncio.Queue()
        self._task:  Optional[asyncio.Task]                      = None

    # ── Public API ────────────────────────────────────────────────────────────

    async def start(self) -> None:
        self._load_model()
        self._task = asyncio.create_task(self._loop(), name="stt-loop")
        logger.info(f"[STT] Session started  fmt={self._fmt}  lang={self._language}")

    def feed(self, raw: bytes) -> None:
        """Non-blocking. Call from WebSocket receive handler."""
        if raw:
            self._in_q.put_nowait(raw)

    def set_format(self, fmt: str) -> None:
        assert fmt in self._FMT_REGISTRY or fmt == "auto", f"Unknown fmt: {fmt!r}"
        self._fmt = fmt
        logger.info(f"[STT] Format set to {fmt}")

    async def transcriptions(self) -> AsyncIterator[tuple[str, bool]]:
        """
        Yields (text, is_final) tuples.
        is_final=False → partial mid-speech flush   (buffer in caller)
        is_final=True  → silence/timeout flush      (send to ADK)
        """
        while True:
            item = await self._out_q.get()
            if item is None:
                return
            yield item

    async def stop(self) -> None:
        self._in_q.put_nowait(None)
        if self._task:
            await self._task
        logger.info("[STT] Session stopped.")

    # ── Format conversion ─────────────────────────────────────────────────────

    def _to_float32(self, raw: bytes) -> np.ndarray:
        fmt = self._fmt if self._fmt != "auto" else self._infer_fmt(raw)
        dtype, scale, unsigned = self._FMT_REGISTRY[fmt]
        arr = np.frombuffer(raw, dtype=dtype).astype(np.float32)
        if unsigned:
            arr -= float(scale)
        arr /= float(scale)
        return np.clip(arr, -1.0, 1.0)

    def _infer_fmt(self, raw: bytes) -> str:
        n = len(raw)
        for nbytes, fmt in ((4, "float32"), (8, "float64")):
            if n % nbytes == 0:
                arr = np.frombuffer(raw, dtype=self._FMT_REGISTRY[fmt][0])
                if bool(np.isfinite(arr).all()) and float(np.abs(arr).max()) <= 2.0:
                    return fmt
        for nbytes, fmt in ((8, "int64"), (4, "int32"), (2, "int16"), (1, "int8")):
            if n % nbytes == 0:
                return fmt
        return "int16"

    # ── VAD helpers ───────────────────────────────────────────────────────────

    def _vad_reset(self, keep_overlap: bool = False) -> None:
        if keep_overlap and self._buffer:
            overlap_samples = int(self.OVERLAP_SEC * self.SAMPLE_RATE)
            all_audio       = np.concatenate(self._buffer)
            self._buffer    = [all_audio[-overlap_samples:]]
        else:
            self._buffer = []
        self._silent_chunks = 0
        self._last_flush_t  = time.monotonic()

    def _total_samples(self) -> int:
        return sum(len(c) for c in self._buffer)

    def _seconds_since_flush(self) -> float:
        return time.monotonic() - self._last_flush_t

    # ── Background loop ───────────────────────────────────────────────────────

    async def _loop(self) -> None:
        loop = asyncio.get_running_loop()

        while True:
            try:
                raw = await asyncio.wait_for(
                    self._in_q.get(),
                    timeout=self.SPEECH_TIMEOUT_SEC
                )
            except asyncio.TimeoutError:
                if self._speaking:
                    logger.debug("[STT] Timeout → flushing as final")
                    await self._flush(loop, mode="final")
                continue

            if raw is None:
                # Fixed: was force=True which doesn't exist as a kwarg
                await self._flush(loop, mode="final")
                self._out_q.put_nowait(None)
                return

            samples = self._to_float32(raw)
            await self._ingest(samples, loop)

    # ── VAD state machine ─────────────────────────────────────────────────────

    async def _ingest(self, chunk: np.ndarray, loop: asyncio.AbstractEventLoop) -> None:
        silent = float(np.max(np.abs(chunk))) < self.SILENCE_GATE

        if not silent:
            self._buffer.append(chunk)
            self._silent_chunks = 0
            self._speaking      = True

            if self._seconds_since_flush() >= self.PERIODIC_FLUSH_SEC:
                logger.debug("[STT] Periodic flush")
                await self._flush(loop, mode="partial")

            elif self._total_samples() >= int(self.MAX_SPEECH_SEC * self.SAMPLE_RATE):
                logger.debug("[STT] Max duration flush")
                await self._flush(loop, mode="partial")

        elif self._speaking:
            self._buffer.append(chunk)
            self._silent_chunks += 1

            if self._silent_chunks >= self.SILENCE_CHUNKS:
                logger.debug("[STT] Silence flush")
                await self._flush(loop, mode="final")

    # ── Flush ─────────────────────────────────────────────────────────────────

    async def _flush(self, loop: asyncio.AbstractEventLoop, *, mode: str) -> None:
        if not self._buffer:
            return

        if mode == "final":
            trim          = min(self._silent_chunks, len(self._buffer))
            speech_chunks = self._buffer[:-trim] if trim < len(self._buffer) else self._buffer[:]
        else:
            speech_chunks = self._buffer[:]

        self._vad_reset(keep_overlap=(mode == "partial"))

        if mode == "final":
            self._speaking = False

        utterance   = np.concatenate(speech_chunks)
        min_samples = int(self.MIN_SPEECH_SEC * self.SAMPLE_RATE)

        if len(utterance) < min_samples:
            logger.debug(f"[STT] Too short ({len(utterance)} samples) — skipped")
            return

        logger.debug(f"[STT] Transcribing {len(utterance) / self.SAMPLE_RATE:.2f}s  mode={mode}")
        text = await loop.run_in_executor(None, self._transcribe, utterance)

        if text:
            is_final = (mode == "final")
            logger.info(f"[STT] ✔ [{'final' if is_final else 'partial'}] {text}")
            self._out_q.put_nowait((text, is_final))

    # ── Whisper ───────────────────────────────────────────────────────────────

    def _transcribe(self, audio: np.ndarray) -> str:
        segments, _ = self._load_model().transcribe(
            audio,
            language=self._language,
            beam_size=5,
            vad_filter=False,   
        )
        result = []
        for seg in segments:
            #  no_speech_prob > 0.6 = Whisper is not confident this is speech
            if seg.no_speech_prob > 0.6:
                logger.debug(f"[STT] Skipping low-confidence segment (no_speech={seg.no_speech_prob:.2f}): {seg.text!r}")
                continue
            result.append(seg.text.strip())

        return " ".join(result).strip()

    @classmethod
    def _load_model(cls) -> WhisperModel:
        if cls._shared_model is None:
            device       = "cuda" if torch.cuda.is_available() else "cpu"
            compute_type = "float16" if device == "cuda" else "int8"
            cls._shared_model = WhisperModel(
                "base.en", device=device, compute_type=compute_type
            )
            logger.info(f"[STT] Whisper loaded  device={device}  compute={compute_type}")
        return cls._shared_model