from typing import List, Optional
from pydantic import BaseModel, Field
from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig
import uuid

# ==========================================
# TOOL SCHEMAS
# ==========================================

class VectorSearchInput(BaseModel):
    doc_id: str = Field(..., description="The UUID of the document to search within.")
    query: str = Field(..., description="The semantic search query.")
    top_n: int = Field(default=5, description="Number of results to return. Maximum is 8.")

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

def create_agent_tools(vector_store) -> list:
    """
    Factory function to inject the database pool and vector store into the tools.
    Returns a list of initialized LangChain tools.
    """

    @tool("vector_search", args_schema=VectorSearchInput)
    async def vector_search(doc_id: str, query: str, top_n: int = 5) -> str:
        """Performs a semantic vector search on a specific document to find relevant chunks of text."""
        warning_msg = ""
        if top_n > 8:
            top_n = 8
            warning_msg = "\n[SYSTEM WARNING: Requested top_n exceeded maximum limit. Results capped at 8.]\n"

        results = await vector_store.asimilarity_search(
            query, 
            k=top_n, 
            filter={"doc_id": doc_id}
        )

        if not results:
            return f"No relevant information found in document {doc_id} for the query."

        formatted_results = []
        for i, doc in enumerate(results):
            meta = doc.metadata
            chunk_idx = meta.get("chunk_index", "Unknown")
            page_num = meta.get("page", "Unknown")
            
            block = (
                f"--- Result {i+1} ---\n"
                f"Page: {page_num} | Chunk Index: {chunk_idx}\n"
                f"Text: {doc.page_content}\n"
            )
            formatted_results.append(block)

        return "\n".join(formatted_results) + warning_msg


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