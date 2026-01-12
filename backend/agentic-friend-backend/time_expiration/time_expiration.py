
# Import the required modules
import datetime

# Create a class to handle the session guard
class SessionGuard:
    # Constructor
    def __init__(self, timeout_minutes=15):
        self.start_time = datetime.datetime.now()
        self.timeout_delta = datetime.timedelta(minutes=timeout_minutes)

    # Method to check if the session is still within the 15-minute limit
    def is_valid(self):
        # Check if the session is still within the 15-minute limit
        return (datetime.datetime.now() - self.start_time) < self.timeout_delta