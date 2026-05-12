
import asyncio
import sys


if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


import json
import uuid
import boto3
from botocore.config import Config
import asyncpg
import os
import socket
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, BackgroundTasks, HTTPException, Request,Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from contextlib import asynccontextmanager

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langchain_core.runnables import RunnableConfig
from api.agent import build_agent 
from api.worker import process_pdf_pipeline

from langfuse import get_client
from langfuse.langchain import CallbackHandler

load_dotenv()

# Initialize Langfuse client
langfuse = get_client()


# --- 1. CONFIG & LIFECYCLE ---
DATABASE_URL = os.getenv("DATABASE_URL")  # Your Neon DB URL

S3_BUCKET = os.getenv("S3_BUCKET_NAME")
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



# 2. Lifespan Setup
@asynccontextmanager
async def lifespan(app: FastAPI):
    max_retries = 3
    retry_delay = 2 
    
    # 1. Setup Custom UI Pool (asyncpg)
    for attempt in range(max_retries):
        try:
            app.state.db_pool = await asyncpg.create_pool(DATABASE_URL)
            print("Pool A (asyncpg) connected successfully!")
            break 
        except socket.gaierror as e:
            print(f"DNS lookup failed (Attempt {attempt + 1}). Retrying in {retry_delay}s...")
            if attempt == max_retries - 1: raise e
            await asyncio.sleep(retry_delay)
        except Exception as e:
            raise e

    # 2. Setup LangGraph Pool (psycopg v3 via from_conn_string)
  
    async with AsyncPostgresSaver.from_conn_string(DATABASE_URL or " " ) as checkpointer:
        
        await checkpointer.setup()
        
        # Compile the agent and attach to app state
        app.state.agent_executor = build_agent(checkpointer)
        print("Pool B (psycopg) connected! LangGraph agent compiled and ready.")
        
        # 3. Yield control to FastAPI to run the application
        yield 
        
    
    if hasattr(app.state, 'db_pool') and app.state.db_pool:
        await app.state.db_pool.close()

app = FastAPI(title="StudyBuddy API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    #allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# --- 2. MODELS ---
class ChatRequest(BaseModel):
    query: str

class ChatCreate(BaseModel):
    id: str
    user_id: str
    title: str

class ChatUpdate(BaseModel):
    title: str

class PresignedUrlRequest(BaseModel):
    user_id: str
    filename: str
    thread_id: str  

class NoteCreate(BaseModel):
    id: str
    user_id: str
    title: str
    content: list = []

class NoteUpdate(BaseModel):
    user_id: str
    content: list
    title: Optional[str] = None

# --- 3. THREADS & MESSAGES ENDPOINTS ---

@app.get("/api/threads")
async def get_threads(request: Request, user_id: str):
    async with request.app.state.db_pool.acquire() as conn:
        records = await conn.fetch(
            "SELECT id, title, created_at FROM threads WHERE user_id = $1 ORDER BY created_at DESC", 
            user_id
        )
        return [{"id": str(r["id"]), "title": r["title"]} for r in records]

@app.post("/api/threads")
async def create_thread(request: Request, thread: ChatCreate):
    async with request.app.state.db_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO threads (id, user_id, title) VALUES ($1, $2, $3)",
            uuid.UUID(thread.id), thread.user_id, thread.title
        )
        return {"status": "success", "id": thread.id}


@app.get("/api/threads/{thread_id}/messages")
async def get_messages(request: Request, thread_id: str):
    async with request.app.state.db_pool.acquire() as conn:
        records = await conn.fetch(
            """
            SELECT id, role, content, reasoning, tool_calls 
            FROM messages 
            WHERE thread_id = $1 
            ORDER BY created_at ASC
            """,
            uuid.UUID(thread_id)
        )
        
        messages = []
        for r in records:
            
            raw_tool_calls = r["tool_calls"]
            parsed_tool_calls = []
            if isinstance(raw_tool_calls, str):
                try: parsed_tool_calls = json.loads(raw_tool_calls)
                except json.JSONDecodeError: pass
            elif raw_tool_calls is not None:
                parsed_tool_calls = raw_tool_calls

            messages.append({
                "id": str(r["id"]), 
                "role": r["role"], 
                "content": r["content"],
                "reasoning": r["reasoning"] or "", 
                "toolCalls": parsed_tool_calls     
            })
            
        return messages
    
