import React, { useEffect, useState, useRef, useCallback } from 'react';
import './App.css';
import websocketService from './websocket';
import audioService from './audio';
import GlobalLoader from './GlobalLoader';

import { getSessionID } from './SessionStore';
import { useLoading } from './LoadingContext';

function App() {
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [micPermission,    setMicPermission]    = useState('pending');
  const [error,            setError]            = useState(null);

  // ── Animation state ──────────────────────────────────────────────────────
  // isSpeaking → user mic active  → mic wave pulses
  // isPlaying  → agent audio playing → agent wave pulses
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPlaying,  setIsPlaying]  = useState(false);

  const canvasRef         = useRef(null);
  const animFrameRef      = useRef(null);
  const isInitializedRef  = useRef(false);

  const { showLoading, hideLoading } = useLoading();

  // ── Wave animation ────────────────────────────────────────────────────────
  const drawWave = useCallback((active, color) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx    = canvas.getContext('2d');
    const w      = canvas.width;
    const h      = canvas.height;
    const t      = performance.now() / 300;

    ctx.clearRect(0, 0, w, h);

    if (!active) {
      // Idle — flat line
      ctx.beginPath();
      ctx.strokeStyle = '#444';
      ctx.lineWidth   = 2;
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      return;
    }

    // Animated sine wave
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 3;
    for (let x = 0; x < w; x++) {
      const y = h / 2 + Math.sin(x * 0.04 + t) * 20 + Math.sin(x * 0.02 + t * 1.3) * 10;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, []);

  useEffect(() => {
    const active = isSpeaking || isPlaying;
    const color  = isSpeaking ? '#4ade80' : '#60a5fa'; // green = user, blue = agent

    const loop = () => {
      drawWave(active, color);
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isSpeaking, isPlaying, drawWave]);

  // ── WebSocket event listeners ─────────────────────────────────────────────
  useEffect(() => {
    const onStatus      = (s) => { setConnectionStatus(s); };
    const onSpeechStart = ()  => { setIsSpeaking(true);  setIsPlaying(false); };
    const onSpeechEnd   = ()  => { setIsSpeaking(false); };
    const onAgentStart  = ()  => { setIsPlaying(true);  };
    const onAgentStop   = ()  => { setIsPlaying(false); };

    // AudioService queue-empty → agent finished speaking
    audioService.onQueueEmpty = onAgentStop;

    websocketService.on('statusChange', onStatus);
    websocketService.on('speechStart',  onSpeechStart);
    websocketService.on('speechEnd',    onSpeechEnd);
    websocketService.on('agentStart',   onAgentStart);
    websocketService.on('agentStop',    onAgentStop);

    return () => {
      websocketService.off('statusChange', onStatus);
      websocketService.off('speechStart',  onSpeechStart);
      websocketService.off('speechEnd',    onSpeechEnd);
      websocketService.off('agentStart',   onAgentStart);
      websocketService.off('agentStop',    onAgentStop);
      audioService.onQueueEmpty = null;
    };
  }, []);

  // ── Initialization ────────────────────────────────────────────────────────
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const initialize = async () => {
      showLoading('initialization', 'Connecting to server...');
      try {
        // 1. Get / create session IDs
        await getSessionID();

        // 2. Connect WebSocket
        setConnectionStatus('connecting');
        await websocketService.connect();

        // 3. Request mic + start unified audio pipeline
        //    websocketService.startAudio() handles mic capture, VAD,
        //    Int16 conversion and sending — no separate microphoneService needed
        try {
          setMicPermission('requesting');
          await websocketService.startAudio();
          setMicPermission('granted');
        } catch (micErr) {
          console.error('[App] Mic failed:', micErr);
          setMicPermission('denied');
          setError('Microphone access denied');
        }

      } catch (err) {
        console.error('[App] Initialization failed:', err);
        setError('Failed to connect to server');
      } finally {
        hideLoading('initialization');
      }
    };

    initialize();

    return () => {
      websocketService.stopAudio();
      audioService.dispose();
      websocketService.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reconnect ─────────────────────────────────────────────────────────────
  const handleReconnect = async () => {
    setError(null);
    showLoading('reconnection', 'Reconnecting...');
    try {
      await websocketService.stopAudio();
      await getSessionID();
      await websocketService.reconnect();
      await websocketService.startAudio();
      setMicPermission('granted');
    } catch (err) {
      setError('Reconnection failed');
    } finally {
      hideLoading('reconnection');
    }
  };

  // ── Status helpers ────────────────────────────────────────────────────────
  const statusColor = {
    connected:    'status-connected',
    connecting:   'status-connecting',
    reconnecting: 'status-connecting',
  }[connectionStatus] || 'status-disconnected';

  const statusText = {
    connected:    'Connected to Server',
    connecting:   'Connecting...',
    reconnecting: 'Reconnecting...',
    failed:       'Connection Failed',
  }[connectionStatus] || 'Disconnected';

  const micStatusText = () => {
    if (micPermission === 'denied')    return 'Microphone Access Denied';
    if (micPermission === 'requesting') return 'Requesting Permission...';
    if (isSpeaking)                    return 'Listening...';
    if (isPlaying)                     return 'Agent speaking...';
    return 'Ready';
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="App">
      <GlobalLoader />
      <div className="container">

        <header className="header">
          <div className="logo">
            <span className="logo-icon">🎙️</span>
            <h1>Voice Assistant</h1>
          </div>
          <p className="subtitle">Speak naturally and I'll listen</p>
        </header>

        {/* Wave Visualization */}
        <div className="visualization-container">
          <div className={`visualization-circle ${isSpeaking || isPlaying ? 'active' : ''}`}>
            <canvas ref={canvasRef} className="visualization-canvas" width={300} height={100} />
          </div>

          {/* State indicator dots */}
          <div className="state-indicators">
            <span className={`indicator ${isSpeaking ? 'indicator-active-green' : ''}`}>
              🎤 {isSpeaking ? 'You' : ''}
            </span>
            <span className={`indicator ${isPlaying ? 'indicator-active-blue' : ''}`}>
              🔊 {isPlaying ? 'Agent' : ''}
            </span>
          </div>

          <p className="listening-status">{micStatusText()}</p>
        </div>

        {error && (
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}

        <div className={`connection-status ${statusColor}`}>
          <span className="status-dot"></span>
          <span className="status-text">{statusText}</span>
        </div>

        <button
          className="reconnect-button"
          onClick={handleReconnect}
          disabled={connectionStatus === 'connecting' || connectionStatus === 'reconnecting'}
        >
          <span className="button-icon">🔄</span>
          <span>Reconnect Session</span>
        </button>

        {micPermission === 'denied' && (
          <button className="permission-button" onClick={() => websocketService.startAudio()}>
            <span className="button-icon">🎤</span>
            <span>Grant Microphone Access</span>
          </button>
        )}

      </div>
    </div>
  );
}

export default App;