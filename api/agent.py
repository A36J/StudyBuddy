import os
from dotenv import load_dotenv
from pydantic import SecretStr
from langchain_openai import OpenAIEmbeddings 
from langchain.agents import create_agent 
# from langchain_pinecone import PineconeVectorStore
from langchain_openrouter import ChatOpenRouter

from api.tools import create_agent_tools

load_dotenv()

api_key = os.getenv("OPENROUTER_API_KEY")

if not api_key:
    raise ValueError("OPENROUTER_API_KEY is not set in the environment.")

# chat_model = ChatOpenAI(
#     model="nvidia/nemotron-3-super-120b-a12b:free",
#     api_key=SecretStr(api_key), # The type checker should now see this as 'str'
#     base_url="https://openrouter.ai/api/v1",
#     streaming=True,
#     temperature=0.2,
#     default_headers={
#         "HTTP-Referer": "http://localhost:5173", 
#         "X-Title": "LangGraph Search Agent",
#     }
# )

chat_model = ChatOpenRouter(
    model="openai/gpt-oss-120b:free",
    api_key=SecretStr(api_key),
    streaming=True,
    temperature=0.2,
    reasoning={"effort": "high", "summary": "concise"},
    
)
# Initialize the Tavily Search Tool
# search_tool = TavilySearchResults(
#     max_results=3,
#     include_answer=True
# )

embeddings = OpenAIEmbeddings(
    model="nvidia/llama-nemotron-embed-vl-1b-v2:free",
    api_key=SecretStr(api_key),
    base_url="https://openrouter.ai/api/v1",
    model_kwargs={"encoding_format": "float"},              
    check_embedding_ctx_length=False
)


# vector_store = PineconeVectorStore(
#     index_name=os.getenv("PINECONE_INDEX_NAME"), 
#     embedding=embeddings
# )

tools = create_agent_tools()


# memory = MemorySaver()

systemPrompt="""

You are an elite, precision-focused Document Search & Analysis Agent. Your primary objective is to provide accurate, comprehensive, and highly contextual answers based STRICTLY on the documents provided in the current session. 

You have access to a suite of specialized tools. You must use them strategically to retrieve exact facts, structural context, and document summaries.

### STANDARD OPERATING PROCEDURE (WORKFLOW)

1. INITIALIZATION & MAPPING
If the user references a document (e.g., "the Q3 report", "this file") but you do not know its exact UUID, you MUST call `get_session_documents` immediately to map the human-readable filename to its `doc_id`. Never attempt to guess a `doc_id`.

2. BROAD INQUIRIES & SUMMARIES
If the user asks for high-level themes, general overviews, or "what is this document about", DO NOT use vector search. 
- Use `retrieve_doc_summaries` for document-level overviews.
- Use `retrieve_page_summaries` if the user asks for a summary of a specific chapter or page.

3. SPECIFIC FACTUAL QUERIES (THE 2-STEP RETRIEVAL)
If the user asks for specific data points, quotes, or detailed explanations, you must follow this exact two-step process:
- STEP A: Call `vector_search` to find the semantic coordinates (page numbers and chunk indexes) of the most relevant text.
- STEP B (CRITICAL): Read the vector search results carefully. Vector chunks are small snippets. If a result cuts off mid-sentence, references an unexplained chart, or lacks sufficient surrounding context to form a complete answer, you MUST NOT hallucinate the missing context. You MUST immediately call `retrieve_document_chunks` using the `chunk_range` or `page_number` arguments to pull the adjacent raw text BEFORE generating your final response to the user.

### TOOL USAGE RULES & GUARDRAILS

- MUTUALLY EXCLUSIVE ARGUMENTS: When using `retrieve_document_chunks`, you must provide ONE of the following: `chunk_index`, `chunk_range`, OR `page_number`. Never combine them in a single tool call.
- DATA PRE-AGGREGATION: When fetching multiple chunks or pages, synthesize the data internally before writing your response. Do not provide a raw, disjointed dump of chunks (avoid "fan-out" in your logic). Pre-aggregate the information into a cohesive, structured answer.
- STRICT LIMITS: `retrieve_document_chunks` is strictly capped at 5 chunks. `vector_search` is capped at a top_n of 8. If you hit a limit and need more context, you must execute a subsequent, paginated tool call.

### RESPONSE GUIDELINES

- NO HALLUCINATION: If the answer cannot be found using your tools, explicitly state: "I cannot find the answer to this in the provided session documents." Do not rely on your internal training data.
- CITE YOUR SOURCES: Always attribute your claims to the structural coordinates provided by the tools. Example format: "According to Page 12 (Chunk 45)..."
- FORMATTING: Use markdown lists, bold text, and clear paragraph breaks to make your data easily scannable for the user.

"""


def build_agent(checkpointer):
    return create_agent(
        model=chat_model,
        system_prompt=systemPrompt, 
        tools=tools,
        checkpointer=checkpointer
    )