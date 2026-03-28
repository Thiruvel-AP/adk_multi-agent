import { useCallback } from 'react';
import { useLoading } from './LoadingContext';

const useApiLoader = () => {
  const { showLoading, hideLoading } = useLoading();

  const withLoading = useCallback(
    async (loadingKey, apiCall, loadingMessage = "Loading...") => {
      showLoading(loadingKey, loadingMessage);
      try {
        const result = await apiCall();
        return result;
      } finally {
        hideLoading(loadingKey);
      }
    },
    [showLoading, hideLoading]
  );

  return { withLoading };
};

export default useApiLoader;