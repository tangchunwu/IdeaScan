"""
关键词生成 Agent

负责生成和优化搜索关键词
"""

import logging
from typing import Dict, Any, List
from datetime import datetime

from agents.base_agent import BaseAgent, AgentStatus, TaskResult
from agents.config import AgentConfig, ConfigManager, RetryConfig
from agents.context_store import ContextStore
from agents.skills.keyword_skills import (
    generate_keywords_skill,
    refine_keywords_skill,
    validate_keywords_skill
)
from models.business_models import KeywordModel
from models.agent_models import AgentMetrics


logger = logging.getLogger("agent.keyword")


class KeywordAgent(BaseAgent):
    """
    关键词生成 Agent

    职责:
    1. 根据业务创意生成搜索关键词
    2. 根据反馈优化关键词
    3. 验证关键词质量

    Skills:
    - generate_keywords: 生成初始关键词
    - refine_keywords: 优化关键词
    - validate_keywords: 验证关键词
    """

    def __init__(
        self,
        config: ConfigManager,
        context_store: ContextStore,
        mcp_clients: Dict[str, Any]
    ):
        # 从 ConfigManager 获取 agent 配置
        agent_configs = config.get_agent_configs()
        agent_config = agent_configs.get("keyword", AgentConfig(
            name="keyword_agent",
            type="keyword",
            enabled=True,
            timeout=60.0
        ))

        super().__init__(
            name="keyword_agent",
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
        执行关键词任务

        Args:
            task: 任务类型 (generate/refine/validate)
            context: 执行上下文
            **kwargs: 额外参数

        Returns:
            TaskResult: 任务执行结果
        """
        self.status = AgentStatus.RUNNING
        start_time = datetime.now()

        try:
            if task == "generate":
                result = await self._generate(context, kwargs)
            elif task == "refine":
                result = await self._refine(context, kwargs)
            elif task == "validate":
                result = await self._validate(context, kwargs)
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
            logger.exception(f"Keyword task failed: {task}")
            execution_time = (datetime.now() - start_time).total_seconds()
            self._update_metrics(False, execution_time)

            self.status = AgentStatus.FAILED
            return TaskResult(
                success=False,
                error=str(e),
                agent_name=self.name,
                execution_time=execution_time
            )

    async def _generate(
        self,
        context: Dict[str, Any],
        kwargs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        生成关键词

        Args:
            context: 执行上下文
            kwargs: 参数
                - business_idea: 业务创意
                - count: 生成数量 (默认3)
                - use_user_input_as_keyword: 是否直接使用用户输入作为关键词

        Returns:
            生成结果
        """
        business_idea = context.get("business_idea", kwargs.get("business_idea", ""))
        count = kwargs.get("count", 3)
        use_user_input_as_keyword = kwargs.get("use_user_input_as_keyword", False)

        # DEBUG: Log parameters
        logger.debug(f"[FAST_MODE] use_user_input_as_keyword={use_user_input_as_keyword}, business_idea={business_idea[:50]}")

        if not business_idea:
            raise ValueError("business_idea is required")

        # 如果直接使用用户输入作为关键词
        if use_user_input_as_keyword:
            logger.info(f"Using user input directly as keyword: {business_idea}")
            self.update_progress("generating", 1.0, f"使用您的输入作为关键词: {business_idea}")

            result = {
                "keywords": [business_idea],
                "count": 1,
                "business_idea": business_idea,
                "source": "user_input"
            }
            logger.info(f"[FAST_MODE] Returning: {result}")
            return result

        self.update_progress("generating", 0.2, f"正在生成 {count} 个关键词...")

        # 调用 skill
        keywords = await generate_keywords_skill(self, business_idea, count)

        self.update_progress("generating", 1.0, f"生成了 {len(keywords)} 个关键词")

        return {
            "keywords": keywords,
            "count": len(keywords),
            "business_idea": business_idea,
            "source": "llm_generated"
        }

    async def _refine(
        self,
        context: Dict[str, Any],
        kwargs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        优化关键词

        Args:
            context: 执行上下文
            kwargs: 参数
                - existing_keywords: 现有关键词
                - feedback: 用户反馈
                - business_idea: 业务创意

        Returns:
            优化结果
        """
        existing = context.get("existing_keywords", kwargs.get("existing_keywords", []))
        feedback = context.get("feedback", kwargs.get("feedback", ""))
        business_idea = context.get("business_idea", kwargs.get("business_idea", ""))

        if not existing:
            raise ValueError("existing_keywords is required")
        if not feedback:
            raise ValueError("feedback is required")

        self.update_progress("refining", 0.5, "正在优化关键词...")

        result = await refine_keywords_skill(self, existing, feedback, business_idea)

        self.update_progress("refining", 1.0, "关键词优化完成")

        return result

    async def _validate(
        self,
        context: Dict[str, Any],
        kwargs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        验证关键词

        Args:
            context: 执行上下文
            kwargs: 参数
                - keywords: 关键词列表
                - business_idea: 业务创意

        Returns:
            验证结果
        """
        keywords = context.get("keywords", kwargs.get("keywords", []))
        business_idea = context.get("business_idea", kwargs.get("business_idea", ""))

        if not keywords:
            raise ValueError("keywords is required")

        self.update_progress("validating", 0.5, f"正在验证 {len(keywords)} 个关键词...")

        result = await validate_keywords_skill(self, keywords, business_idea)

        self.update_progress("validating", 1.0, "关键词验证完成")

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
