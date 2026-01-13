import React, { useEffect, useState, useRef, useCallback } from 'react';
import './App.css';
import websocketService from './websocket';
import microphoneService from './mic';
import audioService from './audio';
import animationService from './animation';

function App() {
  // Connection state
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [micPermission, setMicPermission] = useState('pending');
  const [isListening, setIsListening] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [error, setError] = useState(null);
  
  // Refs
  const canvasRef = useRef(null);
  const isInitializedRef = useRef(false);

  /**
   * Handle incoming audio from backend
   */
  const handleIncomingAudio = useCallback((data) => {
    if (data instanceof ArrayBuffer) {
      audioService.playAudioChunk(data);
    }
  }, []);

  /**
   * Handle voice activity level updates
   */
  const handleVoiceActivity = useCallback((level) => {
    setVoiceLevel(level);
  }, []);

  /**
   * Handle audio data from microphone - send to backend
   */
  const handleAudioData = useCallback((audioData) => {
    websocketService.sendAudioChunk(audioData);
  }, []);

  /**
   * Initialize microphone and request permission
   */
  const initMicrophone = async () => {
    try {
      setMicPermission('requesting');
      await microphoneService.requestMicPermission();
      setMicPermission('granted');
      
      // Start recording after permission granted
      microphoneService.startRecording(handleAudioData, handleVoiceActivity);
      setIsListening(true);
      
      // Initialize visualization
      if (canvasRef.current && microphoneService.getAnalyser()) {
        animationService.init(canvasRef.current, microphoneService.getAnalyser());
        animationService.startVisualization();
      }
      
      return true;
    } catch (err) {
      console.error('[App] Mic initialization failed:', err);
      setMicPermission('denied');
      setError(err.message);
      return false;
    }
  };

  /**
   * Initialize WebSocket connection
   */
  const initWebSocket = async () => {
    try {
      setConnectionStatus('connecting');
      
      // Register event listeners
      websocketService.on('statusChange', (status) => {
        setConnectionStatus(status);
      });
      
      websocketService.on('message', handleIncomingAudio);
      
      await websocketService.connect();
      return true;
    } catch (err) {
      console.error('[App] WebSocket connection failed:', err);
      setError('Failed to connect to server');
      return false;
    }
  };

  /**
   * Reconnect session - close and re-establish connections
   */
  const handleReconnect = async () => {
    setError(null);
    
    // Stop current recording
    microphoneService.stopRecording();
    setIsListening(false);
    animationService.stopVisualization();
    
    // Reconnect WebSocket
    const wsConnected = await websocketService.reconnect();
    
    if (wsConnected && micPermission === 'granted') {
      // Restart recording
      microphoneService.startRecording(handleAudioData, handleVoiceActivity);
      setIsListening(true);
      animationService.startVisualization();
    }
  };

  /**
   * Initialize on component mount
   */
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const initialize = async () => {
      // Request mic permission immediately on page load
      const micGranted = await initMicrophone();
      
      if (micGranted) {
        // Connect to WebSocket after mic permission
        await initWebSocket();
      }
    };

    initialize();

    // Cleanup on unmount
    return () => {
      microphoneService.dispose();
      audioService.dispose();
      animationService.dispose();
      websocketService.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Get status color based on connection state
   */
  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'status-connected';
      case 'connecting':
      case 'reconnecting': return 'status-connecting';
      default: return 'status-disconnected';
    }
  };

  /**
   * Get status text
   */
  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected to Server';
      case 'connecting': return 'Connecting...';
      case 'reconnecting': return 'Reconnecting...';
      case 'failed': return 'Connection Failed';
      default: return 'Disconnected';
    }
  };

  /**
   * Get mic permission status text
   */
  const getMicStatusText = () => {
    switch (micPermission) {
      case 'granted': return isListening ? 'Listening...' : 'Microphone Ready';
      case 'requesting': return 'Requesting Permission...';
      case 'denied': return 'Microphone Access Denied';
      default: return 'Checking Microphone...';
    }
  };

  return (
    <div className="App">
      <div className="container">
        {/* Header */}
        <header className="header">
          <div className="logo">
            <span className="logo-icon">🎙️</span>
            <h1>Voice Assistant</h1>
          </div>
          <p className="subtitle">Speak naturally and I'll listen</p>
        </header>

        {/* Voice Visualization Area */}
        <div className="visualization-container">
          <div className={`visualization-circle ${isListening ? 'active' : ''}`}>
            <canvas 
              ref={canvasRef} 
              className="visualization-canvas"
            />
            {!isListening && micPermission === 'granted' && (
              <div className="mic-icon">🎤</div>
            )}
          </div>
          
          {/* Voice Level Indicator */}
          <div className="voice-level-container">
            <div 
              className="voice-level-bar" 
              style={{ width: `${voiceLevel}%` }}
            />
          </div>
          
          <p className="listening-status">
            {getMicStatusText()}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}

        {/* Connection Status */}
        <div className={`connection-status ${getStatusColor()}`}>
          <span className="status-dot"></span>
          <span className="status-text">{getStatusText()}</span>
        </div>

        {/* Reconnect Button */}
        <button 
          className="reconnect-button"
          onClick={handleReconnect}
          disabled={connectionStatus === 'connecting' || connectionStatus === 'reconnecting'}
        >
          <span className="button-icon">🔄</span>
          <span>Reconnect Session</span>
        </button>

        {/* Mic Permission Button (shown if denied) */}
        {micPermission === 'denied' && (
          <button 
            className="permission-button"
            onClick={initMicrophone}
          >
            <span className="button-icon">🎤</span>
            <span>Grant Microphone Access</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
