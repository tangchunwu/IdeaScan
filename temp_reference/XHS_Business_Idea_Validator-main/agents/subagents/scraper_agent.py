"""
数据抓取 Agent

负责从小红书抓取笔记和评论数据
"""

import logging
from typing import Dict, Any, List
from datetime import datetime

from agents.base_agent import BaseAgent, AgentStatus, TaskResult
from agents.config import AgentConfig, ConfigManager, RetryConfig
from agents.context_store import ContextStore
from agents.skills.scraper_skills import (
    search_posts_skill,
    get_comments_skill,
    batch_get_comments_skill,
    batch_scrape_skill,
    batch_scrape_with_comments_skill
)


logger = logging.getLogger("agent.scraper")


class ScraperAgent(BaseAgent):
    """
    数据抓取 Agent

    职责:
    1. 根据关键词搜索小红书笔记
    2. 获取笔记评论
    3. 批量抓取数据

    Skills:
    - search_posts: 搜索笔记
    - get_comments: 获取评论
    - batch_get_comments: 批量获取评论
    - batch_scrape: 批量抓取
    - batch_scrape_with_comments: 批量抓取（返回合并的posts_with_comments结构）
    """

    def __init__(
        self,
        config: ConfigManager,
        context_store: ContextStore,
        mcp_clients: Dict[str, Any]
    ):
        # 从 ConfigManager 获取 agent 配置
        agent_configs = config.get_agent_configs()
        agent_config = agent_configs.get("scraper", AgentConfig(
            name="scraper_agent",
            type="scraper",
            enabled=True,
            timeout=300.0
        ))

        super().__init__(
            name="scraper_agent",
            config=agent_config,
            context_store=context_store,
            mcp_clients=mcp_clients
        )

    async def execute(
        self,
        task: str,
        context: Dict[str, Any],
        **kwargs
    ) -> TaskResult:
        """
        执行抓取任务

        Args:
            task: 任务类型 (search/get_comments/batch_get/batch_scrape/batch_scrape_with_comments)
            context: 执行上下文
            **kwargs: 额外参数

        Returns:
            TaskResult: 任务执行结果
        """
        self.status = AgentStatus.RUNNING
        start_time = datetime.now()

        try:
            if task == "search":
                result = await self._search(context, kwargs)
            elif task == "get_comments":
                result = await self._get_comments(context, kwargs)
            elif task == "batch_get_comments":
                result = await self._batch_get_comments(context, kwargs)
            elif task == "batch_scrape":
                result = await self._batch_scrape(context, kwargs)
            elif task == "batch_scrape_with_comments":
                result = await self._batch_scrape_with_comments(context, kwargs)
            else:
                raise ValueError(f"Unknown task: {task}")

            execution_time = (datetime.now() - start_time).total_seconds()
            self._update_metrics(True, execution_time)

            self.status = AgentStatus.COMPLETED
            return TaskResult(
                success=True,
                data=result,
                agent_name=self.name,
                execution_time=execution_time
            )

        except Exception as e:
            logger.exception(f"Scraper task failed: {task}")
            execution_time = (datetime.now() - start_time).total_seconds()
            self._update_metrics(False, execution_time)

            self.status = AgentStatus.FAILED
            return TaskResult(
                success=False,
                error=str(e),
                agent_name=self.name,
                execution_time=execution_time
            )

    async def _search(
        self,
        context: Dict[str, Any],
        kwargs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        搜索笔记

        Args:
            context: 执行上下文
            kwargs: 参数
                - keyword: 搜索关键词
                - pages: 搜索页数 (默认2)
                - sort: 排序方式 (默认general)
                - note_type: 笔记类型 (默认_0)

        Returns:
            搜索结果
        """
        keyword = context.get("keyword", kwargs.get("keyword", ""))
        pages = kwargs.get("pages", 2)
        sort = kwargs.get("sort", "general")
        note_type = kwargs.get("note_type", "_0")

        if not keyword:
            raise ValueError("keyword is required")

        self.update_progress("searching", 0.2, f"正在搜索关键词: {keyword}")

        # 调用 skill
        result = await search_posts_skill(
            self,
            keyword=keyword,
            pages=pages,
            sort=sort,
            note_type=note_type
        )

        if result.get("success"):
            self.update_progress("searching", 1.0, f"搜索完成，找到 {result['total_count']} 条笔记")
        else:
            self.update_progress("searching", 1.0, f"搜索失败: {result.get('error', 'Unknown')}")

        return result

    async def _get_comments(
        self,
        context: Dict[str, Any],
        kwargs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        获取评论

        Args:
            context: 执行上下文
            kwargs: 参数
                - note_id: 笔记 ID
                - limit: 最大评论数 (默认50)

        Returns:
            评论结果
        """
        note_id = context.get("note_id", kwargs.get("note_id", ""))
        limit = kwargs.get("limit", 50)

        if not note_id:
            raise ValueError("note_id is required")

        self.update_progress("fetching_comments", 0.5, f"正在获取笔记 {note_id} 的评论...")

        # 调用 skill
        result = await get_comments_skill(self, note_id, limit)

        if result.get("success"):
            self.update_progress("fetching_comments", 1.0, f"获取了 {result['total_count']} 条评论")
        else:
            self.update_progress("fetching_comments", 1.0, f"获取评论失败: {result.get('error', 'Unknown')}")

        return result

    async def _batch_get_comments(
        self,
        context: Dict[str, Any],
        kwargs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        批量获取评论

        Args:
            context: 执行上下文
            kwargs: 参数
                - note_ids: 笔记 ID 列表
                - comments_per_note: 每个笔记的评论数 (默认20)

        Returns:
            批量评论结果
        """
        note_ids = context.get("note_ids", kwargs.get("note_ids", []))
        comments_per_note = kwargs.get("comments_per_note", 20)

        if not note_ids:
            raise ValueError("note_ids is required")

        self.update_progress(
            "batch_fetching_comments",
            0.2,
            f"正在批量获取 {len(note_ids)} 个笔记的评论..."
        )

        # 调用 skill
        result = await batch_get_comments_skill(self, note_ids, comments_per_note)

        if result.get("success"):
            self.update_progress(
                "batch_fetching_comments",
                1.0,
                f"批量获取完成，共 {result['total_comments']} 条评论"
            )
        else:
            self.update_progress(
                "batch_fetching_comments",
                1.0,
                f"批量获取失败: {result.get('error', 'Unknown')}"
            )

        return result

    async def _batch_scrape(
        self,
        context: Dict[str, Any],
        kwargs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        批量抓取：搜索 + 评论

        Args:
            context: 执行上下文
            kwargs: 参数
                - keywords: 关键词列表
                - pages_per_keyword: 每个关键词的搜索页数 (默认2)
                - comments_per_note: 每个笔记的评论数 (默认20)
                - max_notes: 最大笔记数 (默认20)

        Returns:
            批量抓取结果
        """
        keywords = context.get("keywords", kwargs.get("keywords", []))
        pages_per_keyword = kwargs.get("pages_per_keyword", 2)
        comments_per_note = kwargs.get("comments_per_note", 20)
        max_notes = kwargs.get("max_notes", 20)

        if not keywords:
            raise ValueError("keywords is required")

        self.update_progress(
            "batch_scraping",
            0.1,
            f"开始批量抓取 {len(keywords)} 个关键词..."
        )

        # 调用 skill - 直接传递 self 的进度回调
        result = await batch_scrape_skill(
            self,
            keywords=keywords,
            pages_per_keyword=pages_per_keyword,
            comments_per_note=comments_per_note,
            max_notes=max_notes,
            progress_callback=self._progress_callback
        )

        if result.get("success"):
            self.update_progress(
                "batch_scraping",
                1.0,
                f"批量抓取完成: {result['total_notes']} 条笔记, {result['total_comments']} 条评论"
            )

            # 保存检查点
            run_id = context.get("run_id")
            if run_id:
                await self.save_checkpoint(
                    run_id,
                    "scraping_complete",
                    {
                        "notes": result["notes"],
                        "comments": result["comments"],
                        "keyword_results": result["keyword_results"]
                    }
                )
        else:
            self.update_progress(
                "batch_scraping",
                1.0,
                f"批量抓取失败: {result.get('error', 'Unknown')}"
            )

        return result

    async def _batch_scrape_with_comments(
        self,
        context: Dict[str, Any],
        kwargs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        批量抓取：搜索 + 评论 + 合并在一起

        返回 posts_with_comments 结构，每个 post 包含自己的 comments_data

        Args:
            context: 执行上下文
            kwargs: 参数
                - keywords: 关键词列表
                - pages_per_keyword: 每个关键词的搜索页数 (默认2)
                - comments_per_note: 每个笔记的评论数 (默认20)
                - max_notes: 最大笔记数 (默认20)

        Returns:
            批量抓取结果，包含 posts_with_comments
        """
        keywords = context.get("keywords", kwargs.get("keywords", []))
        business_idea = context.get("business_idea", kwargs.get("business_idea", ""))
        pages_per_keyword = kwargs.get("pages_per_keyword", 2)
        comments_per_note = kwargs.get("comments_per_note", 20)
        max_notes = kwargs.get("max_notes", 20)

        # DEBUG: Log keywords received from context
        logger.debug(f"[SCRAPER_AGENT] Keywords from context: {keywords}")

        # If no keywords are provided, use the business idea directly as the keyword
        if not keywords and business_idea:
            keywords = [business_idea]
            logger.info(f"[SCRAPER_AGENT] Using business idea as keyword: {business_idea}")
        elif not keywords:
            raise ValueError("keywords or business_idea is required")

        logger.info(f"[SCRAPER_AGENT] About to scrape with {len(keywords)} keyword(s): {keywords}")

        self.update_progress(
            "batch_scraping_with_comments",
            0.1,
            f"开始批量抓取 {len(keywords)} 个关键词（带评论合并）..."
        )

        # 调用 skill - 直接传递 self 的进度回调
        result = await batch_scrape_with_comments_skill(
            self,
            keywords=keywords,
            pages_per_keyword=pages_per_keyword,
            comments_per_note=comments_per_note,
            max_notes=max_notes,
            progress_callback=self._progress_callback
        )

        if result.get("success"):
            metadata = result.get("metadata", {})
            self.update_progress(
                "batch_scraping_with_comments",
                1.0,
                f"批量抓取完成: {metadata['total_posts']} 条帖子, "
                f"{metadata.get('posts_with_comments', 0)} 条带评论"
            )

            # 保存检查点（新格式）
            run_id = context.get("run_id")
            if run_id:
                await self.save_checkpoint(
                    run_id,
                    "scraping_complete",
                    {
                        "posts_with_comments": result["posts_with_comments"],
                        "metadata": metadata
                    }
                )
        else:
            self.update_progress(
                "batch_scraping_with_comments",
                1.0,
                f"批量抓取失败: {result.get('error', 'Unknown')}"
            )

        return result

    def _update_metrics(
        self,
        success: bool,
        execution_time: float
    ):
        """更新运行指标"""
        self.metrics.tasks_completed += 1 if success else 0
        self.metrics.tasks_failed += 0 if success else 1
        self.metrics.total_execution_time += execution_time

        total = self.metrics.tasks_completed + self.metrics.tasks_failed
        if total > 0:
            self.metrics.avg_execution_time = self.metrics.total_execution_time / total

        self.metrics.last_execution = datetime.now()
