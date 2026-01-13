/**
 * WebSocket Service for Voice Communication
 * Handles connection management, audio data transmission, and reconnection logic
 */
const web_url = 'ws://localhost:8000/ws'; 

class WebSocketService {
  constructor(url = web_url) {
    this.url = url;
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.listeners = {
      open: [],
      close: [],
      message: [],
      error: [],
      statusChange: []
    };
  }

  /**
   * Establish WebSocket connection
   * @returns {Promise<boolean>} Connection success status
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        resolve(true);
        return;
      }

      try {
        this.socket = new WebSocket(this.url);
        this.socket.binaryType = 'arraybuffer';

        this.socket.onopen = () => {
          console.log('[WebSocket] Connected to server');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this._emit('open');
          this._emit('statusChange', 'connected');
          resolve(true);
        };

        this.socket.onclose = (event) => {
          console.log('[WebSocket] Connection closed', event.code, event.reason);
          this.isConnected = false;
          this._emit('close', event);
          this._emit('statusChange', 'disconnected');
        };

        this.socket.onmessage = (event) => {
          this._emit('message', event.data);
        };

        this.socket.onerror = (error) => {
          console.error('[WebSocket] Error:', error);
          this._emit('error', error);
          this._emit('statusChange', 'error');
          reject(error);
        };

      } catch (error) {
        console.error('[WebSocket] Failed to create connection:', error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    if (this.socket) {
      this.socket.close(1000, 'Client disconnecting');
      this.socket = null;
      this.isConnected = false;
      this._emit('statusChange', 'disconnected');
    }
  }

  /**
   * Reconnect to the WebSocket server
   * @returns {Promise<boolean>} Reconnection success status
   */
  async reconnect() {
    console.log('[WebSocket] Attempting to reconnect...');
    this._emit('statusChange', 'connecting');
    this.disconnect();
    
    // Wait a brief moment before reconnecting
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      await this.connect();
      return true;
    } catch (error) {
      console.error('[WebSocket] Reconnection failed:', error);
      return false;
    }
  }

  /**
   * Attempt automatic reconnection with exponential backoff
   */
  async autoReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnection attempts reached');
      this._emit('statusChange', 'failed');
      return false;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this._emit('statusChange', 'reconnecting');
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      await this.connect();
      return true;
    } catch (error) {
      return this.autoReconnect();
    }
  }

  /**
   * Send audio data chunk to the server
   * @param {ArrayBuffer|Blob} audioData - Audio data to send
   */
  sendAudioChunk(audioData) {
    if (!this.isConnected || !this.socket) {
      console.warn('[WebSocket] Cannot send audio: not connected');
      return false;
    }

    try {
      this.socket.send(audioData);
      return true;
    } catch (error) {
      console.error('[WebSocket] Failed to send audio:', error);
      return false;
    }
  }

  /**
   * Send JSON message to the server
   * @param {Object} message - Message object to send
   */
  sendMessage(message) {
    if (!this.isConnected || !this.socket) {
      console.warn('[WebSocket] Cannot send message: not connected');
      return false;
    }

    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('[WebSocket] Failed to send message:', error);
      return false;
    }
  }

  /**
   * Register event listener
   * @param {string} event - Event name (open, close, message, error, statusChange)
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function to remove
   */
  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  /**
   * Emit event to all registered listeners
   * @private
   */
  _emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[WebSocket] Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Get current connection status
   * @returns {string} Connection status
   */
  getStatus() {
    if (!this.socket) return 'disconnected';
    switch (this.socket.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'disconnected';
      default: return 'unknown';
    }
  }
}

// Create singleton instance
const websocketService = new WebSocketService();

export { WebSocketService };
export default websocketService;
