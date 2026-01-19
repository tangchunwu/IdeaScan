# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **Agent-based Business Idea Validator** that uses a multi-agent architecture with MCP (Model Context Protocol) servers to validate business ideas through social media research. The system scrapes Xiaohongshu (Little Red Book) for data, analyzes it with LLMs, and generates comprehensive market validation reports.

**Core Workflow:**
1. Generate search keywords from business idea (LLM)
2. Scrape relevant posts and comments from Xiaohongshu
3. Analyze content for pain points, solutions, and market signals
4. Generate comprehensive validation report with scores

## Quick Start

### Installation

```bash
cd agent_system
pip install -r requirements.txt
```

### Configuration

Create/edit `.env` file in `agent_system/`:

```env
# Required API Keys
OPENAI_API_KEY="your_openai_api_key"
OPENAI_BASE_URL="https://api.openai.com/v1"  # or use proxy like https://oa.api2d.net/v1
TIKHUB_TOKEN="your_tikhub_token"  # For Xiaohongshu data via TikHub

# Optional settings
SCRAPER_PAGES_PER_KEYWORD=2
SCRAPER_COMMENTS_PER_NOTE=20
ANALYZER_MAX_POSTS=20
REPORT_OUTPUT_DIR=reports
```

### Running the System

```bash
# Command line with argument
python run_agent.py 在深圳卖陈皮

# Interactive mode
python run_agent.py

# Fast mode (less data, faster execution)
# Select 'y' when prompted
```

**Two modes:**
- **Full mode**: 3 keywords × 2 pages × 20 comments
- **Fast mode**: Direct user input as keyword × 1 page × 5 comments

### Testing

```bash
# End-to-end test
python tests/test_e2e.py

# Integration test
python tests/test_integration.py
```

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────┐
│                    OrchestratorAgent                    │
│         (Main workflow coordination & task dispatch)     │
└─────────────────────────────────────────────────────────┘
                          │
                          ├── KeywordAgent (LLM keyword generation)
                          ├── ScraperAgent (Xiaohongshu scraping)
                          ├── AnalyzerAgent (AI content analysis)
                          └── ReporterAgent (HTML report generation)
                          │
        ┌─────────────────┴─────────────────┐
        │                                     │
   ┌────▼────┐  ┌────────────┐  ┌──────────▼──┐
   │ XHS MCP │  │   LLM MCP   │  │  Storage    │
   │ Server  │  │   Server    │  │  MCP Server │
   └────┬────┘  └────────────┘  └─────────────┘
        │                                     │
    TikHub API                           OpenAI API
```

### Key Components

**1. MCP Servers** (`mcp_servers/`)
- `xhs_server.py`: TikHub API client for Xiaohongshu data (search notes, fetch comments)
- `llm_server.py`: OpenAI API wrapper for LLM calls (structured output with Pydantic)
- `storage_server.py`: File-based checkpoint/state persistence

**2. Agent System** (`agents/`)
- `base_agent.py`: Abstract base class for all agents with lifecycle management
- `orchestrator.py`: **Main entry point** - creates execution plan and coordinates subagents
- `context_store.py`: Shared state management between agents
- `config.py`: Configuration management from .env, YAML, or defaults

**3. Subagents** (`agents/subagents/`)
- `keyword_agent.py`: Uses LLM to generate search keywords from business idea
- `scraper_agent.py`: Scrapes Xiaohongshu posts with comments (via TikHub API)
- `analyzer_agent.py`: Analyzes posts/comments for market insights
- `reporter_agent.py`: Generates HTML validation reports

**4. Skills** (`agents/skills/`)
Each subagent has corresponding skills files containing actual business logic:
- `keyword_skills.py`: Prompt templates and LLM calls
- `scraper_skills.py`: Scraping orchestration with rate limiting
- `analyzer_skills.py`: Analysis prompts and batch processing
- `reporter_skills.py`: HTML template rendering

**5. Data Models** (`models/`)
- `agent_models.py`: TaskResult, ExecutionPlan, ProgressUpdate, OrchestratorState
- `context_models.py`: RunContext, ContextQuery, AgentState
- `business_models.py`: XhsNoteModel, XhsCommentModel, PostWithComments, XhsPostAnalysis, CombinedAnalysis

### Execution Flow

1. **run_agent.py** entry point → OrchestratorAgent
2. Orchestrator creates ExecutionPlan with 4-5 steps (depending on fast/full mode)
3. Each step delegated to appropriate subagent via `agent.execute(task, context)`
4. Subagents call MCP servers for external operations (API calls, storage)
5. Results passed through shared context between steps
6. Final result saved as HTML report in `reports/` directory

**Key pattern:** Agents are thin wrappers - business logic lives in Skills modules

### Fast Mode vs Full Mode

**Fast Mode** (`use_user_input_as_keyword=True`):
- Skips keyword generation step
- Uses user input directly as search keyword
- 1 page × 5 comments
- 4 total steps

**Full Mode** (`use_user_input_as_keyword=False`):
- Generates 3 keywords via LLM
- 2 pages per keyword × 20 comments
- 5 total steps (includes keyword generation)

## Checkpoint System

The system automatically saves checkpoints at critical stages in `agent_context/checkpoints/{business_idea}_{timestamp}/`:

```
└── {idea}_{timestamp}/
    ├── scraping_complete.json          # After scraping finishes
    ├── analysis_complete.json          # After analysis finishes
    └── combined_analysis_complete.json # Final combined analysis
