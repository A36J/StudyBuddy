from typing import List, Optional
from pydantic import BaseModel, Field
from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig
import uuid
import os
from dotenv import load_dotenv
from pinecone import Pinecone
from pinecone_text.sparse import BM25Encoder
import numpy as np
from langchain_openai import OpenAIEmbeddings
from pydantic import SecretStr

load_dotenv()

api_key = os.getenv("OPENROUTER_API_KEY")
if not api_key:
    raise ValueError("OPENROUTER_API_KEY is not set in the environment.")

embeddings = OpenAIEmbeddings(
    model="nvidia/llama-nemotron-embed-vl-1b-v2:free",
    api_key=SecretStr(api_key),
    base_url="https://openrouter.ai/api/v1",
    model_kwargs={"encoding_format": "float"},              
    check_embedding_ctx_length=False
)

bm25_encoder = BM25Encoder().default()

class ChunkResult(BaseModel):
    doc_id: Optional[str]
    page: Optional[int]
    chunk_index: Optional[int]
    type: Optional[str]
    text: str

# Helper function to apply the alpha scaling
def hybrid_scale(dense, sparse, alpha: float):
    """
    Scales the dense and sparse vectors based on the alpha parameter.
    alpha = 1.0 : Pure Semantic Search
    alpha = 0.0 : Pure Keyword Search
    alpha = 0.5 : Equal Weight Hybrid
    """
    # Clamp alpha between 0 and 1 to prevent agent hallucinations
    alpha = max(0.0, min(1.0, alpha))
    
    hsparse = {
        'indices': sparse['indices'],
        'values':  [v * (1 - alpha) for v in sparse['values']]
    }
    hdense = [v * alpha for v in dense]
    return hdense, hsparse

import numpy as np

def l2_normalize(vector: list[float]) -> list[float]:
    """Normalizes a vector to length 1 so Dot Product acts like Cosine Similarity."""
    vec_array = np.array(vector)
    norm = np.linalg.norm(vec_array)
    if norm == 0:
        return vector
    return (vec_array / norm).tolist()

# ==========================================
# TOOL SCHEMAS
# ==========================================

class VectorSearchInput(BaseModel):
    query: str = Field(
        ..., 
        description="The text query to search for. Formulate this as a natural language question or a set of specific keywords."
    )
    alpha: float = Field(
        default=0.5, 
        description="Controls the hybrid search balance. Use 1.0 for purely semantic/conceptual meaning. Use 0.0 for exact keyword matches (e.g., specific IDs, acronyms). Use 0.5 for a balanced mix."
    )
    doc_id: str = Field(
        description="The specific Document UUID to scope the search to. ALWAYS provide this if searching within a known document."
    )
    type: Optional[str] = Field(
        default=None, 
        description="Filter by content type. Options are typically 'text' or 'image'."
    )
    top_n: int = Field(
        default=5, 
        description="The number of relevant chunks to retrieve. Max allowed is 8."
    )

    # --- Page Filters ---
    page_eq: Optional[int] = Field(default=None, description="Filter to an exact page number.")
    page_gt: Optional[int] = Field(default=None, description="Filter to pages strictly greater than this number.")
    page_gte: Optional[int] = Field(default=None, description="Filter to pages greater than or equal to this number.")
    page_lt: Optional[int] = Field(default=None, description="Filter to pages strictly less than this number.")
    page_lte: Optional[int] = Field(default=None, description="Filter to pages less than or equal to this number.")
    page_range: Optional[List[int]] = Field(
        default=None, 
        description="Filter to a range of pages. Pass a list of two integers: [start_page, end_page]."
    )

    # --- Chunk Filters ---
    chunk_eq: Optional[int] = Field(default=None, description="Filter to an exact chunk index.")
    chunk_gt: Optional[int] = Field(default=None, description="Filter to chunk indices strictly greater than this number.")
    chunk_gte: Optional[int] = Field(default=None, description="Filter to chunk indices greater than or equal to this number.")
    chunk_lt: Optional[int] = Field(default=None, description="Filter to chunk indices strictly less than this number.")
    chunk_lte: Optional[int] = Field(default=None, description="Filter to chunk indices less than or equal to this number.")
    chunk_range: Optional[List[int]] = Field(
        default=None, 
        description="Filter to a range of chunk indices. Pass a list of two integers: [start_chunk, end_chunk]."
    )

class RetrieveChunksInput(BaseModel):
    doc_id: str = Field(..., description="The UUID of the document.")
    chunk_index: Optional[int] = Field(None, description="Fetch one specific chunk by its index.")
    chunk_range: Optional[List[int]] = Field(None, description="Fetch a sequence of chunks, e.g., [10, 14]. Max range is 5.")
    page_number: Optional[int] = Field(None, description="Fetch chunks belonging to a specific page.")
    number_of_chunks: int = Field(default=5, description="Number of chunks to retrieve when querying by page_number. Max 5.")

class DocSummariesInput(BaseModel):
    doc_ids: List[str] = Field(..., description="List of document UUIDs to retrieve summaries for. Maximum of 5.")

