/**
 * AudioWorklet processor — VAD + Int16 conversion
 *
 * Pipeline inside the audio thread:
 *   Float32 samples
 *     → ring buffer (4096 samples = 256ms @ 16kHz)
 *     → VAD gate    (amplitude threshold)
 *     → Int16       (50% smaller payload)
 *     → postMessage (transfer, zero-copy)
 *
 * Only sends chunks when voice is detected.
 * Sends a trailing silence chunk so the backend
 * knows the utterance has ended.
 */
class PCMProcessor extends AudioWorkletProcessor {

  // ── Config ──────────────────────────────────────────────────
  static CHUNK_SIZE     = 4096;   // samples per chunk  (256ms @ 16kHz)
  static SILENCE_GATE   = 0.02;   // peak amplitude below this = silent
  static SILENCE_CHUNKS = 8;      // consecutive silent chunks → end of utterance

  constructor() {
    super();
    this._buffer      = new Float32Array(PCMProcessor.CHUNK_SIZE);
    this._writeOffset = 0;

    // VAD state
    this._silentChunks = 0;
    this._speaking     = false;
  }

  process(inputs) {
    const channel = inputs?.[0]?.[0];
    if (!channel) return true;

    // Accumulate 128-sample render quanta into 4096-sample chunks
    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._writeOffset++] = channel[i];

      if (this._writeOffset === PCMProcessor.CHUNK_SIZE) {
        this._onChunkReady();
        this._buffer      = new Float32Array(PCMProcessor.CHUNK_SIZE);
        this._writeOffset = 0;
      }
    }

    return true;
  }

  _onChunkReady() {
    // ── VAD: measure peak amplitude ──────────────────────────
    let peak = 0;
    for (let i = 0; i < this._buffer.length; i++) {
      const abs = Math.abs(this._buffer[i]);
      if (abs > peak) peak = abs;
    }

    const silent = peak < PCMProcessor.SILENCE_GATE;

    if (!silent) {
      // Voice detected — reset silence counter and start speaking
      this._silentChunks = 0;
      this._speaking     = true;
      this._send(this._buffer);

    } else if (this._speaking) {
      // Trailing silence — count it
      this._silentChunks++;

      if (this._silentChunks <= PCMProcessor.SILENCE_CHUNKS) {
        // Still within trailing silence window — keep sending
        // so backend VAD sees a clean silence boundary
        this._send(this._buffer);
      } else {
        // Silence confirmed — stop sending, reset state
        this._speaking     = false;
        this._silentChunks = 0;
        // Notify main thread that utterance ended
        this.port.postMessage({ type: "speech_end" });
      }
    }
    // If not speaking and silent — discard chunk (do nothing)
  }

  /**
   * Convert Float32 → Int16 and transfer to main thread (zero-copy).
   * Int16 is half the size of Float32 — saves 50% bandwidth.
   */
  _send(float32Chunk) {
    const int16 = new Int16Array(float32Chunk.length);
    for (let i = 0; i < float32Chunk.length; i++) {
      // Clamp to [-1, 1] then scale to int16 range
      const clamped = Math.max(-1, Math.min(1, float32Chunk[i]));
      int16[i]      = clamped * 32767;
    }
    this.port.postMessage(
      { type: "audio", buffer: int16.buffer },
      [int16.buffer]   // transfer ownership — zero-copy
    );
  }
}

registerProcessor("pcm-processor", PCMProcessor);