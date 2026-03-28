class AudioService {
  constructor() {
    this.audioContext  = null;
    this.audioQueue    = [];
    this.isPlaying     = false;
    this.currentSource = null;
    this.gainNode      = null;
    this.volume        = 1.0;
    this.sampleRate    = 16000;
    this.channelCount  = 1;

    // Callback fired when audio queue empties — used for agentStop event
    this.onQueueEmpty  = null;
  }

  async init() {
    if (this.audioContext) return;

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: this.sampleRate,
    });

    this.gainNode            = this.audioContext.createGain();
    this.gainNode.gain.value = this.volume;
    this.gainNode.connect(this.audioContext.destination);

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    console.log('[AudioService] Initialized at', this.audioContext.sampleRate, 'Hz');
  }

  async playAudioChunk(audioData) {
    if (!this.audioContext) await this.init();

    try {
      let audioBuffer;
      try {
        audioBuffer = await this.audioContext.decodeAudioData(audioData.slice(0));
      } catch {
        audioBuffer = this._pcmToAudioBuffer(audioData);
      }

      this.audioQueue.push(audioBuffer);
      if (!this.isPlaying) this._playNext();

    } catch (err) {
      console.error('[AudioService] Playback error:', err);
    }
  }

  _playNext() {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      //  Queue is empty — agent finished speaking
      if (this.onQueueEmpty) this.onQueueEmpty();
      return;
    }

    this.isPlaying            = true;
    const audioBuffer         = this.audioQueue.shift();
    this.currentSource        = this.audioContext.createBufferSource();
    this.currentSource.buffer = audioBuffer;
    this.currentSource.connect(this.gainNode);
    this.currentSource.onended = () => this._playNext();
    this.currentSource.start(0);
  }

  _pcmToAudioBuffer(pcmData) {
    const view        = new DataView(pcmData);
    const numSamples  = pcmData.byteLength / 2;
    const audioBuffer = this.audioContext.createBuffer(
      this.channelCount, numSamples, this.sampleRate
    );
    const ch = audioBuffer.getChannelData(0);
    for (let i = 0; i < numSamples; i++) {
      ch[i] = view.getInt16(i * 2, true) / 32768;
    }
    return audioBuffer;
  }

  //  stop() clears queue AND resets isPlaying — safe to call on barge-in
  stop() {
    try { this.currentSource?.stop(); } catch { /* already stopped */ }
    this.currentSource = null;
    this.audioQueue    = [];
    this.isPlaying     = false;
    if (this.onQueueEmpty) this.onQueueEmpty();
    console.log('[AudioService] Stopped');
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.gainNode) this.gainNode.gain.value = this.volume;
  }

  getVolume()      { return this.volume; }
  isAudioPlaying() { return this.isPlaying; }

  async resume() {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  dispose() {
    this.stop();
    this.audioContext?.close();
    this.audioContext = null;
    this.gainNode     = null;
    console.log('[AudioService] Disposed');
  }
}

const audioService = new AudioService();
export { AudioService };
export default audioService;