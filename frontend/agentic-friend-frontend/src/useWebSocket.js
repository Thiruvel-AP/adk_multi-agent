import { useState, useCallback, useEffect } from 'react';
import websocketService from './websocket';
import audioService from './audio';

const useWebSocket = () => {
  const [isConnected,      setIsConnected]      = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  // ── Animation state ─────────────────────────────────────────────────────
  // isSpeaking  → user is currently speaking  → show mic wave animation
  // isPlaying   → agent is currently speaking → show agent wave animation
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPlaying,  setIsPlaying]  = useState(false);

  useEffect(() => {
    // ── Connection status ──────────────────────────────────────────────
    const handleStatusChange = (status) => {
      setConnectionStatus(status);
      setIsConnected(status === 'connected');
    };

    // ── User mic events ────────────────────────────────────────────────
    const handleSpeechStart = () => {
      setIsSpeaking(true);
      setIsPlaying(false);   // agent stops when user starts (barge-in)
    };

    const handleSpeechEnd = () => {
      setIsSpeaking(false);
    };

    // ── Agent audio events ─────────────────────────────────────────────
    const handleAgentStart = () => {
      setIsPlaying(true);
    };

    const handleAgentStop = () => {
      setIsPlaying(false);
    };

    // ── Wire up AudioService queue callback ────────────────────────────
    // agentStop fires when the audio queue drains naturally
    audioService.onQueueEmpty = handleAgentStop;

    // ── Register all listeners ─────────────────────────────────────────
    websocketService.on('statusChange', handleStatusChange);
    websocketService.on('speechStart',  handleSpeechStart);
    websocketService.on('speechEnd',    handleSpeechEnd);
    websocketService.on('agentStart',   handleAgentStart);
    websocketService.on('agentStop',    handleAgentStop);

    return () => {
      websocketService.off('statusChange', handleStatusChange);
      websocketService.off('speechStart',  handleSpeechStart);
      websocketService.off('speechEnd',    handleSpeechEnd);
      websocketService.off('agentStart',   handleAgentStart);
      websocketService.off('agentStop',    handleAgentStop);
      audioService.onQueueEmpty = null;
    };
  }, []);

  const connect = useCallback(async () => {
    try {
      await websocketService.connect();
      return true;
    } catch (error) {
      console.error('WebSocket connection failed:', error);
      return false;
    }
  }, []);

  const disconnect = useCallback(() => {
    websocketService.disconnect();
    setIsSpeaking(false);
    setIsPlaying(false);
  }, []);

  const reconnect = useCallback(async () => {
    try {
      return await websocketService.reconnect();
    } catch (error) {
      console.error('WebSocket reconnection failed:', error);
      return false;
    }
  }, []);

  const sendMessage = useCallback((message) => {
    return websocketService.sendMessage(message);
  }, []);

  const startAudio = useCallback(async () => {
    await websocketService.startAudio();
  }, []);

  const stopAudio = useCallback(async () => {
    await websocketService.stopAudio();
    setIsSpeaking(false);
  }, []);

  return {
    // connection
    isConnected,
    connectionStatus,
    connect,
    disconnect,
    reconnect,
    sendMessage,
    // audio control
    startAudio,
    stopAudio,
    // ✅ animation state — use these to drive your wave components
    isSpeaking,   // true while user mic is active
    isPlaying,    // true while agent audio is playing
  };
};

export default useWebSocket;