import React from 'react';
import './Loader.css';

const Loader = ({ isLoading, message = "Loading..." }) => {
  if (!isLoading) return null;

  return (
    <div className="loader-overlay">
      <div className="loader-container">
        <div className="loader-spinner"></div>
        <p className="loader-message">{message}</p>
      </div>
    </div>
  );
};

export default Loader;