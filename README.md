# StudyBuddy

StudyBuddy is a full-stack AI-powered research assistant. It leverages a high-performance **FastAPI** backend and a modern **Vite + React** frontend to provide an integrated environment for AI-driven research, note-taking, and thread management.

## Capabilities
- **AI Chat & Research:** Advanced threading system powered by LangChain and LangGraph.
- **Note Management:** Create and organize notes linked directly to your research context.
- **Vector Search:** High-speed document retrieval and context-awareness via Pinecone.
- **Unified Deployment:** Single-click deployment architecture designed for Vercel Serverless.

## Tech Stack
- **Frontend:** React, Vite, TypeScript, Tailwind CSS.
- **Backend:** Python 3.12, FastAPI, PostgreSQL (asyncpg).
- **AI/Data:** LangGraph, OpenAI, Pinecone, PyMuPDF.

---

## 🚀 Quick Start

### 1. Installation & Setup
Clone the repository and run the automated setup command to install both Node modules and the Python virtual environment:

\`\`\`bash
git clone https://github.com/A36J/StudyBuddy.git
cd studybuddy

# Installs frontend dependencies and creates/populates backend venv
npm run setup
\`\`\`

### 3. Environment Variables
Create a \`.env\` file in the root directory based on the example provided:

\`\`\`bash
cp .env.example .env
\`\`\`
*Make sure to fill in your \`OPENROUTER_API_KEY\`, \`PINECONE_API_KEY\`, and \`DATABASE_URL\`.*

### 4. Run Development Server
Start the entire stack (Frontend + Backend) with a single command:

\`\`\`bash
npm run dev
\`\`\`

---

## Features left to do

### Advanced RAG Pipeline (Hybrid + Reranking)
* **Hybrid Search:** Implementing a combination of Semantic (Vector) search and Keyword (BM25) search to capture both conceptual meaning and exact terminology.
* **Precision Reranking:** Integrating **Cross-Encoders** (via Cohere or BGE-Reranker) to re-evaluate the top $k$ retrieved documents, significantly reducing hallucinations.
* **Improved Document Loading:** Migrating from basic loaders to **opendataloader** for superior handling of complex tables, charts, and multi-column PDF layouts.

### Agent Architecture (Supervisor + Workers)
Moving away from linear DAGs to a **Hierarchical Multi-Agent System**:
* **Supervisor Agent:** A centralized orchestrator that analyzes user intent and routes tasks to specialized workers.
* **Research Worker:** Specialized in high-depth vector database querying and synthesis.


###  Security & Auth
* **Authentication:** Implementing **Clerk** (via a decoupled auth flow) to support secure user sessions and private research siloes.
