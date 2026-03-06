# Import the required modules 
import asyncio
from fastapi import WebSocket
from fastapi.websockets import WebSocketDisconnect

# Import the time expiration module
from time_expiration import SessionGuard

# Import the app from the agents folder
from voice_synthesis.SpeachToText import recognize
from voice_synthesis.TextToSpeach import synthesize

from config.Singleton import SingletonSessionMemory

# Import Runner class 
from google.adk.runners import Runner

# Import the live runner queue from ADK 
from google.adk.agents.live_request_queue import LiveRequestQueue
from google.genai.types import Content, Part

""" Data Flow Patterns: user sends message → runner receives it → agent processes with tools → state updates → response returns."""
async def websocket_handler(websocket: WebSocket, session_id: str, user_id: str, live_connection : bool, singltonRunner : Runner):
        """Handles a voice WebSocket connection using Google ADK's run_live."""
        try:
            print("[VOICE WS] Initializing session...")
            # Create the shared queue and shutdown event
            live_queue = LiveRequestQueue()
            shutdown_event = asyncio.Event()
            # Create a session guard
            session_guard = SessionGuard(timeout_minutes=15)
            print(f"[VOICE WS] Session valid status: {session_guard.is_valid()}")
            print("[VOICE WS] ADK session starting...")
            ### Create a methods to send the user message to ADK and get the message back and sent it to the user 
                ## Data send to ADK  
                    # Get the voice chunks and transulate the text 
                    # Store the user conversation in the session data 
                    # Send the session data to the ADK 
                ## Data Recieved from ADK  
                    # Get the text data from ADK 
                    # Store the user conversation in the session data  
                    # Return the tts transcribed data back to client        
            print("[VOICE WS] ADK session ready. Starting tasks...")
            while live_connection:
                print("Infinite loop to check the flow !!!")
                # Run the tasks concurrently as a full-duplex line 
                await asyncio.gather(
                    # Task 1: Listen to User -> STT -> Queue
                    send_to_adk(
                        shutdown_event=shutdown_event,
                        live_queue=live_queue,
                        session_guard=session_guard,
                        websocket=websocket,
                        user_id=user_id,
                        session_id=session_id
                    ),
                    # Task 2: Queue -> ADK -> TTS -> User
                    receive_from_adk(
                        shutdown_event=shutdown_event,
                        runner=singltonRunner,
                        session_id=session_id,
                        live_queue=live_queue,
                        session_guard=session_guard,
                        websocket=websocket,
                        user_id=user_id,
                    )
                )
            print("[VOICE WS] Tasks completed")
        except WebSocketDisconnect:
            print("[VOICE WS] WebSocket disconnected by client")
            live_connection = False
        except Exception as e:
            print(f"[VOICE WS ERROR] Session Error: {type(e).__name__}: {e}")
            live_connection = False
        finally:
            # 3. Clean up when the 15 mins are up or connection drops
            shutdown_event.set()
            live_queue.close()
            if not websocket.client_state.name == "DISCONNECTED":
                await websocket.close()
            live_connection = False
            print("Session Closed.")

# ── Task 1: Read audio from WebSocket → convert to text → push to ADK ──
    ## Data send to ADK 
                # Get the voice chunks and transulate the text 
                # Store the user conversation in the session data 
                # Send the session data to the ADK 
async def send_to_adk(
        shutdown_event: asyncio.Event, 
        live_queue : LiveRequestQueue, 
        session_guard : SessionGuard, 
        websocket : WebSocket, 
        user_id: str, 
        session_id: str
):
    try:
        print("[SEND] Starting audio receiver...")
        while not shutdown_event.is_set():
            # Check session validity
            if not session_guard.is_valid():
                print("[SEND] Session expired")
                shutdown_event.set()
                break
            # check the block 
            try:
                # check for the data 
                data = await asyncio.wait_for(websocket.receive_bytes(), timeout=0.5)
            # thow the timeout error 
            except asyncio.TimeoutError:
                # No audio received in this 0.5s window
                data = None  
            # Convert to text
            user_text = await recognize(data)
            # check if the user_text exits 
            if user_text:
                # Get the session memeory form the session memory 
                session = await SingletonSessionMemory.get_session(
                    user_id=user_id,
                    session_id=session_id
                )
                session.state["user_input"] = user_text
                # Push to the data to ADK
                live_queue.send_content(
                    Content(parts=[Part(text=user_text)], role="user")
                )
                # Reset the session guard 
                session_guard.reset_silence_timer()
                # continue 
                continue
            # Check if the session crossed 5 seconds
            if session_guard.check_session_duration(time=(5/60)):
                # Send the empty message to the queue 
                live_queue.send_content(
                    Content(parts=[Part(text="")], role="user")
                )
                # Reset the session guard 
                session_guard.reset_silence_timer()
    # Check thw websocket connections
    except WebSocketDisconnect:
        print("[SEND] Client disconnected")
        live_queue.close()
        shutdown_event.set()
    except Exception as e:
        print(f"[SEND ERROR] {type(e).__name__}: {e}")
        live_queue.close()
        shutdown_event.set()

# ── Task 2: Run the ADK live loop → process events → send audio back ──
    ## Data Recieved from ADK  
        # Get the text data from ADK 
        # Store the user conversation in the session data  
        # Return the tts transcribed data back to client
async def receive_from_adk(
          shutdown_event: asyncio.Event, 
          runner : Runner, 
          session_id : str, 
          live_queue : LiveRequestQueue, 
          session_guard : SessionGuard, 
          websocket : WebSocket, 
          user_id : str
          ):
    try:
        print("[RECEIVE] Starting ADK listener via run_live...")
        # This is the SINGLE run_live loop — it yields Event objects
        async for event in runner.run_live(
                user_id=user_id,
                session_id=session_id,
                live_request_queue=live_queue
            ):
            # Check the shutdown_event is set 
            if shutdown_event.is_set():
                break
            # Check session validity
            if not session_guard.is_valid():
                print("[RECEIVE] Session expired")
                shutdown_event.set()
                break
            # Process events that have text content
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if part.text:
                        print(f"[RECEIVE] Got response: {part.text}")
                        # tts 
                        audio = await synthesize(part.text)
                        # Send voice back to user via WebSocket
                        await websocket.send_bytes(audio)
                        print("[RECEIVE] Sent audio to client")
        print("[RECEIVE] run_live loop ended")
    # Check the websocket disconnected status 
    except WebSocketDisconnect:
            print("[RECEIVE] Client disconnected")
            shutdown_event.set()
    # Chekc for the exception
    except Exception as e:
            print(f"[RECEIVE ERROR] {type(e).__name__}: {e}")    
            shutdown_event.set()
