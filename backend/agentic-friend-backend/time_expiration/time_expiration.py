
# Import the required modules
import logging
from datetime import datetime, timedelta

# Set up logging
logger = logging.getLogger(__name__)

# Create a class to handle the session guard
class SessionGuard:
    # Constructor
    def __init__(self, timeout_minutes=15):
        try:
            # Start time
            self.start_time = datetime.now()
            # time out status
            self.timeout_delta = timedelta(minutes=timeout_minutes)
            # Add a tracker for the silence interval
            self.last_action_time = datetime.now()
        except Exception as e:
            logger.error("Exception on init method", exc_info=True)

    # Method to check if the session is still within the 15-minute limit
    def is_valid(self):
        try:
            # Check if the session is still within the 15-minute limit
            return (datetime.now() - self.start_time) < self.timeout_delta
        except Exception as e:
            logger.error("Exception on is valid method", exc_info=True)
    
    # Method to check if the session has persisted more than X seconds
    def check_session_duration(self, seconds: int):
        try:
            # Safely compare the elapsed time to a timedelta of X seconds
            return (datetime.now() - self.last_action_time) >= timedelta(seconds=seconds)
        except Exception as e:
            logger.error("Exception on check_session_duration method", exc_info=True)

    # Reset the silence timer
    def reset_silence_timer(self):
        try:
            """Call this to prevent the spam loop!"""
            self.last_action_time = datetime.now()
        except Exception as e:
            logger.error("Exception on reset_silence_timer method", exc_info=True)