@app.get("/api/threads/{thread_id}/sources")
async def get_thread_sources(request: Request, thread_id: str):
    async with request.app.state.db_pool.acquire() as conn:
       
        records = await conn.fetch(
            """
            SELECT id, name, status, is_active 
            FROM documents 
            WHERE thread_id = $1 
            ORDER BY created_at DESC
            """, 
            thread_id
        )
        
        # Map the database records to the SourceFile interface expected by the React frontend
        sources = [
            {
                "id": str(r["id"]),
                "name": r["name"],
                "status": r["status"],
                "chatId": thread_id, # Maps back to the frontend's chatId
                "isActive": r["is_active"] 
            } 
            for r in records
        ]
        
        return {"sources": sources}
    
@app.patch("/api/documents/{doc_id}/toggle")
async def toggle_document_status(request: Request, doc_id: str, is_active: bool = Body(embed=True)):
    async with request.app.state.db_pool.acquire() as conn:
        # Update the is_active status in the database
        await conn.execute(
            "UPDATE documents SET is_active = $1 WHERE id = $2", 
            is_active, 
            doc_id
        )
        return {"status": "success", "is_active": is_active}

# --- RENAME CHAT ---
@app.patch("/api/threads/{thread_id}")
async def update_thread_title(request: Request, thread_id: str, thread_update: ChatUpdate):
    async with request.app.state.db_pool.acquire() as conn:
        
        result = await conn.execute(
            "UPDATE threads SET title = $1 WHERE id = $2",
            thread_update.title, uuid.UUID(thread_id)
        )
        
        # result is a string like "UPDATE 1" or "UPDATE 0"
        if result == "UPDATE 0":
            raise HTTPException(status_code=404, detail="Thread not found")
            
        return {"status": "success", "title": thread_update.title}

# --- DELETE CHAT ---
@app.delete("/api/threads/{thread_id}")
async def delete_thread(request: Request, thread_id: str):
    async with request.app.state.db_pool.acquire() as conn:
        
        result = await conn.execute(
            "DELETE FROM threads WHERE id = $1",
            uuid.UUID(thread_id)
        )
        
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Thread not found")
            
        return {"status": "success", "message": f"Thread {thread_id} deleted"}
    
# --- 4. THE STREAMING CHAT ENDPOINT ---

