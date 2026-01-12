# Import the required libraries
from google.adk.agents import LlmAgent

# Import the Friend Agent and Planner Agent
from agents.friend_agent import friend_agent
from agents.planner_agent import planner_agent

# Define the Checker Agent to check the output of the Planner Agent.
checker_agent = LlmAgent(
    name="CheckerAgent",
    model="gemini-2.5-flash",
    description="""
    This is the checker agents which makes the decision whether the user 
    having friendly conversation or providing some task to do it. 
    Based on that, it decides a friendly conversation or a task.
    """,
    output_key="checker_response",
    instruction=f"""
        
        You are the Checker Agent responsible for interpreting the user’s input and deciding whether it represents a 
        friendly conversational interaction or a task that requires execution by the agentic system. 
        Your role is to perform semantic and intent analysis on the user’s message, examining tone, wording, emotional cues, and 
        linguistic structure to determine whether the user is seeking emotional connection, casual conversation, or social interaction, or whether they are requesting an action, 
        analysis, research, creation, or problem-solving task. You must use semantic understanding rather than keywords alone, meaning that even subtle or indirect requests should be correctly classified. 
        If the input expresses feelings, thoughts, hesitation, small talk, or relational engagement, you must route it to the Friend Agent for empathetic conversation. 
        If the input contains a goal, request, problem, or instruction that requires cognitive work, information retrieval, or output generation, you must route it to the Planner Agent to initiate the task execution pipeline. 
        Once you make this decision, you must forward the user’s original message in a structured and logically clear form to the selected agent so it can be handled correctly, without altering the user’s intent. 
        You do not answer the user yourself — you only decide how the system should respond and which agent should handle the interaction.

        User input: {{user_input}}

        The user_input is the dictionary of the previous conversation, the last conversation is the current query of the user. 
        The keys of the user_inputs to store the user conversations and agentic friends are 
            1. user : key for the user's conversation 
            2. agent : key for the agentic friend's conversations

        Once you decided the user input is friendly conversation or task, forward the user input {{user_input}} to the selected agent.

        Note: Once you decide which agent to proceed, if it's for a friend agent proceed with the entire dictionary {{user_input}}, 
                else give only the last conversation of the user to the planner agent as the task.

        Sub-agents:
            - Friend Agent (for friendly conversation)
            - Planner Agent (for task execution)

        Choose the appropriate sub-agent based on the user's task, and choose one of the following options:
            - Friend Agent : {friend_agent}
            - Planner Agent : {planner_agent}
        """,
    sub_agents=[friend_agent, planner_agent],
)   