import React, { createContext, useContext, useState } from 'react';

const LoadingContext = createContext();

export const LoadingProvider = ({ children }) => {
  const [loadingStates, setLoadingStates] = useState({});

  const showLoading = (key, message = "Loading...") => {
    setLoadingStates(prev => ({
      ...prev,
      [key]: { isLoading: true, message }
    }));
  };

  const hideLoading = (key) => {
    setLoadingStates(prev => {
      const newState = { ...prev };
      delete newState[key];
      return newState;
    });
  };

  const isLoading = (key) => {
    return loadingStates[key]?.isLoading || false;
  };

  const getAllLoadingStates = () => {
    return loadingStates;
  };

  return (
    <LoadingContext.Provider value={{
      showLoading,
      hideLoading,
      isLoading,
      getAllLoadingStates
    }}>
      {children}
    </LoadingContext.Provider>
  );
};

export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
};

export default LoadingContext;