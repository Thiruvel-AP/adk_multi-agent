/**
 * Microphone Service with Audio Enhancement
 * Handles microphone permissions, audio capture, and voice processing
 */

class MicrophoneService {
  constructor() {
    this.stream = null;
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.processor = null;
    this.isRecording = false;
    this.permissionGranted = false;
    this.onAudioDataCallback = null;
    this.onVoiceActivityCallback = null;
    
    // Audio configuration for Google STT compatibility
    this.sampleRate = 16000;
    this.channelCount = 1;
    this.bufferSize = 4096;
  }

  /**
   * Request microphone permission from user
   * Triggers native browser permission popup
   * @returns {Promise<boolean>} Permission granted status
   */
  async requestMicPermission() {
    try {
      console.log('[Mic] Requesting microphone permission...');
      
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: this.sampleRate,
          channelCount: this.channelCount
        }
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.permissionGranted = true;
      console.log('[Mic] Microphone permission granted');
      
      // Initialize audio context
      await this._initAudioContext();
      
      return true;
    } catch (error) {
      console.error('[Mic] Permission denied or error:', error);
      this.permissionGranted = false;
      
      if (error.name === 'NotAllowedError') {
        throw new Error('Microphone permission denied by user');
      } else if (error.name === 'NotFoundError') {
        throw new Error('No microphone found on this device');
      } else {
        throw error;
      }
    }
  }

  /**
   * Initialize Web Audio API context and nodes
   * @private
   */
  async _initAudioContext() {
    // Create audio context with target sample rate
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: this.sampleRate
    });

    // Resume context if suspended (required by some browsers)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Create analyser for voice activity detection
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    // Connect stream to audio context
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.source.connect(this.analyser);

    console.log('[Mic] Audio context initialized at', this.audioContext.sampleRate, 'Hz');
  }

  /**
   * Start recording and processing audio
   * @param {Function} onAudioData - Callback for audio data chunks
   * @param {Function} onVoiceActivity - Callback for voice activity level
   */
  startRecording(onAudioData, onVoiceActivity) {
    if (!this.permissionGranted || !this.stream) {
      console.error('[Mic] Cannot start recording: permission not granted');
      return false;
    }

    if (this.isRecording) {
      console.warn('[Mic] Already recording');
      return true;
    }

    this.onAudioDataCallback = onAudioData;
    this.onVoiceActivityCallback = onVoiceActivity;

    // Create ScriptProcessor for audio processing
    // Note: ScriptProcessor is deprecated but AudioWorklet requires HTTPS
    this.processor = this.audioContext.createScriptProcessor(
      this.bufferSize,
      this.channelCount,
      this.channelCount
    );

    this.processor.onaudioprocess = (event) => {
      if (!this.isRecording) return;

      const inputData = event.inputBuffer.getChannelData(0);
      
      // Convert Float32 to Int16 PCM
      const pcmData = this._floatTo16BitPCM(inputData);
      
      // Send audio data via callback
      if (this.onAudioDataCallback) {
        this.onAudioDataCallback(pcmData);
      }

      // Calculate voice activity level
      if (this.onVoiceActivityCallback) {
        const level = this._calculateVoiceLevel(inputData);
        this.onVoiceActivityCallback(level);
      }
    };

    // Connect processor to destination (required for processing to work)
    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

    this.isRecording = true;
    console.log('[Mic] Recording started');
    return true;
  }

  /**
   * Stop recording audio
   */
  stopRecording() {
    if (!this.isRecording) return;

    this.isRecording = false;

    if (this.processor) {
      this.processor.disconnect();
      this.source.disconnect(this.processor);
      this.processor = null;
    }

    console.log('[Mic] Recording stopped');
  }

  /**
   * Convert Float32 audio data to 16-bit PCM
   * @private
   */
  _floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp values between -1 and 1
      let sample = Math.max(-1, Math.min(1, float32Array[i]));
      // Convert to 16-bit signed integer
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(i * 2, sample, true); // little-endian
    }
    
    return buffer;
  }

  /**
   * Calculate voice activity level from audio data
   * @private
   */
  _calculateVoiceLevel(audioData) {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    const rms = Math.sqrt(sum / audioData.length);
    // Normalize to 0-100 scale
    return Math.min(100, Math.round(rms * 500));
  }

  /**
   * Get frequency data for visualization
   * @returns {Uint8Array} Frequency data array
   */
  getFrequencyData() {
    if (!this.analyser) return new Uint8Array(0);
    
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  /**
   * Get time domain data for waveform visualization
   * @returns {Uint8Array} Time domain data array
   */
  getTimeDomainData() {
    if (!this.analyser) return new Uint8Array(0);
    
    const dataArray = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(dataArray);
    return dataArray;
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.stopRecording();

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.permissionGranted = false;
    console.log('[Mic] Resources disposed');
  }

  /**
   * Check if microphone permission is granted
   * @returns {boolean} Permission status
   */
  hasPermission() {
    return this.permissionGranted;
  }

  /**
   * Get the analyser node for external visualization
   * @returns {AnalyserNode|null}
   */
  getAnalyser() {
    return this.analyser;
  }
}

// Create singleton instance
const microphoneService = new MicrophoneService();

export { MicrophoneService };
export default microphoneService;