@app.post("/api/threads/{thread_id}/chat")
async def execute_search_agent(request: Request, thread_id: str, chat_req: ChatRequest):
    pool = request.app.state.db_pool
    agent_executor = request.app.state.agent_executor
    langfuse_handler = CallbackHandler()
    user_query = chat_req.query
    config: RunnableConfig = {"configurable": {"thread_id": thread_id, "db_pool": pool},"callbacks": [langfuse_handler]}

    async def event_stream():
        # Track the order of runs to save them chronologically
        runs_order = []
        # Store distinct message data per run
        runs_data = {} 
        
        try:
            async for event in agent_executor.astream_events(
                {"messages": [("user", user_query)]},
                config=config,
                version="v2"
            ):
                kind = event["event"]
                event_data = event.get("data", {})
                run_id = event.get("run_id")
                
                # 1. A new LLM Invocation starts -> Signal frontend to create a new bubble
                if kind == "on_chat_model_start":
                    if run_id not in runs_data:
                        runs_order.append(run_id)
                        runs_data[run_id] = {"content": "", "reasoning": "", "tool_calls": []}
                        yield f"data: {json.dumps({'type': 'new_message', 'run_id': run_id})}\n\n"

                # 2. Stream content and reasoning to that specific run_id
                elif kind == "on_chat_model_stream":
                    chunk = event_data.get("chunk")
                    if chunk:
                        if hasattr(chunk, "content") and chunk.content:
                            content = chunk.content
                            runs_data[run_id]["content"] += content
                            yield f"data: {json.dumps({'type': 'content', 'content': content, 'run_id': run_id})}\n\n"
                        
                        if hasattr(chunk, "additional_kwargs") and "reasoning_content" in chunk.additional_kwargs:
                            reasoning = chunk.additional_kwargs["reasoning_content"]
                            if reasoning:
                                runs_data[run_id]["reasoning"] += reasoning
                                yield f"data: {json.dumps({'type': 'reasoning', 'content': reasoning, 'run_id': run_id})}\n\n"
                
                # 3. Stream tool calls to that specific run_id
                elif kind == "on_tool_start":
                    tool_payload = {
                        "name": event["name"],
                        "args": event_data.get("input", {})
                    }
                    
                    # Grab the ID of the most recent LLM invocation
                    if runs_order:
                        latest_llm_run_id = runs_order[-1]
                        runs_data[latest_llm_run_id]["tool_calls"].append(tool_payload)
                        
                        # Stream it to the frontend using the LLM's run_id so the UI attaches it to the right bubble
                        yield f"data: {json.dumps({'type': 'tool_call', **tool_payload, 'run_id': latest_llm_run_id})}\n\n"
            
            # --- STREAM FINISHED: Save everything to DB ---
            async with pool.acquire() as conn:
                async with conn.transaction(): 
                    # 1. Save User Message
                    await conn.execute(
                        "INSERT INTO messages (thread_id, role, content) VALUES ($1, 'user', $2)",
                        uuid.UUID(thread_id), user_query
                    )

                    # 2. Save each AI run as a completely distinct message row
                    for r_id in runs_order:
                        run_info = runs_data[r_id]
                        await conn.execute(
                            """
                            INSERT INTO messages (thread_id, role, content, reasoning, tool_calls) 
                            VALUES ($1, 'assistant', $2, $3, $4)
                            """,
                            uuid.UUID(thread_id), 
                            run_info["content"],
                            run_info["reasoning"] if run_info["reasoning"] else None,
                            json.dumps(run_info["tool_calls"]) if run_info["tool_calls"] else None
                        )

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

# --- 5. DOCUMENT PROCESSING ENDPOINTS ---

