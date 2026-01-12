import uvicorn
from fastapi import FastAPI, APIRouter, WebSocket
from custom_socket import websocket_handler

# 1. Initialize the Router
router = APIRouter(prefix="/ws")

# 2. Define the route ON the router
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    print("WebSocket connection created")
    await websocket_handler(websocket)

# 3. Create the App
app = FastAPI()

# 4. Include the router AFTER the route is defined
app.include_router(router)

if __name__ == "__main__":
    print("Started !!")
    uvicorn.run(app, host="0.0.0.0", port=8000)