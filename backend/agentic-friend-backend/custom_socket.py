# Import the required modules 
import asyncio
from fastapi import WebSocket
from fastapi.websockets import WebSocketDisconnect

# Import the time expiration module
from time_expiration import SessionGuard
from memory.session_memory import SessionMemory

# Import the app from the agents folder
from agents.root_agent import app  
from voice_synthesis import tts, sst

async def websocket_handler(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket connection accepted")
    # try to handle the websocket connection
    try:

        # Create a session guard
        session_guard = SessionGuard()

        # Create a session memory 
        session_memory = SessionMemory()
        
        # 1. Open the multimodal stream with the ADK App
        async with app.run_stream() as session:
            
            # Use task groups to handle sending and receiving simultaneously
            async def send_to_adk():
                try:
                    while True:     
                        # Check if the session is still valid
                        if not session_guard.is_valid():
                            await websocket.close()
                            return

                        # 2. Receive raw audio bytes from the Frontend
                        data = await websocket.receive_bytes()

                        # 2.1. Convert the audio bytes to text
                        text = await sst.recognize(data)

                        # Store the session memory for the user 
                        session_memory.store_convo(
                            key="user",
                            value=text
                        )

                        # 3. Feed the ADK's Root Agent
                        await session.send_input(
                            session_memory.session_memory
                        )
                except WebSocketDisconnect:
                    pass

            async def receive_from_adk():
                try:
                    while True:
                        # Check if the session is still valid
                        if not session_guard.is_valid():
                            await websocket.close()
                            return

                        # 4. Listen for the AI's response (Audio Out)
                        async for output in session.receive_output():

                            # Store the AI conversation as agent 
                            session_memory.store_convo(
                                key="agent",
                                value=output.text
                            )

                            # 4.1. Convert the text to audio bytes
                            audio = await tts.synthesize(output.text)
                            
                            # 5. Send voice back to user via WebSocket
                            await websocket.send_bytes(audio)
                except Exception as e:
                    print(f"Error receiving from ADK: {e}")

            # Run both listeners concurrently
            await asyncio.gather(send_to_adk(), receive_from_adk())

    except Exception as e:
        print(f"Session Error: {e}")
    finally:
        await websocket.close()