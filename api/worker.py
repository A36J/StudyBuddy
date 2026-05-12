import os
import asyncio
import tempfile
import boto3
import uuid
import gc
import logging
import re
import time
import traceback
from collections import defaultdict
from dotenv import load_dotenv
from urllib.parse import urlparse
from pydantic import SecretStr
import base64
from typing import cast, List, Dict, Any

from botocore.config import Config

from langchain_opendataloader_pdf import OpenDataLoaderPDFLoader
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_core.prompts import PromptTemplate
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_pinecone import PineconeVectorStore
from langchain_core.documents import Document

load_dotenv()

# --- Logging Setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - [%(funcName)s] - %(message)s')
logger = logging.getLogger(__name__)

# --- Setup Clients ---
s3_client = boto3.client(
    's3',
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=os.getenv("AWS_REGION"),
    endpoint_url='https://s3.eu-north-1.amazonaws.com',
    config=Config(
        signature_version='s3v4',
        region_name=os.getenv("AWS_REGION"),
        s3={'addressing_style': 'virtual'} # <-- Forces bucket.s3.region.amazonaws.com
    )
)

api_key = os.getenv("OPENROUTER_API_KEY")
if not api_key:
    raise ValueError("OPENROUTER_API_KEY is not set in the environment.")

llm = ChatOpenAI(
    model="google/gemini-3.1-flash-lite",
    api_key=SecretStr(api_key),
    base_url="https://openrouter.ai/api/v1",
    
    temperature=0.2,
    default_headers={"HTTP-Referer": "http://localhost:5173", "X-Title": "LangGraph Search Agent"}
)

vision_llm = ChatOpenAI(
    model="google/gemini-3.1-flash-lite",  
    api_key=SecretStr(api_key),
    base_url="https://openrouter.ai/api/v1",
    temperature=0.0,
    max_retries=1,
    timeout=45.0
)

embeddings = OpenAIEmbeddings(
    model="nvidia/llama-nemotron-embed-vl-1b-v2:free",
    api_key=SecretStr(api_key),
    base_url="https://openrouter.ai/api/v1",
    model_kwargs={"encoding_format": "float"},              
    check_embedding_ctx_length=False
)

def remove_axis_noise(text: str) -> str:
    cleaned_lines = []
    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped: continue
        if len(stripped) == 1: continue
        if re.fullmatch(r"[0-9.\-]+", stripped): continue
        if len(stripped) <= 4 and any(c.isdigit() for c in stripped): continue
        cleaned_lines.append(line)
    return "\n".join(cleaned_lines)


async def async_summarize(text: str, prompt_template: PromptTemplate, semaphore: asyncio.Semaphore, current_llm) -> str:
    async with semaphore:
        chain = prompt_template | current_llm
        try:
            response = await chain.ainvoke({"text": text})
            return response.content
        except Exception as e:
            logger.error(f"Summarization failed: {e}")
            return "Summary generation failed."

async def async_vision_summarize(img_id: str, data_uri: str, semaphore: asyncio.Semaphore) -> tuple[str, str]:
    messages = [{"role": "user", "content": [
        {"type": "text", "text": "Describe the informational content of this image concisely. Focus on data, charts, or key concepts."},
        {"type": "image_url", "image_url": {"url": data_uri}}
    ]}]
    async with semaphore:
        try:
            response = await asyncio.wait_for(vision_llm.ainvoke(messages), timeout=45.0)
            return img_id, str(response.content)
        except asyncio.TimeoutError:
            return img_id, "[Image extraction failed: API Timeout]"
        except Exception:
            return img_id, "[Image extraction failed: API Error]"
        
async def async_s3_download(bucket: str, key: str, tmp_path: str):
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, s3_client.download_file, bucket, key, tmp_path)


