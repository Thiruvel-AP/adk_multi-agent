import React, { useState } from 'react';
import useWebSocket from './useWebSocket';
import useApiLoader from './useApiLoader';

const WebSocketExample = () => {
  const { isConnected, connectionStatus, connect, disconnect, reconnect, sendMessage } = useWebSocket();
  const { withLoading } = useApiLoader();
  const [message, setMessage] = useState('');

  const handleConnect = async () => {
    await withLoading('websocket-connect', connect, 'Connecting to WebSocket...');
  };

  const handleReconnect = async () => {
    await withLoading('websocket-reconnect', reconnect, 'Reconnecting to WebSocket...');
  };

  const handleSendMessage = () => {
    if (message.trim()) {
      sendMessage({ text: message });
      setMessage('');
    }
  };

  return (
    <div>
      <h2>WebSocket Example</h2>
      <div>
        <p>Connection Status: {connectionStatus}</p>
        <p>Connected: {isConnected ? 'Yes' : 'No'}</p>
      </div>

      <div>
        <button onClick={handleConnect} disabled={isConnected}>
          Connect
        </button>
        <button onClick={disconnect} disabled={!isConnected}>
          Disconnect
        </button>
        <button onClick={handleReconnect}>
          Reconnect
        </button>
      </div>

      <div>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Enter message to send"
        />
        <button onClick={handleSendMessage} disabled={!isConnected}>
          Send Message
        </button>
      </div>
    </div>
  );
};

export default WebSocketExample;