# Import the required classes from the ADK
from google.adk.agents import LlmAgent, SequentialAgent, ParallelAgent
import copy
from google.adk.tools import google_search

# Import the Friend Agent
from agents.friend_agent import friend_agent

# Define the leaf-level worker agents that perform actual work
# Researcher Agent
research_agent = LlmAgent(
    name="Researcher", 
    model="gemini-2.5-flash",
    output_key="research_findings",
    description="Researcher agent that conducts thorough research on a given topic.", 
    instruction=f"""
    You are the Research Agent responsible for gathering accurate, relevant, and up-to-date 
    information to support the user’s task. 
    Your role is to interpret the structured task provided by the Planner Agent and perform thorough 
    research using the Google Search tool whenever external or real-world information is required. 
    You must identify what information is needed, formulate effective search queries, evaluate multiple sources, and 
    extract the most reliable and useful facts, data points, explanations, and perspectives. 
    You should prioritize trustworthy and authoritative sources and avoid speculation or unsupported claims. 
    Your output should not be a final answer to the user; instead, you must return a clean, well-organized research brief containing key findings, 
    important details, and source-backed insights that the Writer Agent can use. You should include factual accuracy, coverage of different angles where relevant, and 
    concise summaries of what you discovered, focusing only on what is necessary to fulfill the user’s task. 
    Your goal is to provide high-quality raw intelligence that enables the Writer Agent to produce a strong, correct, and coherent final response.

    Task: {{task}}
    """,
    tools=[google_search],
    )
# Writer Agent
writer_agent = LlmAgent(
    name="Writer", 
    model="gemini-2.5-flash",
    description="Writer agent that writes a report based on the research.", 
    instruction="""
    You are the Writer Agent responsible for producing the final response to the user using the 
    research provided by the Research Agent. Your job is to read, synthesize, and interpret the research output, 
    then transform it into a clear, well-structured, and user-friendly answer that directly fulfills the user’s original request. 
    You must not introduce new facts or perform additional research; all content must be grounded in the material supplied by the Research Agent. 
    You should organize the information logically, remove redundancy, and present it in a natural, readable, and engaging way that matches the user’s intent and tone. 
    Your writing should be accurate, coherent, and easy to understand, whether the task is explanatory, analytical, or summary-based. 
    The final output should feel complete, polished, and helpful, as if written by a skilled human who fully understands both the topic and the user’s needs.

    researched data: {research_findings}
    """,
    )

# A Sequential Flow: Researcher -> Writer
sequential_flow = SequentialAgent(
    name="SequentialResearchAgent",
    description="This is the Sequential Research Agent that will be used to perform tasks sequentially.",
)

# Sub agents
sub_agents = [research_agent, writer_agent, friend_agent]

# Create 5 separate research agents
research_agent_1 = copy.deepcopy(research_agent)
research_agent_1.name = "Researcher_1"
research_agent_1.output_key = "research_findings_1"

research_agent_2 = copy.deepcopy(research_agent)
research_agent_2.name = "Researcher_2"
research_agent_2.output_key = "research_findings_2"

research_agent_3 = copy.deepcopy(research_agent)
research_agent_3.name = "Researcher_3"
research_agent_3.output_key = "research_findings_3"

research_agent_4 = copy.deepcopy(research_agent)
research_agent_4.name = "Researcher_4"
research_agent_4.output_key = "research_findings_4"

research_agent_5 = copy.deepcopy(research_agent)
research_agent_5.name = "Researcher_5"
research_agent_5.output_key = "research_findings_5"

# A Parallel Flow: Multiple agents working at once
parallel_flow = ParallelAgent(
    name="ParallelResearchAgent",
    description="This is the Parallel Research Agent that will be used to perform tasks parallelly.",
)

# Sub agents for the parallel flow 
parallel_flow.sub_agents = [research_agent_1, research_agent_2, research_agent_3, research_agent_4, research_agent_5]

# Create a deepcopy of the writer agent 
writer_agent_1 = copy.deepcopy(writer_agent)
writer_agent_1.name = "Writer_1"
writer_agent_1.instruction = """
    You are the Writer Agent responsible for producing the final combined responses of the parallel research to the user using the 
    research provided by the Research Agent. Your job is to read, synthesize, and interpret the research output, 
    then transform it into a clear, well-structured, and user-friendly answer that directly fulfills the user’s original request. 
    You must not introduce new facts or perform additional research; all content must be grounded in the material supplied by the Research Agent. 
    You should organize the information logically, remove redundancy, and present it in a natural, readable, and engaging way that matches the user’s intent and tone. 
    Your writing should be accurate, coherent, and easy to understand, whether the task is explanatory, analytical, or summary-based. 
    The final output should feel complete, polished, and helpful, as if written by a skilled human who fully understands both the topic and the user’s needs.

    researched data (Based on the task, sometimes some research findings may be empty): 
        source_1 : {research_findings_1}, 
        source_2 : {research_findings_2}, 
        source_3 : {research_findings_3},
        source_4 : {research_findings_4}, 
        source_5 : {research_findings_5}, 
    """
writer_agent_1.output_key = "writer_findings_1"

# Create a deep copy of the sequential flow
sequential_resultant_flow = copy.deepcopy(sequential_flow)
sequential_resultant_flow.name = "SequentialResultantFlowfortheParallelResearchAgent"
sequential_resultant_flow.description = "This is the Sequential Resultant Flow that combined the results of the parallel research to the user using the research, writer and friend agents."
sequential_resultant_flow.sub_agents = [parallel_flow, writer_agent_1, friend_agent]
