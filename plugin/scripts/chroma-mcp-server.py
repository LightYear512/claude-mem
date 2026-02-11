# /// script
# requires-python = ">=3.11"
# dependencies = ["chromadb>=1.0.0", "mcp>=1.0.0", "requests>=2.31.0"]
# ///
"""
Custom ChromaDB MCP Server for claude-mem.

Drop-in replacement for chroma-mcp with configurable embedding functions.
Supports local (sentence-transformers) and remote (DashScope/OpenAI-compatible) embeddings.

Usage:
    uv run --python 3.13 chroma-mcp-server.py \
        --data-dir ~/.claude-mem/chroma \
        --embedding-config default \
        [--api-key sk-xxx] \
        [--api-url https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings]

Embedding config values:
    default                                     - ChromaDB default (all-MiniLM-L6-v2)
    sentence-transformers/<model>               - Local sentence-transformers model
    shibing624/text2vec-base-chinese            - Local Chinese model
    dashscope:text-embedding-v3                 - Remote DashScope API (1024d default)
    dashscope:text-embedding-v3:512             - Remote DashScope API with custom dimensions
    dashscope:text-embedding-v4                 - Remote DashScope API (1024d default)
    dashscope:text-embedding-v4:256             - Remote DashScope API with custom dimensions

Supported dimensions: 2048, 1536, 1024 (default), 768, 512, 256, 128, 64
"""

import argparse
import json
import logging
import sys
from typing import Any, Optional

import chromadb
from chromadb.config import Settings as ChromaSettings

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("chroma-mcp-server")

# ---------------------------------------------------------------------------
# Embedding Function Implementations
# ---------------------------------------------------------------------------


class RemoteEmbeddingFunction:
    """
    Embedding function that calls a remote OpenAI-compatible /embeddings endpoint.
    Works with DashScope, OpenAI, Azure, and any compatible provider.

    Implements the ChromaDB 1.x EmbeddingFunction protocol (name, get_config,
    build_from_config) so that get_or_create_collection validation succeeds.
    """

    def __init__(
        self,
        api_key: str,
        api_url: str,
        model_name: str,
        batch_size: int = 25,
        timeout: int = 60,
        dimensions: int | None = None,
    ):
        self.api_key = api_key
        self.api_url = api_url
        self.model_name = model_name
        # DashScope models (text-embedding-v3/v4) have max batch size of 10
        self.batch_size = min(batch_size, 10) if "dashscope" in api_url or model_name.startswith("text-embedding") else batch_size
        self.timeout = timeout
        self.dimensions = dimensions

    # -- ChromaDB 1.x EmbeddingFunction protocol methods --------------------

    @staticmethod
    def name() -> str:
        return "claude-mem-remote"

    def get_config(self) -> dict[str, Any]:
        cfg: dict[str, Any] = {
            "api_url": self.api_url,
            "model_name": self.model_name,
            "batch_size": self.batch_size,
            "timeout": self.timeout,
        }
        if self.dimensions is not None:
            cfg["dimensions"] = self.dimensions
        return cfg

    @staticmethod
    def build_from_config(config: dict[str, Any]) -> "RemoteEmbeddingFunction":
        return RemoteEmbeddingFunction(
            api_key=config.get("api_key", ""),
            api_url=config.get("api_url", ""),
            model_name=config.get("model_name", ""),
            batch_size=config.get("batch_size", 25),
            timeout=config.get("timeout", 60),
            dimensions=config.get("dimensions"),
        )

    def embed_query(self, input: list[str]) -> list[list[float]]:
        """ChromaDB 1.x calls this for query-time embedding."""
        return self.__call__(input)

    # -- Core embedding method ----------------------------------------------

    def __call__(self, input: list[str]) -> list[list[float]]:
        import requests

        all_embeddings: list[list[float]] = []

        for i in range(0, len(input), self.batch_size):
            batch = input[i : i + self.batch_size]

            try:
                body: dict[str, Any] = {
                    "model": self.model_name,
                    "input": batch,
                    "encoding_format": "float",
                }
                if self.dimensions is not None:
                    body["dimensions"] = self.dimensions
                resp = requests.post(
                    self.api_url,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                    timeout=self.timeout,
                )
                resp.raise_for_status()
                data = resp.json()

                # Sort by index to maintain order
                sorted_items = sorted(data["data"], key=lambda x: x["index"])
                all_embeddings.extend([item["embedding"] for item in sorted_items])

            except requests.exceptions.RequestException as exc:
                log.error("Remote embedding API error: %s", exc)
                raise RuntimeError(f"Embedding API call failed: {exc}") from exc

        return all_embeddings