class PageSummariesInput(BaseModel):
    doc_id: str = Field(..., description="The UUID of the document.")
    page_numbers: List[int] = Field(..., description="List of page numbers to retrieve summaries for (e.g., [1, 2, 5]).")




# ==========================================
# FACTORY FUNCTION (DEPENDENCY INJECTION)
# ==========================================

def create_agent_tools() -> list:
    """
    Factory function to inject the database pool and vector store into the tools.
    Returns a list of initialized LangChain tools.
    """

    @tool("vector_search", args_schema=VectorSearchInput)
    async def vector_search(
        config: RunnableConfig,
        query: str,
        alpha: float = 0.5,  # ADDED: Optional alpha with 0.5 default
        doc_id: Optional[str] = None,
        type: Optional[str] = None,
        top_n: int = 5,

        page_eq: Optional[int] = None,
        page_gt: Optional[int] = None,
        page_gte: Optional[int] = None,
        page_lt: Optional[int] = None,
        page_lte: Optional[int] = None,
        page_range: Optional[list] = None,

        chunk_eq: Optional[int] = None,
        chunk_gt: Optional[int] = None,
        chunk_gte: Optional[int] = None,
        chunk_lt: Optional[int] = None,
        chunk_lte: Optional[int] = None,
        chunk_range: Optional[list] = None

        
    ) -> dict[str, list[dict] | str]:
        """
        Performs hybrid (semantic + keyword) search over indexed document chunks using the query and metadata filters.
        The `alpha` parameter controls the search type (0.0 = exact keyword match, 1.0 = pure semantic context, 0.5 = balanced).
        """
        index = config.get("configurable", {}).get("pinecone_index")

        warning_msg = ""
        if top_n > 8:
            top_n = 8
            warning_msg += "\n[SYSTEM WARNING: Requested top_n exceeded maximum limit. Results capped at 8.]\n"
            
        if alpha < 0.0 or alpha > 1.0:
             warning_msg += "\n[SYSTEM WARNING: Alpha must be between 0.0 and 1.0. It has been automatically adjusted.]\n"

        # -----------------------------
        # Vector Generation & Scaling
        # -----------------------------
        
        # 1. Generate the dense embedding (replace with your actual async embedding call)
        # Assuming `embeddings` is your LangChain embedder or similar
        raw_dense_vector = await embeddings.aembed_query(query) 
    
        # --- NEW: Normalize the query vector ---
        dense_vector = l2_normalize(raw_dense_vector)
        
        # 2. Generate the sparse BM25 vector
        sparse_vector = bm25_encoder.encode_queries(query)
        
        # 3. Scale them based on the agent's chosen alpha
        scaled_dense, scaled_sparse = hybrid_scale(dense_vector, sparse_vector, alpha)

        # -----------------------------
        # Metadata Filtering Logic
        # -----------------------------
        metadata_filter = {}

        if doc_id:
            metadata_filter["doc_id"] = doc_id
        if type:
            metadata_filter["type"] = type

        # page filters
        if page_eq is not None:
            metadata_filter["page"] = page_eq
        else:
            page_ops = {}
            if page_gt is not None: page_ops["$gt"] = page_gt
            if page_gte is not None: page_ops["$gte"] = page_gte
            if page_lt is not None: page_ops["$lt"] = page_lt
            if page_lte is not None: page_ops["$lte"] = page_lte
            if page_range:
                page_ops["$gte"] = page_range[0]
                page_ops["$lte"] = page_range[1]
            if page_ops:
                metadata_filter["page"] = page_ops

        # chunk filters
        if chunk_eq is not None:
            metadata_filter["chunk_index"] = chunk_eq
        else:
            chunk_ops = {}
            if chunk_gt is not None: chunk_ops["$gt"] = chunk_gt
            if chunk_gte is not None: chunk_ops["$gte"] = chunk_gte
            if chunk_lt is not None: chunk_ops["$lt"] = chunk_lt
            if chunk_lte is not None: chunk_ops["$lte"] = chunk_lte
            if chunk_range:
                chunk_ops["$gte"] = chunk_range[0]
                chunk_ops["$lte"] = chunk_range[1]
            if chunk_ops:
                metadata_filter["chunk_index"] = chunk_ops

        # -----------------------------
        # Execute Query (Native Pinecone)
        # -----------------------------
        
        # We use the native index.query instead of Langchain's VectorStore 
        # to explicitly pass both vector and sparse_vector types natively.
        print("query start")
        try:
            response = await index.query(
                vector=scaled_dense,
                sparse_vector=scaled_sparse,
                top_k=top_n,
                filter=metadata_filter if metadata_filter else None,
                include_metadata=True
            )
        except Exception as e:
            print(f"Failed to retrieve response: {e}")

        print("query end")
        matches = response.get("matches", [])

        if not matches:
            return {
                "results": [],
                "warning": "No relevant chunks found." + warning_msg
            }

        # -----------------------------
        # Format structured output
        # -----------------------------
        structured_chunks = []

        for match in matches:
            meta = match.get("metadata", {})
            structured_chunks.append(
                ChunkResult(
                    doc_id=meta.get("doc_id"),
                    page=int(meta.get("page")) if meta.get("page") is not None else None,
                    chunk_index=int(meta.get("chunk_index")) if meta.get("chunk_index") is not None else None,
                    type=meta.get("type"),
                    text=meta.get("text", "") # Ensure your ingest process maps the document text to a 'text' metadata field!
                )
            )

        return {
            "results": [chunk.dict() for chunk in structured_chunks],
            "warning": warning_msg.strip() if warning_msg else "None"
        }


    @tool("retrieve_document_chunks", args_schema=RetrieveChunksInput)
    async def retrieve_document_chunks(
        doc_id: str, 
        config: RunnableConfig,
        chunk_index: Optional[int] = None, 
        chunk_range: Optional[List[int]] = None, 
        page_number: Optional[int] = None, 
        number_of_chunks: int = 5
    ) -> str:
        """Fetches exact raw text chunks from the database using structural coordinates."""
        db_pool = config["configurable"]["db_pool"]
        
        async with db_pool.acquire() as conn:
            limit = min(number_of_chunks, 5)

            if chunk_index is not None:
                records = await conn.fetch(
                    "SELECT chunk_index, type, raw_text FROM document_chunks WHERE document_id = $1 AND chunk_index = $2",
                    doc_id, chunk_index
                )
            elif chunk_range is not None and len(chunk_range) == 2:
                start, end = chunk_range
                if end - start > 4:
                    end = start + 4 
                    
                records = await conn.fetch(
                    "SELECT chunk_index, type, raw_text FROM document_chunks WHERE document_id = $1 AND chunk_index BETWEEN $2 AND $3 ORDER BY chunk_index",
                    doc_id, start, end
                )
            elif page_number is not None:
                records = await conn.fetch(
                    "SELECT chunk_index, type, raw_text FROM document_chunks WHERE document_id = $1 AND page_number = $2 ORDER BY chunk_index LIMIT $3",
                    doc_id, page_number, limit
                )
            else:
                return "Error: You must provide either chunk_index, chunk_range, or page_number."

        if not records:
            return "No chunks found for the provided parameters."

        output = []
        for r in records:
            output.append(f"[Chunk {r['chunk_index']} | Type: {r['type']}]\n{r['raw_text']}\n")
            
        return "\n".join(output)


    @tool("retrieve_doc_summaries", args_schema=DocSummariesInput)
    async def retrieve_doc_summaries(doc_ids: List[str],config:RunnableConfig) -> str:
        """Retrieves the full executive summaries for multiple documents to get a high-level overview."""
        db_pool = config["configurable"]["db_pool"]

       
        if not doc_ids:
            return "Error: No document IDs provided."
            
        target_ids = doc_ids[:5]
        warning_msg = ""
        if len(doc_ids) > 5:
            warning_msg = "\n[SYSTEM WARNING: Requested more than 5 documents. Truncated to the first 5.]\n"
        
        async with db_pool.acquire() as conn:
            records = await conn.fetch(
                "SELECT id, full_summary FROM documents WHERE id = ANY($1::uuid[])",
                target_ids
            )

        if not records:
            return "No summaries found for the provided document IDs."

        output = []
        for r in records:
            output.append(f"=== Document ID: {r['id']} ===\n{r['full_summary']}\n")

        return "\n".join(output) + warning_msg


    @tool("retrieve_page_summaries", args_schema=PageSummariesInput)
    async def retrieve_page_summaries(doc_id: str, page_numbers: List[int],config:RunnableConfig) -> str:
        """Retrieves the generated summaries for specific pages within a document."""
        db_pool = config["configurable"]["db_pool"]

        
        if not page_numbers:
            return "Error: No page numbers provided."

        async with db_pool.acquire() as conn:
            records = await conn.fetch(
                "SELECT page_number, summary FROM document_pages WHERE document_id = $1 AND page_number = ANY($2::int[]) ORDER BY page_number",
                doc_id, page_numbers
            )

        if not records:
            return f"No page summaries found for pages {page_numbers} in document {doc_id}."

        output = []
        for r in records:
            output.append(f"--- Page {r['page_number']} Summary ---\n{r['summary']}\n")

        return "\n".join(output)


    @tool("get_session_documents")
    async def get_session_documents(config: RunnableConfig) -> str:
        """Use this tool first to find the exact doc_ids for the files the user is asking about."""
        db_pool = config["configurable"]["db_pool"]
        thread_id = config["configurable"]["thread_id"]
        
        async with db_pool.acquire() as conn:
            
            records = await conn.fetch(
                """SELECT id, name as filename, status, image_count, page_count 
                   FROM documents 
                   WHERE thread_id = $1""",
                uuid.UUID(thread_id)
            )
            
        if not records:
            return "No documents found in the current session."
            
        output = ["Active Documents in Session:"]
        for r in records:
            output.append(f"- Name: '{r['filename']}' | ID: {r['id']} | Status: {r['status']} | Image count:{r['image_count']} | Pages:{r['page_count']}")
            
        return "\n".join(output)

    # Return the bundled tools
    return [
        vector_search, 
        retrieve_document_chunks, 
        retrieve_doc_summaries, 
        retrieve_page_summaries, 
        get_session_documents
    ]