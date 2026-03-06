
# Import the required modules
from datetime import datetime, timedelta

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
            print("Exception on init method", e)

    # Method to check if the session is still within the 15-minute limit
    def is_valid(self):
        try:
            # Check if the session is still within the 15-minute limit
            return (datetime.now() - self.start_time) < self.timeout_delta
        except Exception as e:
            print("Exception on is valid method", e)
    
    # Method to check if the session has persisted more than X seconds
    def check_session_duration(self, seconds: int):
        try:
            # Safely compare the elapsed time to a timedelta of X seconds
            return (datetime.now() - self.last_action_time) >= timedelta(seconds=seconds)
        except Exception as e:
            print("Exception on check_session_duration method", e)
    
    # Reset the silence timer 
    def reset_silence_timer(self):
        try:
            """Call this to prevent the spam loop!"""
            self.last_action_time = datetime.now()
        except Exception as e:
            print("Exception on reset_silence_timer method", e)