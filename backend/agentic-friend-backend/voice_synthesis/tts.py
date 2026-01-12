# Import the required modules for tts 
from google.oauth2 import service_account
from google.cloud import texttospeech as tts
import os 

# fetch the key path from json
api_key = os.getenv("GOOGLE_CLOUD_SERVICE_KEY")

print(api_key)
print("------")

# Create the credentials object from the JSON file path
credentials = service_account.Credentials.from_service_account_file(api_key)

# Initialize the TTS client
tts_client = tts.TextToSpeechClient(
    credentials=credentials
)

# Synthesis function to convert result to speech 
async def synthesize(text: str) -> bytes:
    # try
    try:
        # Synthesis the input
        synthesis_input = tts.SynthesisInput(text=text)
        # Configure voice
        voice = tts.VoiceSelectionParams(
            language_code="en-US",
            name="en-US-Neural2-F"
        )
        # Configure audio output
        audio_config = tts.AudioConfig(
            audio_encoding=tts.AudioEncoding.MP3
        )
        # Create a response with tts instance
        response = tts_client.synthesize_speech(
            input=synthesis_input, 
            voice=voice, 
            audio_config=audio_config
        )

        return response.audio_content
    except Exception as e:
        print(e)
        return e