def create_embedding_function(
    config: str,
    api_key: str = "",
    api_url: str = "",
) -> Any:
    """
    Factory: create an embedding function from a config string.

    Supported formats:
        'default'                                   -> ChromaDB DefaultEmbeddingFunction
        'sentence-transformers/multilingual-...'     -> SentenceTransformerEmbeddingFunction
        'shibing624/text2vec-base-chinese'           -> SentenceTransformerEmbeddingFunction
        'dashscope:<model>'                          -> RemoteEmbeddingFunction (DashScope)
        'dashscope:<model>:<dimensions>'             -> RemoteEmbeddingFunction with custom dims
    """
    if config == "default":
        from chromadb.utils.embedding_functions import DefaultEmbeddingFunction

        return DefaultEmbeddingFunction()

    if config.startswith("dashscope:"):
        # Parse format: dashscope:<model>[:<dimensions>]
        parts = config.split(":")
        model_name = parts[1]
        dimensions: int | None = None
        if len(parts) >= 3 and parts[2].isdigit():
            dimensions = int(parts[2])
        effective_url = (
            api_url
            or "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings"
        )
        if not api_key:
            raise ValueError(
                "DashScope embedding requires an API key. "
                "Set CLAUDE_MEM_DASHSCOPE_API_KEY in settings."
            )
        log.info(
            "Using remote DashScope embedding: model=%s url=%s dimensions=%s",
            model_name,
            effective_url,
            dimensions or "default",
        )
        return RemoteEmbeddingFunction(
            api_key=api_key,
            api_url=effective_url,
            model_name=model_name,
            dimensions=dimensions,
        )

    # Assume sentence-transformers compatible model
    try:
        from chromadb.utils.embedding_functions import (
            SentenceTransformerEmbeddingFunction,
        )

        log.info("Using local sentence-transformers model: %s", config)
        return SentenceTransformerEmbeddingFunction(model_name=config)
    except Exception as exc:
        raise ValueError(
            f"Failed to load embedding model '{config}': {exc}"
        ) from exc


# ---------------------------------------------------------------------------
# ChromaDB Client Management
# ---------------------------------------------------------------------------

_chroma_client: Optional[chromadb.ClientAPI] = None
_collections: dict[str, Any] = {}
_embedding_function: Any = None


def get_client(data_dir: str) -> chromadb.ClientAPI:
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(
            path=data_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        log.info("ChromaDB client initialized: %s", data_dir)
    return _chroma_client


def get_collection(name: str, data_dir: str, ef: Any) -> Any:
    if name not in _collections:
        client = get_client(data_dir)
        _collections[name] = client.get_or_create_collection(
            name=name,
            embedding_function=ef,
        )
        log.info("Collection ready: %s", name)
    return _collections[name]


# ---------------------------------------------------------------------------
# MCP Server
# ---------------------------------------------------------------------------


def build_server(
    data_dir: str,
    embedding_config: str,
    api_key: str,
    api_url: str,
) -> Server:
    global _embedding_function
    _embedding_function = create_embedding_function(embedding_config, api_key, api_url)

    app = Server("claude-mem-chroma")

    # ------------------------------------------------------------------
    # Tool definitions
    # ------------------------------------------------------------------

    @app.list_tools()
    async def list_tools() -> list[Tool]:
        return [
            Tool(
                name="chroma_create_collection",
                description="Create a new ChromaDB collection",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "collection_name": {"type": "string"},
                        "embedding_function_name": {
                            "type": "string",
                            "default": "default",
                        },
                    },
                    "required": ["collection_name"],
                },
            ),
            Tool(
                name="chroma_get_collection_info",
                description="Get info about a ChromaDB collection",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "collection_name": {"type": "string"},
                    },
                    "required": ["collection_name"],
                },
            ),
            Tool(
                name="chroma_add_documents",
                description="Add documents to a ChromaDB collection",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "collection_name": {"type": "string"},
                        "documents": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "ids": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "metadatas": {
                            "type": "array",
                            "items": {"type": "object"},
                        },
                    },
                    "required": ["collection_name", "documents", "ids"],
                },
            ),
            Tool(
                name="chroma_query_documents",
                description="Query documents in a ChromaDB collection",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "collection_name": {"type": "string"},
                        "query_texts": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "n_results": {"type": "integer", "default": 5},
                        "include": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "where": {"type": "string"},
                        "where_document": {"type": "string"},
                    },
                    "required": ["collection_name", "query_texts"],
                },
            ),
            Tool(
                name="chroma_get_documents",
                description="Get documents from a ChromaDB collection by ID or pagination",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "collection_name": {"type": "string"},
                        "ids": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "limit": {"type": "integer"},
                        "offset": {"type": "integer"},
                        "include": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["collection_name"],
                },
            ),
        ]

    # ------------------------------------------------------------------
    # Tool handlers
    # ------------------------------------------------------------------

    @app.call_tool()
    async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
        try:
            result = _dispatch_tool(name, arguments, data_dir)
            return [TextContent(type="text", text=json.dumps(result))]
        except Exception as exc:
            log.error("Tool %s failed: %s", name, exc)
            return [
                TextContent(
                    type="text",
                    text=json.dumps({"error": str(exc)}),
                )
            ]

    return app