@app.post("/api/documents/presigned-url")
async def get_presigned_url(request: Request, req: PresignedUrlRequest):
    doc_id = str(uuid.uuid4())
    s3_key = f"uploads/{req.user_id}/{doc_id}_{req.filename}"
    
    # Generate S3 Presigned URL
    presigned_url = s3_client.generate_presigned_url(
        'put_object',
        Params={'Bucket': S3_BUCKET, 'Key': s3_key, 'ContentType': 'application/pdf'},
        ExpiresIn=3600
    )
    
    # Save metadata 
    async with request.app.state.db_pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO documents (id, user_id, thread_id, name, status, s3_url) 
               VALUES ($1, $2, $3, $4, 'uploading', $5)""",
            uuid.UUID(doc_id), 
            req.user_id, 
            uuid.UUID(req.thread_id),
            req.filename, 
            f"s3://{S3_BUCKET}/{s3_key}"
        )
        
    return {"uploadUrl": presigned_url, "docId": doc_id}


@app.post("/api/documents/{doc_id}/process")
async def start_processing(request: Request, doc_id: str, background_tasks: BackgroundTasks):
    async with request.app.state.db_pool.acquire() as conn:
        # Get the S3 URL we saved during the presigned URL step
        s3_url = await conn.fetchval(
            "SELECT s3_url FROM documents WHERE id = $1", 
            uuid.UUID(doc_id)
        )
        
        await conn.execute(
            "UPDATE documents SET status = 'processing' WHERE id = $1", 
            uuid.UUID(doc_id)
        )
        
    # Pass the URL and DB pool to the worker
    background_tasks.add_task(process_pdf_pipeline, doc_id, s3_url, request.app.state.db_pool)
    return {"status": "Processing started"}

@app.get("/api/documents/{doc_id}/status")
async def check_doc_status(request: Request, doc_id: str):
    async with request.app.state.db_pool.acquire() as conn:
        status = await conn.fetchval(
            "SELECT status FROM documents WHERE id = $1", 
            uuid.UUID(doc_id)
        )
        return {"status": status}

@app.get("/api/notes")
async def get_notes(request: Request, user_id: str):
    async with request.app.state.db_pool.acquire() as conn:
        
        records = await conn.fetch(
            "SELECT id, title, content, created_at, updated_at FROM notes WHERE user_id = $1 ORDER BY updated_at DESC", 
            user_id
        )
        return [
            {
                "id": str(r["id"]), 
                "title": r["title"], 
                "content": json.loads(r["content"]) if isinstance(r["content"], str) else r["content"], 
                "updated_at": r["updated_at"]
            } for r in records
        ]

@app.post("/api/notes")
async def create_note(request: Request, note: NoteCreate):
    async with request.app.state.db_pool.acquire() as conn:
        content_json = json.dumps(note.content)
        await conn.execute(
            """
            INSERT INTO notes (id, user_id, title, content, created_at, updated_at) 
            VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
            """,
            uuid.UUID(note.id), note.user_id, note.title, content_json
        )
        return {"status": "success", "id": note.id}

@app.put("/api/notes/{note_id}")
async def update_note(request: Request, note_id: str, note: NoteUpdate):
    async with request.app.state.db_pool.acquire() as conn:
        content_json = json.dumps(note.content)
        

        if note.title:
            await conn.execute(
                """
                UPDATE notes 
                SET title = $1, content = $2::jsonb, updated_at = NOW() 
                WHERE id = $3 AND user_id = $4
                """,
                note.title, content_json, uuid.UUID(note_id), note.user_id
            )
        else:
            await conn.execute(
                """
                UPDATE notes 
                SET content = $1::jsonb, updated_at = NOW() 
                WHERE id = $2 AND user_id = $3
                """,
                content_json, uuid.UUID(note_id), note.user_id
            )
            
        return {"status": "success", "id": note_id}

@app.delete("/api/notes/{note_id}")
async def delete_note(request: Request, note_id: str, user_id: str):
    async with request.app.state.db_pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM notes WHERE id = $1 AND user_id = $2", 
            uuid.UUID(note_id), user_id
        )
        return {"status": "success", "id": note_id}

# --- 6. THE BACKGROUND WORKER ---

# async def process_pdf_pipeline(doc_id: str, db_pool):
#     """
#     This runs in the background. It will not block your API.
#     """
#     try:
#         print(f"Starting heavy processing for document {doc_id}...")
        
#         # 1. Download from S3
#         # 2. Extract Text & Detect Sections (PyMuPDF / Unstructured)
#         # 3. Generate Vector Embeddings
#         # 4. Upload to Pinecone
#         # 5. Generate Hierarchical Summaries via LLM
#         # 6. Save summaries to Postgres
        
#         # Simulate processing time
#         await asyncio.sleep(5) 
        
#         print(f"Processing complete for {doc_id}!")
        
#         # Update DB to ready
#         async with db_pool.acquire() as conn:
#             await conn.execute("UPDATE documents SET status = 'ready' WHERE id = $1", uuid.UUID(doc_id))
            
#     except Exception as e:
#         print(f"Error processing {doc_id}: {e}")
#         async with db_pool.acquire() as conn:
#             await conn.execute("UPDATE documents SET status = 'error' WHERE id = $1", uuid.UUID(doc_id))