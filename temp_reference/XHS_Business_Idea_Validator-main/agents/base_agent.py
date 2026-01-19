"""
Agent 基类

定义所有 Agent 的抽象基类和通用接口
"""

import asyncio
import logging
import time
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, Callable
from datetime import datetime
from enum import Enum

from models.agent_models import (
    TaskStatus,
    ProgressUpdate,
    TaskResult,
    AgentMetrics
)
from models.context_models import AgentState
from agents.config import AgentConfig, RetryConfig
from agents.context_store import ContextStore
from agents.logging_config import RequestLogger


class AgentStatus(Enum):
    """Agent 状态"""
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


class BaseAgent(ABC):
    """
    Agent 抽象基类

    所有 Agent 必须继承此类并实现 execute 方法

    职责:
    1. 提供统一的 Agent 接口
    2. 管理 Agent 生命周期
    3. 处理 MCP 调用
    4. 管理执行进度
    5. 支持检查点保存/恢复
    """

    def __init__(
        self,
        name: str,
        config: AgentConfig,
        context_store: ContextStore,
        mcp_clients: Optional[Dict[str, Any]] = None
    ):
        """
        初始化 Agent

        Args:
            name: Agent 名称
            config: Agent 配置
            context_store: 共享上下文存储
            mcp_clients: MCP 客户端字典
        """
        self.name = name
        self.config = config
        self.context_store = context_store
        self.mcp_clients = mcp_clients or {}
        self.status = AgentStatus.IDLE
        self.metrics = AgentMetrics()
        self.logger = logging.getLogger(f"agent.{name}")

        # 请求日志记录器
        self.request_logger = RequestLogger(self.logger)

        # 进度回调
        self._progress_callback: Optional[Callable[[ProgressUpdate], None]] = None

        # 注册到上下文存储
        self.context_store.register_agent(name, config.type)

        self.logger.info(f"Agent initialized: {name} (type={config.type})")

    @abstractmethod
    async def execute(
        self,
        task: str,
        context: Dict[str, Any],
        **kwargs
    ) -> TaskResult:
        """
        执行任务的核心抽象方法

        Args:
            task: 任务描述
            context: 执行上下文
            **kwargs: 额外参数

        Returns:
            TaskResult: 任务执行结果
        """
        pass

    # ========================================================================
    # MCP 调用
    # ========================================================================

    async def use_mcp(
        self,
        server_name: str,
        tool_name: str,
        **kwargs
    ) -> Any:
        """
        调用 MCP 服务器工具

        Args:
            server_name: MCP 服务器名称 (xhs/llm/storage)
            tool_name: 工具名称
            **kwargs: 工具参数

        Returns:
            工具执行结果

        Raises:
            ValueError: MCP 服务器不可用
            Exception: 工具执行失败
        """
        self.metrics.mcp_calls += 1

        if server_name not in self.mcp_clients:
            self.logger.error(f"MCP server '{server_name}' not available")
            raise ValueError(f"MCP server '{server_name}' not available")

        client = self.mcp_clients[server_name]

        # 记录请求日志
        self.request_logger.log_request(
            api_name=f"MCP.{server_name.upper()}",
            method=tool_name,
            params=kwargs
        )

        start_time = time.time()

        try:
            # 根据 client 类型调用
            if asyncio.iscoroutinefunction(client.call_tool):
                result = await client.call_tool(tool_name, **kwargs)
            else:
                result = client.call_tool(tool_name, **kwargs)

            duration_ms = (time.time() - start_time) * 1000

            # 记录响应日志
            self.request_logger.log_response(
                api_name=f"MCP.{server_name.upper()}",
                body={"type": str(type(result)), "tool": tool_name},
                duration_ms=duration_ms
            )

            self.logger.debug(f"MCP result: {type(result)}")
            return result

        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            # 记录错误日志
            self.request_logger.log_response(
                api_name=f"MCP.{server_name.upper()}",
                error=str(e),
                duration_ms=duration_ms
            )
            self.logger.error(f"MCP call failed: {server_name}.{tool_name}: {e}")
            raise

    # ========================================================================
    # LLM 调用
    # ========================================================================

    async def use_llm(
        self,
        prompt: str,
        response_model: Optional[type] = None,
        max_tokens: int = 12000,
        temperature: float = 0.7
    ) -> Any:
        """
        调用 LLM 生成内容

        Args:
            prompt: 提示词
            response_model: Pydantic 响应模型(结构化输出)
            max_tokens: 最大 token 数
            temperature: 温度参数

        Returns:
            LLM 生成结果（直接返回数据，不是 MCP 格式）
        """
        self.metrics.llm_calls += 1

        model_name = response_model.__name__ if response_model else None
        self.logger.debug(f"Calling LLM (response_model={model_name})")

        # 记录请求日志
        self.request_logger.log_request(
            api_name="LLM",
            method="generate_structured" if response_model else "generate_text",
            body={
                "prompt_length": len(prompt),
                "prompt_preview": prompt[:200] + "..." if len(prompt) > 200 else prompt,
                "response_model": model_name,
                "max_tokens": max_tokens,
                "temperature": temperature
            }
        )

        start_time = time.time()

        try:
            # 调用 LLM MCP 服务
            if response_model:
                # 结构化输出
                result = await self.use_mcp(
                    'llm',
                    'generate_structured',
                    prompt=prompt,
                    schema=response_model.model_json_schema()
                )

                # 处理 MCP 返回格式
                if result is None:
                    raise ValueError("LLM MCP returned None")

                # MCP 返回格式是 {success, data}，需要提取 data
                if isinstance(result, dict):
                    if 'data' in result:
                        data = result['data']
                        # 如果需要，转换为 Pydantic 模型
                        if isinstance(data, dict):
                            try:
                                duration_ms = (time.time() - start_time) * 1000
                                self.request_logger.log_response(
                                    api_name="LLM",
                                    body={"model": model_name, "status": "success"},
                                    duration_ms=duration_ms
                                )
                                return response_model(**data)
                            except Exception as e:
                                duration_ms = (time.time() - start_time) * 1000
                                self.request_logger.log_response(
                                    api_name="LLM",
                                    error=f"Validation failed: {e}",
                                    duration_ms=duration_ms
                                )
                                # 详细的错误信息
                                self.logger.error(f"Failed to convert LLM response to {response_model.__name__}")
                                self.logger.error(f"LLM returned data: {data}")
                                self.logger.error(f"Model schema: {response_model.model_json_schema()}")
                                self.logger.error(f"Validation error: {e}")
                                raise ValueError(f"LLM response validation failed: {e}") from e
                        return data
                    elif 'error' in result:
                        raise ValueError(f"LLM error: {result['error']}")
                    # 如果是直接的字典，尝试转换为模型
                    try:
                        duration_ms = (time.time() - start_time) * 1000
                        self.request_logger.log_response(
                            api_name="LLM",
                            body={"model": model_name, "status": "success"},
                            duration_ms=duration_ms
                        )
                        return response_model(**result)
                    except Exception as e:
                        self.logger.error(f"Failed to convert result to {response_model.__name__}: {e}")
                        self.logger.error(f"Result data: {result}")
                        raise ValueError(f"Invalid response format for {response_model.__name__}: {e}") from e

                # 如果是直接的 Pydantic 模型
                return result
            else:
                # 文本输出
                result = await self.use_mcp(
                    'llm',
                    'generate_text',
                    prompt=prompt,
                    max_tokens=max_tokens,
                    temperature=temperature
                )

                # 处理 MCP 返回格式
                if result is None:
                    raise ValueError("LLM MCP returned None")

                if isinstance(result, dict):
                    if 'text' in result:
                        duration_ms = (time.time() - start_time) * 1000
                        self.request_logger.log_response(
                            api_name="LLM",
                            body={"response_length": len(result['text']), "status": "success"},
                            duration_ms=duration_ms
                        )
                        return result['text']
                    elif 'error' in result:
                        raise ValueError(f"LLM error: {result['error']}")
                    elif 'data' in result and isinstance(result['data'], str):
                        duration_ms = (time.time() - start_time) * 1000
                        self.request_logger.log_response(
                            api_name="LLM",
                            body={"response_length": len(result['data']), "status": "success"},
                            duration_ms=duration_ms
                        )
                        return result['data']
                    else:
                        self.logger.warning(f"Unexpected LLM response format: {list(result.keys())}")
                        return str(result)

                return str(result)

        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            self.request_logger.log_response(
                api_name="LLM",
                error=str(e),
                duration_ms=duration_ms
            )
            self.logger.error(f"LLM call failed: {e}")
            raise

    # ========================================================================
    # Agent 委托
    # ========================================================================

    async def delegate_to(
        self,
        agent_name: str,
        task: str,
        context: Dict[str, Any],
        timeout: float = 300.0
    ) -> TaskResult:
        """
        委托任务给其他 Agent

        Args:
            agent_name: 目标 Agent 名称
            task: 任务描述
            context: 任务上下文
            timeout: 超时时间(秒)

        Returns:
            TaskResult: 委托任务的执行结果
        """
        self.logger.info(f"Delegating to {agent_name}: {task}")

        # 从上下文存储获取 Agent
        agent_state = self.context_store.get_agent(agent_name)
        if not agent_state:
            raise ValueError(f"Agent '{agent_name}' not found in context store")

        # 注意: 这里需要实际的 Agent 实例来执行
        # 在完整实现中，应该有一个 AgentRegistry 来管理所有 Agent 实例
        # 这里先抛出 NotImplementedError
        raise NotImplementedError(
            f"Agent delegation not fully implemented. "
            f"Please use Orchestrator to coordinate between agents."
        )

    # ========================================================================
    # 进度管理
    # ========================================================================

    def update_progress(
        self,
        step: str,
        progress: float,
        message: str,
        details: Optional[Dict[str, Any]] = None
    ):
        """
        更新执行进度

        Args:
            step: 当前步骤名称
            progress: 进度百分比 (0-1)
            message: 进度消息
            details: 额外详情
        """
        update = ProgressUpdate(
            agent_name=self.name,
            step=step,
            progress=progress,
            message=message,
            timestamp=datetime.now(),
            details=details or {}
        )

        # 保存到上下文存储
        run_id = self._get_run_id()
        if run_id:
            self.context_store.set_progress(run_id, update)

            # 更新 Agent 状态
            self.context_store.update_agent_status(
                self.name,
                str(self.status),
                current_task=step,
                progress=progress
            )

        # 调用回调
        if self._progress_callback:
            self._progress_callback(update)

        self.logger.debug(f"Progress: {step} - {progress*100:.1f}% - {message}")

    def set_progress_callback(
        self,
        callback: Callable[[ProgressUpdate], None]
    ):
        """
        设置进度回调函数

        Args:
            callback: 回调函数
        """
        self._progress_callback = callback

    def _get_run_id(self) -> Optional[str]:
        """获取当前运行 ID"""
        # 从上下文存储获取当前运行的 ID
        # 这里简化实现，实际可能需要更复杂的逻辑
        runs = self.context_store.list_runs(limit=1)
        return runs[0].run_id if runs else None

    # ========================================================================
    # 检查点管理
    # ========================================================================

    async def save_checkpoint(
        self,
        run_id: str,
        step: str,
        data: Dict[str, Any]
    ):
        """
        保存检查点

        Args:
            run_id: 运行 ID
            step: 步骤名称
            data: 要保存的数据
        """
        try:
            await self.use_mcp(
                'storage',
                'save_checkpoint',
                run_id=run_id,
                step=step,
                data=data
            )
            self.logger.info(f"Checkpoint saved: {run_id}/{step}")
        except Exception as e:
            self.logger.error(f"Failed to save checkpoint: {e}")

    async def load_checkpoint(
        self,
        run_id: str,
        step: str
    ) -> Optional[Dict[str, Any]]:
        """
        加载检查点

        Args:
            run_id: 运行 ID
            step: 步骤名称

        Returns:
            检查点数据，不存在返回 None
        """
        try:
            data = await self.use_mcp(
                'storage',
                'load_checkpoint',
                run_id=run_id,
                step=step
            )
            self.logger.info(f"Checkpoint loaded: {run_id}/{step}")
            return data
        except Exception as e:
            self.logger.warning(f"Failed to load checkpoint {run_id}/{step}: {e}")
            return None

    # ========================================================================
    # 状态管理
    # ========================================================================

    def get_status(self) -> AgentStatus:
        """获取当前状态"""
        return self.status

    def get_metrics(self) -> AgentMetrics:
        """获取运行指标"""
        return self.metrics

    async def health_check(self) -> bool:
        """
        健康检查

        Returns:
            bool: Agent 是否健康
        """
        try:
            # 检查 MCP 连接
            for server_name, client in self.mcp_clients.items():
                if hasattr(client, 'ping'):
                    await client.ping()

            return True
        except Exception as e:
            self.logger.error(f"Health check failed: {e}")
            return False

    # ========================================================================
    # 生命周期管理
    # ========================================================================

    async def start(self):
        """启动 Agent"""
        self.status = AgentStatus.IDLE
        self.logger.info(f"Agent started: {self.name}")

    async def stop(self):
        """停止 Agent"""
        self.status = AgentStatus.IDLE
        self.logger.info(f"Agent stopped: {self.name}")

    async def pause(self):
        """暂停 Agent"""
        if self.status == AgentStatus.RUNNING:
            self.status = AgentStatus.PAUSED
            self.logger.info(f"Agent paused: {self.name}")

    async def resume(self):
        """恢复 Agent"""
        if self.status == AgentStatus.PAUSED:
            self.status = AgentStatus.RUNNING
            self.logger.info(f"Agent resumed: {self.name}")

    # ========================================================================
    # 工具方法
    # ========================================================================

    def _update_metrics(
        self,
        success: bool,
        execution_time: float
    ):
        """
        更新运行指标

        Args:
            success: 是否成功
            execution_time: 执行时间
        """
        self.metrics.tasks_completed += 1 if success else 0
        self.metrics.tasks_failed += 0 if success else 1
        self.metrics.total_execution_time += execution_time

        # 计算平均执行时间
        total_tasks = self.metrics.tasks_completed + self.metrics.tasks_failed
        if total_tasks > 0:
            self.metrics.avg_execution_time = (
                self.metrics.total_execution_time / total_tasks
            )

        self.metrics.last_execution = datetime.now()