async def async_process_pdf_logic(s3_url: str, doc_id: str, max_concurrency: int = 5):
    llm_semaphore = asyncio.Semaphore(max_concurrency)
    parsed_url = urlparse(s3_url)
    bucket = parsed_url.netloc
    key = parsed_url.path.lstrip('/')
    tmp_path = os.path.join(tempfile.gettempdir(), f"{doc_id}.pdf")
    
    # Telemetry Tracking
    doc_stats = {
        "file_size_bytes": 0,
        "image_count": 0,
        "page_count": 0,
        "chunk_count": 0
    }
    page_stats = defaultdict(lambda: {"image_count": 0, "chunk_count": 0, "summary_length": 0})
    
    try:
        await async_s3_download(bucket, key, tmp_path)
        doc_stats["file_size_bytes"] = os.path.getsize(tmp_path)
        if doc_stats["file_size_bytes"] == 0:
            raise ValueError("Downloaded file is empty (0 bytes).")

        # --- NEW OpenDataLoader EXTRACTION LOGIC ---
        def extract_pdf_data(filepath):
            loader = OpenDataLoaderPDFLoader(
                file_path=filepath,
                format="markdown",
                # hybrid="docling-fast", 
                # hybrid_url="http://localhost:5002",
                # hybrid_mode="auto" 
            )
            documents = loader.load()
            
            extracted_pages = []
            for i, doc in enumerate(documents):
                # Map back to the expected dictionary structure for downstream regex processing
                page_no = doc.metadata.get("page", i + 1)
                extracted_pages.append({
                    "metadata": {"page": page_no},
                    "text": doc.page_content
                })
            
            return extracted_pages

        # Run the blocking extraction in a separate thread
        raw_pages = await asyncio.to_thread(extract_pdf_data, tmp_path)
        # -------------------------------------------

        doc_stats["page_count"] = len(raw_pages)

        text_splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=120, separators=["\n\n", "\n", ". ", " "])
        
        img_pattern = re.compile(r"(!\[[^\]]*\]\(data:image/[^;]+;base64,[^\)]+\))")
        
        atomic_chunks = []
        vision_tasks = []
        global_chunk_index = 1

        for page in raw_pages:
            page_no = page.get("metadata", {}).get("page", 1)
            raw_text = page.get("text", "")
            parts = img_pattern.split(raw_text)

            for part in parts:
                part = part.strip()
                if not part: continue
                
                if part.startswith("![") and "data:image" in part:
                    match = re.match(r"!\[([^\]]*)\]\((data:image/[^;]+;base64,[^\)]+)\)", part)
                    if match:
                        data_uri = match.group(2)
                        img_id = f"IMG_{uuid.uuid4().hex[:8]}"
                        
                        doc_stats["image_count"] += 1
                        page_stats[page_no]["image_count"] += 1
                        vision_tasks.append(async_vision_summarize(img_id, data_uri, llm_semaphore))
                        
                        atomic_chunks.append(Document(
                            page_content=f"[{img_id}]",
                            metadata={"doc_id": doc_id, "page": page_no, "type": "image", "chunk_index": global_chunk_index}
                        ))
                        global_chunk_index += 1
                else:
                   
                    cleaned_text = remove_axis_noise(part)
                    if not cleaned_text.strip(): continue
                        
                    text_splits = text_splitter.split_text(cleaned_text)
                    for split in text_splits:
                        atomic_chunks.append(Document(
                            page_content=split,
                            metadata={"doc_id": doc_id, "page": page_no, "type": "text", "chunk_index": global_chunk_index}
                        ))
                        global_chunk_index += 1

        doc_stats["chunk_count"] = len(atomic_chunks)
        for chunk in atomic_chunks:
            page_stats[chunk.metadata["page"]]["chunk_count"] += 1

        if not atomic_chunks:
            raise ValueError("Extraction resulted in 0 chunks.")

        # Resolve Vision
        if vision_tasks:
            vision_results = await asyncio.gather(*vision_tasks) 
            vision_map = dict(vision_results) 
            
            for chunk in atomic_chunks:
                if chunk.metadata.get("type") == "image":
                    img_id = chunk.page_content.strip("[]")
                    if img_id in vision_map:
                        chunk.page_content = f"Image Description: {vision_map[img_id]}"
                    else:
                        chunk.page_content = "Image extraction failed or timed out."

        
        # Trigger Pinecone Upload
        vector_store = PineconeVectorStore(index_name=os.getenv("PINECONE_INDEX_NAME"), embedding=embeddings)
        upload_task = asyncio.create_task(asyncio.to_thread(vector_store.add_documents, atomic_chunks))

        # Page Summarization
        page_texts = defaultdict(list)
        for chunk in atomic_chunks:
            page_texts[chunk.metadata["page"]].append(chunk.page_content)

        summary_prompt = PromptTemplate.from_template("Summarize the following text concisely:\n\n{text}")
        
        async def aggregate_summary(key, texts, target_dict):
            combined_text = "\n\n".join(texts)
            res = await async_summarize(combined_text, summary_prompt, llm_semaphore, llm)
            target_dict[key] = res
            page_stats[key]["summary_length"] = len(res)

        final_page_summaries = {}
        t0 = time.perf_counter()
        level_1_tasks = [aggregate_summary(page, texts, final_page_summaries) for page, texts in page_texts.items()]
        await asyncio.gather(*level_1_tasks)
        logger.info(f"Page summaries took {time.perf_counter() - t0:.2f}s")

        # Full Summarization
        sorted_page_summaries = [f"Page {page}:\n{summary}" for page, summary in sorted(final_page_summaries.items())]
        t0 = time.perf_counter()
        full_summary = await async_summarize("\n\n".join(sorted_page_summaries), PromptTemplate.from_template("Provide a comprehensive executive summary based on the following page-by-page summaries:\n\n{text}"), llm_semaphore, llm)
        logger.info(f"Full summary took {time.perf_counter() - t0:.2f}s")

        t0 = time.perf_counter()
        await upload_task 
        logger.info(f"Pinecone upload took {time.perf_counter() - t0:.2f}s")

        return {
            "page_summaries": final_page_summaries,
            "full_summary": full_summary,
            "chunks": atomic_chunks,
            "doc_stats": doc_stats,
            "page_stats": page_stats
        }

    except Exception as e:
        logger.error(f"Exception caught in pipeline: {str(e)}")
        raise e 
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        gc.collect()


