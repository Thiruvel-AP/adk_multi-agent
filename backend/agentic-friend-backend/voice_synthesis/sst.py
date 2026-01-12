# Import the required modules for tts 
from google.cloud import speech as stt
import os
from google.oauth2 import service_account

api_key = os.getenv("GOOGLE_CLOUD_SERVICE_KEY")

print(api_key)
print("------")

# Create the credentials object from the JSON file path
credentials = service_account.Credentials.from_service_account_file(api_key)

# Initialize the SST client
stt_client = stt.SpeechClient(
    credentials = credentials
)

# Method to transcribe audio to text 
async def recognize(audio_bytes: bytes) -> str:
    # try 
    try:
        # Recognize the audio clip 
        audio = stt.RecognitionAudio(content=audio_bytes)
        # Set the configuration 
        config = stt.RecognitionConfig(
            encoding=stt.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=16000,
            language_code="en-US",
        )
        # Get the response from the sst client 
        response = stt_client.recognize(config=config, audio=audio)

        # Gather the results
        transcript = ""
        for result in response.results:
            transcript += result.alternatives[0].transcript
        # Return the result
        return transcript
    # Exception
    except Exception as e:
        print(e)
        return e 