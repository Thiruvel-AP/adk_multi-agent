
// endpoint to get the session id 
const endpoint = "http://localhost:8000/start-session"

const getSessionID = async () => {
    try {
        const session_id = retrieve_session_id();
        const user_id = retrieve_user_id();

        if (session_id && user_id) {
            return session_id, user_id;
        }

        // 1. Construct the URL with query parameters
        // If session_id is null/undefined, we send an empty string or handle it
        const urlWithParams = `${endpoint}?session_id=${encodeURIComponent(session_id || '')}&user_id=${encodeURIComponent(user_id || '')}`;

        const response = await fetch(urlWithParams, {
            method: 'POST', // Still a POST request
            headers: {
                'Accept': 'application/json',
            },
            // 2. Remove the 'body' entirely
        });

        console.log(response)
        // check state of the response 
        if (!response.ok) {
            // throw error 
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        // store the results in the results
        const result = await response.json();

        console.log("results of the method getsessionid:", result)
        // Store the session id and user id 
        store_session_id(result["session_id"]);
        store_user_id(result["user_id"])
        // return the results 
        return result;
    } catch (e) {
        // log the error
        console.error(e);
        return false;
    }
}

  /**
   * store the session id in local storage 
   */
  const store_session_id = (session_id) =>{
    try{
        // Store it in local storage 
        localStorage.setItem("session_id", session_id)
    }catch(e){
        console.error(e);
        return false;
    }
  }
  
    /**
   * retrieve the session id in local storage 
   */
  const retrieve_session_id = () => {
    try{
        // Store it in local storage 
        return localStorage.getItem("session_id")
    }catch(e){
        console.error(e);
        return false;
    }
  }

   /**
   * store the session id in local storage 
   */
  const store_user_id = (user_id) =>{
    try{
        // Store it in local storage 
        localStorage.setItem("user_id", user_id)
    }catch(e){
        console.error(e);
        return false;
    }
  }


    /**
   * retrieve the session id in local storage 
   */
  const retrieve_user_id = () => {
    try{
        // Store it in local storage 
        return localStorage.getItem("user_id")
    }catch(e){
        console.error(e);
        return false;
    }
  }



  export {getSessionID, retrieve_session_id, retrieve_user_id};