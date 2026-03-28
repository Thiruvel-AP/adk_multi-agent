import React from 'react';
import { useLoading } from './LoadingContext';
import './Loader.css';

const GlobalLoader = () => {
  const { getAllLoadingStates } = useLoading();
  const loadingStates = getAllLoadingStates();

  // Check if any loader is active
  const hasActiveLoaders = Object.values(loadingStates).some(state => state.isLoading);

  if (!hasActiveLoaders) return null;

  // Get the first active loader message
  const activeLoader = Object.values(loadingStates).find(state => state.isLoading);
  const message = activeLoader?.message || "Loading...";

  return (
    <div className="loader-overlay">
      <div className="loader-container">
        <div className="loader-spinner"></div>
        <p className="loader-message">{message}</p>
      </div>
    </div>
  );
};

export default GlobalLoader;