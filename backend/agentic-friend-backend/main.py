import uvicorn
from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, Query, HTTPException
# Import the singleton instance 
from config.Singleton import SingletonSessionMemory, SingletonRunner
from fastapi.middleware.cors import CORSMiddleware
from custom_socket import websocket_handler

# UUID
import uuid

# 1. Initialize the Router
router_instance = APIRouter()

# 2. Define the route ON the router
@router_instance.websocket("/voice")
async def router_call(
    websocket_instance: WebSocket, 
    session_id: str = Query(None), 
    user_id: str = Query(None)):
    try:
        # Accept the socket FIRST
        await websocket_instance.accept()
        print("WebSocket connection accepted")

        print("session id", session_id)
        print("user id", user_id)
        # check the presence of session_id and user_id in the query
        if not session_id or not user_id: 
            print("User ID or session ID is missing !!!, can't connect with the socket !!!")
            await websocket_instance.close(code=1008)
            return

        # Invoke the websocket handler from custom websocket module 
        await websocket_handler(
            websocket=websocket_instance, 
            session_id=session_id,
            user_id=user_id, 
            live_connection=True,
            singltonRunner=SingletonRunner
            )
        
    except WebSocketDisconnect:
        print("WebSocket disconnected normally")
    except Exception as error:
        # Print the error 
        print(f"Error at the router: {error}")

# 3. Create the App
app = FastAPI()

# Add this block to allow your React app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# include router 
app.include_router(router_instance)

# post call to send the data to frontend 
@app.post("/start-session")
async def transfer_session_id(
    session_id: str = Query(None), # Explicitly tells FastAPI to look in the URL
    user_id: str = Query(None)
    ):
    try:
        print("check the session id:", session_id)
        if (session_id is None or session_id == '') or (user_id is None or user_id == ''):
            session_id = str(uuid.uuid4())
            user_id = str(uuid.uuid4())

            _ = await SingletonSessionMemory.create_session(
                user_id=user_id,
                session_id=session_id
            )

            print("new session id", session_id)
            print("new user id", user_id)

        return {"session_id": session_id, "user_id" : user_id}
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    print("Server started on http://0.0.0.0:8000")
    print("WebSocket endpoint: http://0.0.0.0:8000/voice")
    print("WebSocket endpoint: http://0.0.0.0:8000/start-session")
    uvicorn.run(app, host="0.0.0.0", port=8000, workers=1)