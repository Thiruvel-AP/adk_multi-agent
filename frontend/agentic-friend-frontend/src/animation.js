/**
 * Animation Service
 * Handles audio visualization and status animations
 */

class AnimationService {
  constructor() {
    this.canvas = null;
    this.canvasCtx = null;
    this.analyser = null;
    this.animationId = null;
    this.isAnimating = false;
    
    // Animation settings
    this.barWidth = 3;
    this.barGap = 2;
    this.barColor = '#6366f1';
    this.barColorActive = '#818cf8';
    this.backgroundColor = 'transparent';
  }

  /**
   * Initialize visualization with canvas element
   * @param {HTMLCanvasElement} canvas - Canvas element for drawing
   * @param {AnalyserNode} analyser - Web Audio API analyser node
   */
  init(canvas, analyser) {
    this.canvas = canvas;
    this.canvasCtx = canvas.getContext('2d');
    this.analyser = analyser;
    
    // Set canvas size
    this._resizeCanvas();
    
    // Handle window resize
    window.addEventListener('resize', () => this._resizeCanvas());
    
    console.log('[Animation] Initialized');
  }

  /**
   * Resize canvas to match container
   * @private
   */
  _resizeCanvas() {
    if (!this.canvas) return;
    
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    }
  }

  /**
   * Start audio visualization
   */
  startVisualization() {
    if (this.isAnimating || !this.analyser) return;
    
    this.isAnimating = true;
    this._animate();
    console.log('[Animation] Visualization started');
  }

  /**
   * Stop audio visualization
   */
  stopVisualization() {
    this.isAnimating = false;
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    // Clear canvas
    if (this.canvasCtx && this.canvas) {
      this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    console.log('[Animation] Visualization stopped');
  }

  /**
   * Animation loop for waveform/bars visualization
   * @private
   */
  _animate() {
    if (!this.isAnimating) return;
    
    this.animationId = requestAnimationFrame(() => this._animate());
    
    if (!this.analyser || !this.canvasCtx || !this.canvas) return;
    
    // Get frequency data
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);
    
    // Clear canvas
    this.canvasCtx.fillStyle = this.backgroundColor;
    this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw bars
    this._drawBars(dataArray, bufferLength);
  }

  /**
   * Draw frequency bars visualization
   * @private
   */
  _drawBars(dataArray, bufferLength) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerY = height / 2;
    
    // Calculate number of bars that fit
    const numBars = Math.min(64, Math.floor(width / (this.barWidth + this.barGap)));
    const step = Math.floor(bufferLength / numBars);
    
    // Start drawing from center
    const totalWidth = numBars * (this.barWidth + this.barGap) - this.barGap;
    let x = (width - totalWidth) / 2;
    
    for (let i = 0; i < numBars; i++) {
      // Average a range of frequencies for each bar
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += dataArray[i * step + j];
      }
      const average = sum / step;
      
      // Scale bar height
      const barHeight = (average / 255) * (height * 0.8);
      const minHeight = 4;
      const actualHeight = Math.max(minHeight, barHeight);
      
      // Create gradient for bar
      const gradient = this.canvasCtx.createLinearGradient(
        x, centerY - actualHeight / 2,
        x, centerY + actualHeight / 2
      );
      gradient.addColorStop(0, this.barColorActive);
      gradient.addColorStop(0.5, this.barColor);
      gradient.addColorStop(1, this.barColorActive);
      
      // Draw bar centered vertically
      this.canvasCtx.fillStyle = gradient;
      this.canvasCtx.beginPath();
      this.canvasCtx.roundRect(
        x,
        centerY - actualHeight / 2,
        this.barWidth,
        actualHeight,
        this.barWidth / 2
      );
      this.canvasCtx.fill();
      
      x += this.barWidth + this.barGap;
    }
  }

  /**
   * Draw idle animation (pulsing circles)
   * @param {number} level - Voice activity level (0-100)
   */
  drawIdleAnimation(level = 0) {
    if (!this.canvasCtx || !this.canvas) return;
    
    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Clear canvas
    this.canvasCtx.clearRect(0, 0, width, height);
    
    // Draw pulsing circles
    const baseRadius = 30;
    const maxRadius = 60;
    const radius = baseRadius + (level / 100) * (maxRadius - baseRadius);
    
    // Outer glow
    const gradient = this.canvasCtx.createRadialGradient(
      centerX, centerY, radius * 0.5,
      centerX, centerY, radius * 1.5
    );
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.3)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');
    
    this.canvasCtx.fillStyle = gradient;
    this.canvasCtx.beginPath();
    this.canvasCtx.arc(centerX, centerY, radius * 1.5, 0, Math.PI * 2);
    this.canvasCtx.fill();
    
    // Main circle
    this.canvasCtx.fillStyle = '#6366f1';
    this.canvasCtx.beginPath();
    this.canvasCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.canvasCtx.fill();
    
    // Inner highlight
    this.canvasCtx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    this.canvasCtx.beginPath();
    this.canvasCtx.arc(centerX - radius * 0.3, centerY - radius * 0.3, radius * 0.3, 0, Math.PI * 2);
    this.canvasCtx.fill();
  }

  /**
   * Set bar color scheme
   * @param {string} primary - Primary bar color
   * @param {string} active - Active/highlighted color
   */
  setColors(primary, active) {
    this.barColor = primary;
    this.barColorActive = active;
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.stopVisualization();
    window.removeEventListener('resize', this._resizeCanvas);
    this.canvas = null;
    this.canvasCtx = null;
    this.analyser = null;
    console.log('[Animation] Resources disposed');
  }
}

// Create singleton instance
const animationService = new AnimationService();

export { AnimationService };
export default animationService;
