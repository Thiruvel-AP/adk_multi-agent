# Store the session conversations and use it in the current conversation.
# Clear the storage at the end of each session 

# Create a class with constructor and destructor
class SessionMemory:
    # constructor 
    def __init__(self):
        # list to store the entire session conversation
        self.session_memory = dict()

    # method to store the conversation to memory
    def store_convo(self ,key : str, value : str):
        # Append it to the dict 
        self.session_memory[key] = value     
    
