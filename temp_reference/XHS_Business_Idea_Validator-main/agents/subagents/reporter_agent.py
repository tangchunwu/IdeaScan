"""
报告生成 Agent

负责生成业务验证报告
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from pathlib import Path

from agents.base_agent import BaseAgent, AgentStatus, TaskResult
from agents.config import AgentConfig, ConfigManager, RetryConfig
from agents.context_store import ContextStore
from agents.skills.reporter_skills import (
    generate_text_report_skill,
    generate_html_report_skill,
    save_report_skill
)


logger = logging.getLogger("agent.reporter")


class ReporterAgent(BaseAgent):
    """
    报告生成 Agent

    职责:
    1. 生成文本格式报告
    2. 生成 HTML 格式报告
    3. 保存报告到文件

    Skills:
    - generate_text_report: 生成文本报告
    - generate_html_report: 生成 HTML 报告
    - save_report: 保存报告到文件
    """

    def __init__(
        self,
        config: ConfigManager,
        context_store: ContextStore,
        mcp_clients: Dict[str, Any]
    ):
        # 从 ConfigManager 获取 agent 配置
        agent_configs = config.get_agent_configs()
        agent_config = agent_configs.get("reporter", AgentConfig(
            name="reporter_agent",
            type="reporter",
            enabled=True,
            timeout=120.0
        ))

        super().__init__(
            name="reporter_agent",
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
        执行报告任务

        Args:
            task: 任务类型 (generate_text/generate_html/save/generate_and_save)
            context: 执行上下文
            **kwargs: 额外参数

        Returns:
            TaskResult: 任务执行结果
        """
        self.status = AgentStatus.RUNNING
        start_time = datetime.now()

        try:
            if task == "generate_text":
                result = await self._generate_text(context, kwargs)
            elif task == "generate_html":
                # 检查是否需要自动保存
                auto_save = context.get("auto_save", kwargs.get("auto_save", False))
                if auto_save:
                    result = await self.generate_and_save_report(context, "html", True)
                else:
                    result = await self._generate_html(context, kwargs)
            elif task == "save":
                result = await self._save(context, kwargs)
            elif task == "generate_and_save":
                report_format = context.get("report_format", kwargs.get("report_format", "html"))
                result = await self.generate_and_save_report(context, report_format, True)
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
            logger.exception(f"Reporter task failed: {task}")
            execution_time = (datetime.now() - start_time).total_seconds()
            self._update_metrics(False, execution_time)

            self.status = AgentStatus.FAILED
            return TaskResult(
                success=False,
                error=str(e),
                agent_name=self.name,
                execution_time=execution_time
            )

    async def _generate_text(
        self,
        context: Dict[str, Any],
        kwargs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        生成文本报告

        Args:
            context: 执行上下文
            kwargs: 参数
                - analysis: 综合分析结果
                - business_idea: 业务创意
                - run_id: 运行 ID

        Returns:
            文本报告结果
        """
        analysis = context.get("analysis", kwargs.get("analysis", {}))
        business_idea = context.get("business_idea", kwargs.get("business_idea", ""))
        run_id = context.get("run_id", kwargs.get("run_id", "unknown"))

        if not analysis:
            raise ValueError("analysis is required")
        if not business_idea:
            raise ValueError("business_idea is required")

        self.update_progress("generating_text_report", 0.5, "正在生成文本报告...")

        # 调用 skill
        result = await generate_text_report_skill(self, analysis, business_idea, run_id)

        if result.get("success"):
            self.update_progress("generating_text_report", 1.0, "文本报告生成完成")
        else:
            self.update_progress("generating_text_report", 1.0, "文本报告生成失败")

        return result

    async def _generate_html(
        self,
        context: Dict[str, Any],
        kwargs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        生成 HTML 报告

        Args:
            context: 执行上下文
            kwargs: 参数
                - analysis: 综合分析结果
                - business_idea: 业务创意
                - run_id: 运行 ID
                - posts_data: 笔记数据（可选）
                - comments_data: 评论数据（可选）
                - tag_analysis: 评论标签分析结果（可选）

        Returns:
            HTML 报告结果
        """
        analysis = context.get("analysis", kwargs.get("analysis", {}))
        business_idea = context.get("business_idea", kwargs.get("business_idea", ""))
        run_id = context.get("run_id", kwargs.get("run_id", "unknown"))
        posts_data = context.get("posts_data", kwargs.get("posts_data"))
        comments_data = context.get("comments_data", kwargs.get("comments_data"))
        tag_analysis = context.get("comments_tag_analysis", kwargs.get("tag_analysis"))

        if not analysis:
            raise ValueError("analysis is required")
        if not business_idea:
            raise ValueError("business_idea is required")

        self.update_progress("generating_html_report", 0.5, "正在生成 HTML 报告...")

        # 调用 skill
        result = await generate_html_report_skill(
            self,
            analysis,
            business_idea,
            run_id,
            posts_data,
            comments_data,
            tag_analysis
        )

        if result.get("success"):
            self.update_progress("generating_html_report", 1.0, "HTML 报告生成完成")
        else:
            self.update_progress("generating_html_report", 1.0, "HTML 报告生成失败")

        return result

    async def _save(
        self,
        context: Dict[str, Any],
        kwargs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        保存报告到文件

        Args:
            context: 执行上下文
            kwargs: 参数
                - report_content: 报告内容
                - report_format: 报告格式 (text/html)
                - output_path: 输出路径（可选，默认自动生成）

        Returns:
            保存结果
        """
        report_content = context.get("report_content", kwargs.get("report_content", ""))
        report_format = context.get("report_format", kwargs.get("report_format", "text"))
        business_idea = context.get("business_idea", kwargs.get("business_idea", ""))
        run_id = context.get("run_id", kwargs.get("run_id", "unknown"))

        if not report_content:
            raise ValueError("report_content is required")

        # 生成输出路径
        output_path = kwargs.get("output_path")
        if not output_path:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            safe_business_idea = "".join(c for c in business_idea if c.isalnum() or c in (' ', '-', '_')).strip()
            extension = "html" if report_format == "html" else "txt"

            # 默认保存到 reports 目录
            output_path = f"reports/{safe_business_idea}_{timestamp}.{extension}"

        self.update_progress("saving_report", 0.5, f"正在保存报告到: {output_path}")

        # 调用 skill
        result = await save_report_skill(self, report_content, report_format, output_path)

        if result.get("success"):
            self.update_progress("saving_report", 1.0, "报告保存完成")

            # 保存检查点
            run_id_for_checkpoint = context.get("run_id")
            if run_id_for_checkpoint:
                await self.save_checkpoint(
                    run_id_for_checkpoint,
                    "report_saved",
                    {
                        "report_path": result.get("path"),
                        "report_format": report_format,
                        "file_size": result.get("size")
                    }
                )
        else:
            self.update_progress("saving_report", 1.0, "报告保存失败")

        return result

    async def generate_and_save_report(
        self,
        context: Dict[str, Any],
        report_format: str = "html",
        auto_save: bool = True
    ) -> Dict[str, Any]:
        """
        生成并保存报告的便捷方法

        Args:
            context: 执行上下文
            report_format: 报告格式 (text/html)
            auto_save: 是否自动保存

        Returns:
            报告生成和保存结果
        """
        # 生成报告
        if report_format == "html":
            generate_result = await self._generate_html(context, {})
        else:
            generate_result = await self._generate_text(context, {})

        if not generate_result.get("success"):
            return generate_result

        result = {
            "generation": generate_result,
            "saved": False
        }

        # 自动保存
        if auto_save:
            save_context = {
                "report_content": generate_result.get("content"),
                "report_format": report_format,
                "business_idea": context.get("business_idea", ""),
                "run_id": context.get("run_id", "unknown")
            }

            save_result = await self._save(save_context, {})
            result["saving"] = save_result
            result["saved"] = save_result.get("success", False)

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
