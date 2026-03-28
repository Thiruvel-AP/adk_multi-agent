import React from 'react';
import useApiLoader from './useApiLoader';

// Example component showing how to use the useApiLoader hook
const ApiExampleComponent = () => {
  const { withLoading } = useApiLoader();

  const fetchData = async () => {
    // Simulate API call
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({ data: "Sample data" });
      }, 2000);
    });
  };

  const handleFetchData = async () => {
    try {
      const result = await withLoading(
        'fetchData',
        fetchData,
        'Fetching data...'
      );
      console.log('Data fetched:', result);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  return (
    <div>
      <h2>API Example</h2>
      <button onClick={handleFetchData}>
        Fetch Data with Loader
      </button>
    </div>
  );
};

export default ApiExampleComponent;