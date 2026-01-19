"""
小红书 MCP 服务器

基于 TikHub API 提供小红书数据获取服务
"""

import asyncio
import logging
import time
import aiohttp
from typing import Dict, Any, List, Optional
from datetime import datetime
from urllib.parse import quote_plus

from models.business_models import XhsNoteModel, XhsCommentModel
from agents.logging_config import RequestLogger


logger = logging.getLogger("mcp.xhs_server")


# ============================================================================
# TikHub API Client
# ============================================================================

class TikHubXHSClient:
    """
    TikHub 小红书 API 客户端（使用异步 HTTP）
    """

    def __init__(self, auth_token: str):
        """
        初始化客户端

        Args:
            auth_token: TikHub API Token
        """
        self.auth_token = auth_token
        self.base_url = "https://api.tikhub.io"
        self.headers = {
            "Authorization": f"Bearer {auth_token}",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        self._session: Optional[aiohttp.ClientSession] = None

        # 请求日志记录器
        self.request_logger = RequestLogger(logger)

    async def start(self):
        """启动客户端（初始化异步会话）"""
        if self._session is None:
            timeout = aiohttp.ClientTimeout(total=30)
            self._session = aiohttp.ClientSession(timeout=timeout)

    async def close(self):
        """关闭客户端"""
        if self._session:
            await self._session.close()
            self._session = None

    async def _get_session(self) -> aiohttp.ClientSession:
        """获取或创建会话"""
        if self._session is None:
            await self.start()
        return self._session

    async def search_notes(
        self,
        keyword: str,
        page: int = 1,
        sort: str = "general",
        note_type: str = "_0",
        max_retries: int = 3
    ) -> Dict[str, Any]:
        """
        搜索笔记（带重试和速率限制处理）

        Args:
            keyword: 搜索关键词
            page: 页码
            sort: 排序方式
            note_type: 笔记类型
            max_retries: 最大重试次数（用于处理 429 错误）
        """
        encoded_keyword = quote_plus(keyword)
        url = f"{self.base_url}/api/v1/xiaohongshu/web/search_notes"

        params = {
            "keyword": encoded_keyword,
            "page": page,
            "sort": sort,
            "noteType": note_type
        }

        for attempt in range(max_retries):
            session = await self._get_session()

            # 记录请求日志
            self.request_logger.log_request(
                api_name="TikHub.XHS",
                method="GET",
                url=url,
                params=params
            )

            start_time = time.time()

            try:
                async with session.get(
                    url,
                    headers=self.headers,
                    params=params
                ) as response:
                    duration_ms = (time.time() - start_time) * 1000

                    # 处理 429 Too Many Requests
                    if response.status == 429:
                        retry_after = int(response.headers.get('Retry-After', 5))
                        wait_time = retry_after + 1  # 额外加 1 秒缓冲

                        # 记录速率限制日志
                        self.request_logger.log_response(
                            api_name="TikHub.XHS",
                            status=429,
                            body={"retry_after": retry_after},
                            duration_ms=duration_ms
                        )

                        logger.warning(f"Rate limited (429) for search '{keyword}', waiting {wait_time}s before retry {attempt + 1}/{max_retries}")
                        await asyncio.sleep(wait_time)
                        continue

                    response.raise_for_status()
                    data = await response.json()

                    # 记录响应日志
                    self.request_logger.log_response(
                        api_name="TikHub.XHS",
                        status=response.status,
                        body={
                            "notes_count": len(data.get("data", {}).get("notes", [])),
                            "keyword": keyword
                        },
                        duration_ms=duration_ms
                    )

                    return data

            except aiohttp.ClientError as e:
                duration_ms = (time.time() - start_time) * 1000

                # 记录错误日志
                self.request_logger.log_response(
                    api_name="TikHub.XHS",
                    error=str(e),
                    duration_ms=duration_ms
                )

                if attempt < max_retries - 1:
                    logger.warning(f"Search request failed for '{keyword}': {e}, retrying...")
                    await asyncio.sleep(2 ** attempt)  # 指数退避
                    continue
                else:
                    raise

    async def get_note_comments(self, note_id: str, max_retries: int = 3) -> Dict[str, Any]:
        """
        获取评论（带重试和速率限制处理）

        Args:
            note_id: 笔记 ID
            max_retries: 最大重试次数（用于处理 429 错误）
        """
        url = f"{self.base_url}/api/v1/xiaohongshu/web/get_note_comments"

        for attempt in range(max_retries):
            session = await self._get_session()

            # 记录请求日志
            self.request_logger.log_request(
                api_name="TikHub.XHS",
                method="GET",
                url=url,
                params={"note_id": note_id}
            )

            start_time = time.time()

            try:
                async with session.get(
                    url,
                    headers=self.headers,
                    params={"note_id": note_id}
                ) as response:
                    duration_ms = (time.time() - start_time) * 1000

                    # 处理 429 Too Many Requests
                    if response.status == 429:
                        retry_after = int(response.headers.get('Retry-After', 5))
                        wait_time = retry_after + 1  # 额外加 1 秒缓冲

                        # 记录速率限制日志
                        self.request_logger.log_response(
                            api_name="TikHub.XHS",
                            status=429,
                            body={"retry_after": retry_after, "note_id": note_id},
                            duration_ms=duration_ms
                        )

                        logger.warning(f"Rate limited (429) for note {note_id}, waiting {wait_time}s before retry {attempt + 1}/{max_retries}")
                        await asyncio.sleep(wait_time)
                        continue

                    response.raise_for_status()
                    data = await response.json()

                    # 记录响应日志
                    self.request_logger.log_response(
                        api_name="TikHub.XHS",
                        status=response.status,
                        body={
                            "comments_count": len(data.get("data", {}).get("comments", [])),
                            "note_id": note_id
                        },
                        duration_ms=duration_ms
                    )

                    return data

            except aiohttp.ClientError as e:
                duration_ms = (time.time() - start_time) * 1000

                # 记录错误日志
                self.request_logger.log_response(
                    api_name="TikHub.XHS",
                    error=str(e),
                    duration_ms=duration_ms
                )

                if attempt < max_retries - 1:
                    logger.warning(f"Request failed for note {note_id}: {e}, retrying...")
                    await asyncio.sleep(2 ** attempt)  # 指数退避
                    continue
                else:
                    raise


# ============================================================================
# XHS MCP Server
# ============================================================================


class XHSMCPServer:
    """
    小红书 MCP 服务器

    提供工具:
    - search_notes: 搜索笔记
    - get_note_comments: 获取评论
    - batch_get_comments: 批量获取评论
    """

    def __init__(self, auth_token: str, request_delay: float = 1.0):
        """
        初始化 XHS MCP 服务器

        Args:
            auth_token: TikHub API Token
            request_delay: 请求延迟(秒)
        """
        self.auth_token = auth_token
        self.request_delay = request_delay
        self._client = None

        logger.info("XHS MCP Server initialized")

    async def start(self):
        """启动服务器"""
        self._client = TikHubXHSClient(self.auth_token)
        await self._client.start()
        logger.info("XHS MCP Server started")

    async def stop(self):
        """停止服务器"""
        if self._client:
            await self._client.close()
        logger.info("XHS MCP Server stopped")

    # ========================================================================
    # MCP 工具实现
    # ========================================================================

    async def call_tool(self, tool_name: str, **kwargs) -> Any:
        """
        调用工具

        Args:
            tool_name: 工具名称
            **kwargs: 工具参数

        Returns:
            工具执行结果
        """
        if tool_name == "search_notes":
            return await self.search_notes(**kwargs)
        elif tool_name == "get_note_comments":
            return await self.get_note_comments(**kwargs)
        elif tool_name == "batch_get_comments":
            return await self.batch_get_comments(**kwargs)
        else:
            raise ValueError(f"Unknown tool: {tool_name}")

    async def search_notes(
        self,
        keyword: str,
        page: int = 1,
        pages: int = 1,
        sort: str = "general",
        note_type: str = "_0"
    ) -> Dict[str, Any]:
        """
        搜索小红书笔记

        Args:
            keyword: 搜索关键词
            page: 起始页码
            pages: 搜索页数
            sort: 排序方式 (general/time/popularity)
            note_type: 笔记类型 (_0全部/_1视频/_2图文)

        Returns:
            {
                "success": true,
                "keyword": "关键词",
                "notes": [笔记列表],
                "total_count": 笔记总数,
                "execution_time": 执行时间
            }
        """
        start_time = datetime.now()

        all_notes = []
        seen_ids = set()

        # 搜索指定页数
        for p in range(page, page + pages):
            try:
                response = await self._client.search_notes(
                    keyword=keyword,
                    page=p,
                    sort=sort,
                    note_type=note_type
                )

                # 解析响应
                items = response.get("data", {}).get("data", {}).get("items", [])

                for item in items:
                    note_data = item.get("note", item)

                    # 转换为模型
                    note = XhsNoteModel(
                        note_id=note_data.get("id", ""),
                        title=note_data.get("title", ""),
                        desc=note_data.get("desc", ""),
                        type=note_data.get("type", "normal"),
                        publish_time=note_data.get("time", 0),
                        liked_count=note_data.get("liked_count", 0),
                        collected_count=note_data.get("collected_count", 0),
                        shared_count=note_data.get("shared_count", 0),
                        comments_count=note_data.get("comments_count", 0),
                        user_id=note_data.get("user", {}).get("id", ""),
                        user_nickname=note_data.get("user", {}).get("nickname", ""),
                        user_avatar=note_data.get("user", {}).get("avatar", ""),
                        keyword_matched=keyword
                    )

                    # 去重
                    if note.note_id and note.note_id not in seen_ids:
                        seen_ids.add(note.note_id)
                        all_notes.append(note.model_dump())

                # 延迟避免限流
                if p < page + pages - 1:
                    await asyncio.sleep(self.request_delay)

            except Exception as e:
                logger.error(f"Search page {p} failed: {e}")
                continue

        execution_time = (datetime.now() - start_time).total_seconds()

        logger.info(f"Search complete: {len(all_notes)} notes in {execution_time:.2f}s")

        return {
            "success": True,
            "keyword": keyword,
            "notes": all_notes,
            "total_count": len(all_notes),
            "execution_time": execution_time
        }

    async def get_note_comments(
        self,
        note_id: str,
        limit: int = 50
    ) -> Dict[str, Any]:
        """
        获取笔记评论

        Args:
            note_id: 笔记 ID
            limit: 最大评论数

        Returns:
            {
                "success": true,
                "note_id": "笔记ID",
                "comments": [评论列表],
                "total_count": 评论总数,
                "execution_time": 执行时间
            }
        """
        start_time = datetime.now()

        try:
            response = await self._client.get_note_comments(note_id)

            # 解析评论
            comment_items = response.get("data", {}).get("data", {}).get("comments", [])

            comments = []
            for item in comment_items[:limit]:
                comment = XhsCommentModel(
                    comment_id=item.get("id", ""),
                    note_id=note_id,
                    content=item.get("content", ""),
                    publish_time=item.get("time", 0),
                    ip_location=item.get("ip_location", ""),
                    like_count=item.get("like_count", 0),
                    user_id=item.get("user", {}).get("id", ""),
                    user_nickname=item.get("user", {}).get("nickname", ""),
                    parent_comment_id=item.get("parent_comment", {}).get("id", "")
                )
                comments.append(comment.model_dump())

            execution_time = (datetime.now() - start_time).total_seconds()

            logger.info(f"Got {len(comments)} comments in {execution_time:.2f}s")

            return {
                "success": True,
                "note_id": note_id,
                "comments": comments,
                "total_count": len(comments),
                "execution_time": execution_time
            }

        except Exception as e:
            logger.error(f"Get comments failed: {e}")
            return {
                "success": False,
                "note_id": note_id,
                "comments": [],
                "total_count": 0,
                "error": str(e),
                "execution_time": (datetime.now() - start_time).total_seconds()
            }

    async def batch_get_comments(
        self,
        note_ids: List[str],
        comments_per_note: int = 20,
        delay_between_requests: float = 2.0
    ) -> Dict[str, Any]:
        """
        批量获取评论（串行以避免速率限制）

        Args:
            note_ids: 笔记 ID 列表
            comments_per_note: 每个笔记的评论数
            delay_between_requests: 请求之间的延迟（秒）

        Returns:
            {
                "success": true,
                "results": {note_id: [评论列表]},
                "total_comments": 总评论数,
                "execution_time": 执行时间
            }
        """
        start_time = datetime.now()

        logger.info(f"Batch getting comments for {len(note_ids)} notes (with {delay_between_requests}s delay)")

        # 串行获取评论以避免速率限制
        results_dict = {}
        total_comments = 0

        for idx, note_id in enumerate(note_ids):
            try:
                # 添加延迟（除了第一个请求）
                if idx > 0:
                    await asyncio.sleep(delay_between_requests)

                result = await self.get_note_comments(note_id)

                if isinstance(result, dict) and result.get("success"):
                    comments = result.get("comments", [])
                    results_dict[note_id] = comments
                    total_comments += len(comments)
                    logger.info(f"Got {len(comments)} comments for note {note_id} ({idx + 1}/{len(note_ids)})")
                else:
                    logger.error(f"Failed to get comments for {note_id}: {result.get('error', 'Unknown error')}")
                    results_dict[note_id] = []

            except asyncio.CancelledError:
                # 任务被取消（超时）
                logger.warning(f"Batch operation cancelled at note {idx + 1}/{len(note_ids)} (likely timeout)")
                # 返回已获取的部分结果
                execution_time = (datetime.now() - start_time).total_seconds()
                logger.info(f"Partial batch complete: {total_comments} comments from {len(results_dict)} notes in {execution_time:.2f}s")
                return {
                    "success": False,
                    "results": results_dict,
                    "total_comments": total_comments,
                    "execution_time": execution_time,
                    "error": "Operation cancelled - likely timeout. Returning partial results.",
                    "error_type": "CancelledError",
                    "completed": len(results_dict),
                    "total": len(note_ids)
                }

            except Exception as e:
                logger.error(f"Failed to get comments for {note_id}: {e}")
                results_dict[note_id] = []

        execution_time = (datetime.now() - start_time).total_seconds()

        logger.info(f"Batch complete: {total_comments} comments in {execution_time:.2f}s")

        return {
            "success": True,
            "results": results_dict,
            "total_comments": total_comments,
            "execution_time": execution_time
        }

    async def ping(self) -> bool:
        """健康检查"""
        return self._client is not None


# ============================================================================
# 服务器工厂
# ============================================================================

async def create_xhs_mcp_server(
    auth_token: str,
    request_delay: float = 1.0
) -> XHSMCPServer:
    """
    创建 XHS MCP 服务器实例

    Args:
        auth_token: TikHub API Token
        request_delay: 请求延迟

    Returns:
        XHS MCP 服务器实例
    """
    server = XHSMCPServer(auth_token, request_delay)
    await server.start()
    return server