def _dispatch_tool(
    name: str, args: dict[str, Any], data_dir: str
) -> Any:
    if name == "chroma_create_collection":
        return _tool_create_collection(args, data_dir)
    elif name == "chroma_get_collection_info":
        return _tool_get_collection_info(args, data_dir)
    elif name == "chroma_add_documents":
        return _tool_add_documents(args, data_dir)
    elif name == "chroma_query_documents":
        return _tool_query_documents(args, data_dir)
    elif name == "chroma_get_documents":
        return _tool_get_documents(args, data_dir)
    else:
        raise ValueError(f"Unknown tool: {name}")


def _tool_create_collection(
    args: dict[str, Any], data_dir: str
) -> dict[str, Any]:
    collection_name = args["collection_name"]
    col = get_collection(collection_name, data_dir, _embedding_function)
    return {
        "collection": collection_name,
        "count": col.count(),
        "status": "created",
    }


def _tool_get_collection_info(
    args: dict[str, Any], data_dir: str
) -> dict[str, Any]:
    collection_name = args["collection_name"]
    col = get_collection(collection_name, data_dir, _embedding_function)
    return {
        "collection": collection_name,
        "count": col.count(),
    }


def _tool_add_documents(
    args: dict[str, Any], data_dir: str
) -> dict[str, Any]:
    collection_name = args["collection_name"]
    documents = args["documents"]
    ids = args["ids"]
    metadatas = args.get("metadatas")

    col = get_collection(collection_name, data_dir, _embedding_function)

    kwargs: dict[str, Any] = {
        "documents": documents,
        "ids": ids,
    }
    if metadatas:
        kwargs["metadatas"] = metadatas

    col.upsert(**kwargs)

    log.info(
        "Added %d documents to %s",
        len(documents),
        collection_name,
    )
    return {
        "added": len(documents),
        "collection": collection_name,
    }


def _tool_query_documents(
    args: dict[str, Any], data_dir: str
) -> dict[str, Any]:
    collection_name = args["collection_name"]
    query_texts = args["query_texts"]
    n_results = args.get("n_results", 5)
    include = args.get("include", ["documents", "metadatas", "distances"])
    where_str = args.get("where")
    where_document_str = args.get("where_document")

    col = get_collection(collection_name, data_dir, _embedding_function)

    kwargs: dict[str, Any] = {
        "query_texts": query_texts,
        "n_results": n_results,
        "include": include,
    }

    if where_str:
        try:
            kwargs["where"] = json.loads(where_str)
        except (json.JSONDecodeError, TypeError):
            pass

    if where_document_str:
        try:
            kwargs["where_document"] = json.loads(where_document_str)
        except (json.JSONDecodeError, TypeError):
            pass

    results = col.query(**kwargs)
    return results


def _tool_get_documents(
    args: dict[str, Any], data_dir: str
) -> dict[str, Any]:
    collection_name = args["collection_name"]
    ids = args.get("ids")
    limit = args.get("limit")
    offset = args.get("offset")
    include = args.get("include", ["documents", "metadatas"])

    col = get_collection(collection_name, data_dir, _embedding_function)

    kwargs: dict[str, Any] = {"include": include}
    if ids:
        kwargs["ids"] = ids
    if limit is not None:
        kwargs["limit"] = limit
    if offset is not None:
        kwargs["offset"] = offset

    results = col.get(**kwargs)
    return results


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------


async def main() -> None:
    parser = argparse.ArgumentParser(description="ChromaDB MCP Server for claude-mem")
    parser.add_argument(
        "--data-dir",
        required=True,
        help="Directory for persistent ChromaDB data",
    )
    parser.add_argument(
        "--embedding-config",
        default="default",
        help="Embedding function config string",
    )
    parser.add_argument(
        "--api-key",
        default="",
        help="API key for remote embedding (DashScope/OpenAI)",
    )
    parser.add_argument(
        "--api-url",
        default="",
        help="API URL for remote embedding endpoint",
    )

    args = parser.parse_args()

    log.info(
        "Starting ChromaDB MCP server: data_dir=%s embedding=%s",
        args.data_dir,
        args.embedding_config,
    )

    server = build_server(
        data_dir=args.data_dir,
        embedding_config=args.embedding_config,
        api_key=args.api_key,
        api_url=args.api_url,
    )

    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