```

Each checkpoint contains the full execution state, enabling:
- Resume from failure
- Debug intermediate results
- Audit trail of execution

**Note:** Checkpoint saving is handled by MCP Storage Server

## Important Implementation Details

### 1. Async/Await Pattern
All agents and MCP servers use async/await. The main entry point `run_agent.py` uses `asyncio.run()` to execute the async workflow.

### 2. MCP Integration
MCP servers are started before Orchestrator and passed via `mcp_clients` dict:
```python
mcp_clients = {
    "xhs": xhs_server,
    "llm": llm_server,
    "storage": storage_server
}
```

Agents access MCP tools via `self.mcp_clients["server_name"]`

### 3. Context Passing
Shared context flows between steps:
- `keywords`: Generated or provided
- `posts_with_comments`: Scraped data with embedded comments
- `posts_with_comments_analyses`: Per-post analysis results
- `analysis`: Combined analysis with scores
- `report`: Final HTML report

### 4. Progress Tracking
OrchestratorAgent supports progress callbacks:
```python
def progress_callback(update):
    print(f"[{update.progress*100:.1f}%] {update.message}")

orchestrator.set_progress_callback(progress_callback)
```

### 5. Error Handling & Timeouts
- Each ExecutionStep has timeout (default: 60-900s depending on operation)
- Timeout triggers `asyncio.CancelledError` caught by orchestrator
- Retry logic with exponential backoff for retryable steps
- Failed steps marked but workflow continues if possible

### 6. Logging
Structured logging via `agents/logging_config.py`:
- `RequestLogger`: Logs all API calls with request/response details
- Log level configurable via .env: `logging.level=INFO`
- Each agent has its own logger: `logging.getLogger("agent.{name}")`

## Data Models

**PostWithComments** (models/business_models.py:65)
- Critical model that combines note data + embedded comments
- Used for unified analysis (post + comments together)
- Replaces separate post/comment analysis

**CombinedAnalysis** (models/business_models.py)
- Final analysis output with scores (0-100)
- Contains: pain_points, solutions, market_opportunities, recommendations
- Includes market_validation_summary and overall_score

**ExecutionPlan** (models/agent_models.py)
- Defines workflow steps with dependencies
- Each step has: agent_name, task, params, timeout, depends_on

## Configuration

All config centralized in `agents/config.py`:
- Supports .env files (auto-detected in multiple locations)
- Nested config access: `config.get('mcp.xhs.auth_token')`
- Type-safe config objects: `XHSMCPConfig`, `LLMConfig`, etc.

**Config file search order:**
1. `.env` in current directory
2. `agent_system/.env`
3. Project root `.env`

**Required environment variables:**
- `OPENAI_API_KEY`: OpenAI API key (or compatible proxy)
- `TIKHUB_TOKEN`: TikHub token for Xiaohongshu data

**Optional variables:**
- `OPENAI_BASE_URL`: Alternative API endpoint
- `SCRAPER_PAGES_PER_KEYWORD`: Default 2
- `SCRAPER_COMMENTS_PER_NOTE`: Default 20
- `ANALYZER_MAX_POSTS`: Default 20

## Common Development Tasks

### Adding a New Agent

1. Create `agents/subagents/new_agent.py` inheriting from `BaseAgent`
2. Create `agents/skills/new_agent_skills.py` with business logic
3. Register in OrchestratorAgent._initialize_and_start_subagents()
4. Add to ExecutionPlan in OrchestratorAgent._create_execution_plan()
5. Add context passing logic in _update_shared_context()

### Modifying Analysis Prompts

Edit `agents/skills/analyzer_skills.py`:
- `POST_ANALYSIS_PROMPT`: For individual post analysis
- `COMBINED_ANALYSIS_PROMPT`: For final combined analysis
- `COMMENT_ANALYSIS_PROMPT`: For comment analysis

### Adding New MCP Tools

1. Add method to appropriate MCP server class (e.g., `XHSMCPServer`)
2. Decorate with `@mcp_tool()`
3. Register in server's `list_tools()` method
4. Call from agent via `await self.mcp_clients["server_name"].call_tool(...)`

### Testing Changes

```bash
# Quick test with fast mode
python run_agent.py 测试创意
# Select 'y' for fast mode

# Full end-to-end test
python tests/test_e2e.py
```

## Troubleshooting

**"ModuleNotFoundError"**
- Ensure you're in `agent_system/` directory
- Run `pip install -r requirements.txt`

**"401 Unauthorized" or "Invalid API Key"**
- Check `.env` file exists in `agent_system/`
- Verify API keys are correct (no extra spaces)
- For TikHub: Token should include `==` suffix

**Timeout errors**
- Reduce data size: use fast mode or decrease `SCRAPER_PAGES_PER_KEYWORD`
- Increase timeout in ExecutionPlan (orchestrator.py)
- Check network connectivity to APIs

**Empty results**
- Check TikHub API quota/balance
- Verify keyword returns results on Xiaohongshu
- Check logs for API errors

## File Structure Notes

**Important:** The project structure has two parallel systems:
1. **Agent System** (`agent_system/`): New agent-based architecture (this file)
2. **Legacy System** (`business_validator/`): Original monolithic implementation

They share:
- Pydantic models in `models/business_models.py`
- Report generation templates
- Configuration patterns

When working in `agent_system/`, focus on the agent-based workflow and MCP servers. The legacy code is maintained for compatibility.
