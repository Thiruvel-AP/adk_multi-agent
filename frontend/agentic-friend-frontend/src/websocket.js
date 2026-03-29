import { retrieve_session_id, retrieve_user_id } from './SessionStore';
import audioService from './audio';

class WebSocketService {
  constructor() {
    this.socket               = null;
    this.isConnected          = false;
    this.reconnectAttempts    = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay       = 1000;
    this.listeners = {
      open:         [],
      close:[],
      message:      [],
      error:        [],
      statusChange: [],
      speechEnd:[],
      speechStart:  [],   // user started speaking → UI shows mic wave
      agentStart:[],   // agent started speaking → UI shows agent wave
      agentStop:[],   // agent stopped speaking → UI stops agent wave
    };

    this._audioContext = null;
    this._workletNode  = null;
    this._micSource    = null;
    this._stream       = null; // ✅ Fix: Store stream reliably for stopping
    this._isCapturing  = false;
  }

  // ═══════════════════════════════════════════════════════════
  // WebSocket
  // ═══════════════════════════════════════════════════════════

  connect() {
    return new Promise((resolve, reject) => {
      const storedId = retrieve_session_id();
      const userID   = retrieve_user_id();

      if (!storedId || !userID) {
        const msg = `[WebSocket] Missing ${!storedId ? 'Session ID' : 'User ID'}`;
        console.error(msg);
        this._emit('error', msg);
        return reject(new Error(msg));
      }

      // ✅ Fix: Use env variable fallback so it doesn't break in production
      const wsBase = process.env.REACT_APP_WS_URL || 'ws://localhost:8000';
      const url = `${wsBase}/voice?session_id=${storedId}&user_id=${userID}`;

      if (this.socket &&
         (this.socket.readyState === WebSocket.OPEN ||
          this.socket.readyState === WebSocket.CONNECTING)) {
        return resolve(true);
      }

      try {
        this.socket            = new WebSocket(url);
        this.socket.binaryType = 'arraybuffer';

        this.socket.onopen = () => {
          console.log('[WebSocket] Connected');
          this.isConnected       = true;
          this.reconnectAttempts = 0;
          this.sendMessage({ type: "config", format: "int16", language: "en" });
          this._emit('open');
          this._emit('statusChange', 'connected');
          resolve(true);
        };

        this.socket.onclose = (e) => {
          console.log('[WebSocket] Closed', e.code, e.reason);
          this.isConnected = false;
          this._emit('close', e);
          this._emit('statusChange', 'disconnected');
          this._emit('agentStop');
        };

        this.socket.onmessage = (e) => {
          if (e.data instanceof ArrayBuffer) {
            this._emit('agentStart');
            audioService.playAudioChunk(e.data).then(() => {
              // agentStop fires when the queue empties (handled in AudioService)
            });
          } else {
            this._emit('message', e.data);
          }
        };

        this.socket.onerror = (e) => {
          console.error('[WebSocket] Error:', e);
          this._emit('error', e);
          this._emit('statusChange', 'error');
          reject(e);
        };

      } catch (e) {
        console.error('[WebSocket] Failed to create connection:', e);
        reject(e);
      }
    });
  }

  disconnect() {
    this.stopAudio();
    if (this.socket) {
      this.socket.close(1000, 'Client disconnecting');
      this.socket      = null;
      this.isConnected = false;
      this._emit('statusChange', 'disconnected');
    }
  }

  async reconnect() {
    console.log('[WebSocket] Reconnecting...');
    this._emit('statusChange', 'connecting');
    this.disconnect();
    await new Promise(r => setTimeout(r, 500));
    try {
      await this.connect();
      return true;
    } catch (e) {
      console.error('[WebSocket] Reconnection failed:', e);
      return false;
    }
  }

  sendAudioChunk(audioData) {
    if (!this.isConnected || !this.socket) return false;
    try {
      this.socket.send(audioData);
      return true;
    } catch (e) {
      console.error('[WebSocket] Failed to send audio:', e);
      return false;
    }
  }

  sendMessage(message) {
    if (!this.isConnected || !this.socket) return false;
    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch (e) {
      console.error('[WebSocket] Failed to send message:', e);
      return false;
    }
  }

  on(event, callback) {
    if (this.listeners[event]) this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (this.listeners[event])
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  _emit(event, data) {
    (this.listeners[event] ||[]).forEach(cb => {
      try { cb(data); }
      catch (e) { console.error(`[WebSocket] Listener error (${event}):`, e); }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // Audio capture — mic → filters → VAD worklet → WebSocket
  // ═══════════════════════════════════════════════════════════

  async startAudio() {
    if (this._isCapturing) {
      console.warn('[Audio] Already capturing');
      return;
    }
    if (!this.isConnected) {
      console.error('[Audio] WebSocket not connected');
      return;
    }

    try {
      // ✅ Fix: Save stream to a class variable
      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount:     1,
          sampleRate:       16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl:  true,
        },
      });

      this._audioContext = new AudioContext({ sampleRate: 16000 });
      this._micSource    = this._audioContext.createMediaStreamSource(this._stream);

      const highPass            = this._audioContext.createBiquadFilter();
      highPass.type             = 'highpass';
      highPass.frequency.value  = 80;

      const compressor           = this._audioContext.createDynamicsCompressor();
      compressor.threshold.value = -50;
      compressor.knee.value      = 40;
      compressor.ratio.value     = 12;
      compressor.attack.value    = 0.003;
      compressor.release.value   = 0.25;

      // ✅ Fix: Use PUBLIC_URL to ensure React can find the file in the public folder
      const workletUrl = (process.env.PUBLIC_URL || '') + '/audio-processor.worklet.js';
      await this._audioContext.audioWorklet.addModule(workletUrl);
      
      this._workletNode = new AudioWorkletNode(this._audioContext, 'pcm-processor');

      this._workletNode.port.onmessage = (e) => {
        if (e.data.type === 'audio') {
          this.sendAudioChunk(e.data.buffer);

        } else if (e.data.type === 'speech_start') {
          // Barge-in logic executes flawlessly here!
          audioService.stop();
          this._emit('agentStop');
          this._emit('speechStart');
          this.sendMessage({ type: 'barge_in' });

        } else if (e.data.type === 'speech_end') {
          console.log('[Audio] Speech end detected');
          this._emit('speechEnd');
        }
      };

      // Connect standard chain
      this._micSource
        .connect(highPass)
        .connect(compressor)
        .connect(this._workletNode);

      // ✅ Fix: Prevent Safari/Firefox from suspending the Worklet node
      const dummyGain = this._audioContext.createGain();
      dummyGain.gain.value = 0; // Muted
      this._workletNode.connect(dummyGain);
      dummyGain.connect(this._audioContext.destination);

      this._isCapturing = true;
      console.log('[Audio] Capture started at', this._audioContext.sampleRate, 'Hz');

    } catch (err) {
      console.error('[Audio] Failed to start capture:', err);
      throw err;
    }
  }

  async stopAudio() {
    if (!this._isCapturing) return;

    this._workletNode?.disconnect();
    this._micSource?.disconnect();
    
    // ✅ Fix: Reliable way to stop the hardware microphone
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }

    if (this._audioContext) {
      await this._audioContext.close();
      this._audioContext = null;
    }

    this._workletNode = null;
    this._micSource   = null;
    this._isCapturing = false;

    console.log('[Audio] Capture stopped');
  }

  get isCapturing() {
    return this._isCapturing;
  }
}

const websocketService = new WebSocketService();

export { WebSocketService };
export default websocketService;