async def process_pdf_pipeline(doc_id: str, s3_url: str, db_pool):
    start_time = time.perf_counter()
    doc_uuid = uuid.UUID(doc_id)
    
    try:
        logger.info(f"--- Triggered Background Task for {doc_id} ---")
        results = await async_process_pdf_logic(s3_url, doc_id, max_concurrency=1)
        
        processing_time_ms = int((time.perf_counter() - start_time) * 1000)
        doc_stats = results["doc_stats"]
        page_stats = results["page_stats"]
        chunks = results["chunks"]

        logger.info("Saving metadata, chunks, and summaries to Neon DB...")
        async with db_pool.acquire() as conn:
            async with conn.transaction():
                
                # 1. Update master document record
                await conn.execute(
                    """UPDATE documents SET 
                        status = 'ready', 
                        full_summary = $1,
                        image_count = $2,
                        file_size_bytes = $3,
                        processing_time_ms = $4,
                        page_count = $5,
                        chunk_count = $6
                       WHERE id = $7""", 
                    results["full_summary"], doc_stats["image_count"], doc_stats["file_size_bytes"], 
                    processing_time_ms, doc_stats["page_count"], doc_stats["chunk_count"], doc_uuid
                )
                
                # 2. Insert page summaries with stats
                for page, summary in results["page_summaries"].items():
                    stats = page_stats[page]
                    await conn.execute(
                        """INSERT INTO document_pages 
                           (document_id, page_number, summary, image_count, chunk_count, summary_length) 
                           VALUES ($1, $2, $3, $4, $5, $6)""",
                        doc_uuid, page, summary, stats["image_count"], stats["chunk_count"], stats["summary_length"]
                    )
                
                # 3. Batch insert raw chunks 
                chunk_records = [
                    (doc_uuid, c.metadata["page"], c.metadata["chunk_index"], c.metadata["type"], c.page_content)
                    for c in chunks
                ]
                await conn.executemany(
                    """INSERT INTO document_chunks 
                       (document_id, page_number, chunk_index, type, raw_text) 
                       VALUES ($1, $2, $3, $4, $5)""",
                    chunk_records
                )
                
        logger.info(f"SUCCESS: Processing complete for {doc_id} in {processing_time_ms}ms")
            
    except Exception as e:
        processing_time_ms = int((time.perf_counter() - start_time) * 1000)
        error_trace = traceback.format_exc()
        logger.error(f"FAILURE: Pipeline failed for {doc_id}. Setting status to 'error'.")
        
        async with db_pool.acquire() as conn:
            await conn.execute(
                "UPDATE documents SET status = 'error', error_logs = $1, processing_time_ms = $2 WHERE id = $3", 
                error_trace, processing_time_ms, doc_uuid
            )