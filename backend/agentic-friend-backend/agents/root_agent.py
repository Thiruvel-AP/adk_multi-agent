# Create the root agent for the multi-agent system, which is the entry point for the user input and output.

# Import the required modules
from dotenv import load_dotenv
from google.adk.apps import App
import os


# Import the checker agent
from agents.checker_agent import checker_agent

# Load the API key from the .env file into the system environment
load_dotenv()

api_key = os.getenv("GOOGLE_API_KEY")

print(api_key)

# Create the root agent
agentic_app = App(
    name="agentic_friend",
    root_agent=checker_agent,
)