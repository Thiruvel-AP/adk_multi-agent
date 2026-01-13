/**
 * Audio Playback Service
 * Handles incoming audio from backend and playback
 */

class AudioService {
  constructor() {
    this.audioContext = null;
    this.audioQueue = [];
    this.isPlaying = false;
    this.currentSource = null;
    this.gainNode = null;
    this.volume = 1.0;
    
    // Audio configuration (should match backend TTS output)
    this.sampleRate = 24000; // Google TTS typically outputs at 24kHz
    this.channelCount = 1;
  }

  /**
   * Initialize the audio context for playback
   */
  async init() {
    if (this.audioContext) return;

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: this.sampleRate
    });

    // Create gain node for volume control
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = this.volume;
    this.gainNode.connect(this.audioContext.destination);

    // Resume if suspended
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    console.log('[Audio] Playback initialized at', this.audioContext.sampleRate, 'Hz');
  }

  /**
   * Queue and play audio chunk from backend
   * @param {ArrayBuffer} audioData - Audio data (PCM or encoded)
   */
  async playAudioChunk(audioData) {
    if (!this.audioContext) {
      await this.init();
    }

    try {
      // Try to decode as encoded audio (MP3, WAV, etc.)
      let audioBuffer;
      try {
        audioBuffer = await this.audioContext.decodeAudioData(audioData.slice(0));
      } catch (e) {
        // If decoding fails, assume raw PCM 16-bit
        audioBuffer = this._pcmToAudioBuffer(audioData);
      }

      this.audioQueue.push(audioBuffer);
      
      if (!this.isPlaying) {
        this._playNext();
      }
    } catch (error) {
      console.error('[Audio] Failed to play audio:', error);
    }
  }

  /**
   * Convert PCM 16-bit data to AudioBuffer
   * @private
   */
  _pcmToAudioBuffer(pcmData) {
    const view = new DataView(pcmData);
    const numSamples = pcmData.byteLength / 2;
    const audioBuffer = this.audioContext.createBuffer(
      this.channelCount,
      numSamples,
      this.sampleRate
    );
    
    const channelData = audioBuffer.getChannelData(0);
    
    for (let i = 0; i < numSamples; i++) {
      // Convert 16-bit signed integer to float (-1 to 1)
      const sample = view.getInt16(i * 2, true);
      channelData[i] = sample / 32768;
    }
    
    return audioBuffer;
  }

  /**
   * Play next audio buffer in queue
   * @private
   */
  _playNext() {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const audioBuffer = this.audioQueue.shift();
    
    this.currentSource = this.audioContext.createBufferSource();
    this.currentSource.buffer = audioBuffer;
    this.currentSource.connect(this.gainNode);
    
    this.currentSource.onended = () => {
      this._playNext();
    };
    
    this.currentSource.start(0);
  }

  /**
   * Stop all audio playback
   */
  stop() {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      this.currentSource = null;
    }
    
    this.audioQueue = [];
    this.isPlaying = false;
    console.log('[Audio] Playback stopped');
  }

  /**
   * Set playback volume
   * @param {number} volume - Volume level (0.0 to 1.0)
   */
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
  }

  /**
   * Get current volume level
   * @returns {number} Current volume (0.0 to 1.0)
   */
  getVolume() {
    return this.volume;
  }

  /**
   * Check if audio is currently playing
   * @returns {boolean} Playing status
   */
  isAudioPlaying() {
    return this.isPlaying;
  }

  /**
   * Resume audio context if suspended (required after user interaction)
   */
  async resume() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.stop();
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.gainNode = null;
    console.log('[Audio] Resources disposed');
  }
}

// Create singleton instance
const audioService = new AudioService();

export { AudioService };
export default audioService;
