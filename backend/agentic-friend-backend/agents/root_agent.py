# Create the root agent for the multi-agent system, which is the entry point for the user input and output.

# Import the required modules
from dotenv import load_dotenv
from google.adk.apps import App

# Import the checker agent
from agents.checker_agent import checker_agent

# Load the API key from the .env file into the system environment
load_dotenv()

# Create the root agent
app = App(
    name="root_agent",
    root_agent=checker_agent,
)