import { getSessionID as originalGetSessionID } from './SessionStore';

// Wrapper function that can be used with the loading context
export const getSessionID = async () => {
  // This function can be used with the useApiLoader hook
  // or with the loading context directly
  return await originalGetSessionID();
};