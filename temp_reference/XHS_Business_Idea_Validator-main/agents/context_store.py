"""
上下文存储管理

提供 Agent 之间的共享上下文存储和访问
"""

import json
import logging
from typing import Dict, Any, Optional, List, Callable
from datetime import datetime, timedelta
from pathlib import Path
import threading
from collections import defaultdict

from models.context_models import RunContext, ContextQuery, AgentState
from models.agent_models import ProgressUpdate

logger = logging.getLogger(__name__)


class ContextStore:
    """
    上下文存储基类

    提供内存中的上下文存储，可扩展为 Redis 等持久化存储
    """

    def __init__(self, ttl_seconds: int = 3600):
        """
        初始化上下文存储

        Args:
            ttl_seconds: 数据过期时间(秒)，默认1小时
        """
        self.ttl_seconds = ttl_seconds
        self._runs: Dict[str, RunContext] = {}
        self._agents: Dict[str, AgentState] = {}
        self._progress_history: Dict[str, List[ProgressUpdate]] = defaultdict(list)
        self._lock = threading.RLock()

        logger.info(f"ContextStore initialized with TTL={ttl_seconds}s")

    # ========================================================================
    # 运行上下文管理
    # ========================================================================

    def create_run(
        self,
        business_idea: str,
        user_preferences: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        创建新的运行上下文

        Args:
            business_idea: 业务创意
            user_preferences: 用户偏好

        Returns:
            运行 ID
        """
        import hashlib

        # 生成运行 ID
        idea_hash = hashlib.md5(business_idea.encode()).hexdigest()[:8]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        run_id = f"{business_idea[:20]}_{timestamp}_{idea_hash}"

        # 创建上下文
        context = RunContext(
            run_id=run_id,
            business_idea=business_idea,
            user_preferences=user_preferences or {},
            expires_at=datetime.now() + timedelta(seconds=self.ttl_seconds)
        )

        with self._lock:
            self._runs[run_id] = context

        logger.info(f"Created run context: {run_id}")
        return run_id

    def get_run(self, run_id: str) -> Optional[RunContext]:
        """
        获取运行上下文

        Args:
            run_id: 运行 ID

        Returns:
            运行上下文，不存在返回 None
        """
        with self._lock:
            context = self._runs.get(run_id)

            # 检查是否过期
            if context and context.expires_at:
                if datetime.now() > context.expires_at:
                    logger.warning(f"Run context expired: {run_id}")
                    del self._runs[run_id]
                    return None

            return context

    def update_run(
        self,
        run_id: str,
        **updates
    ) -> bool:
        """
        更新运行上下文

        Args:
            run_id: 运行 ID
            **updates: 要更新的字段

        Returns:
            是否成功
        """
        with self._lock:
            context = self._runs.get(run_id)
            if not context:
                logger.warning(f"Run context not found: {run_id}")
                return False

            # 更新字段
            for key, value in updates.items():
                if hasattr(context, key):
                    setattr(context, key, value)

            return True

    def set_run_data(
        self,
        run_id: str,
        key: str,
        value: Any
    ) -> bool:
        """
        设置运行数据

        Args:
            run_id: 运行 ID
            key: 数据键
            value: 数据值

        Returns:
            是否成功
        """
        with self._lock:
            context = self._runs.get(run_id)
            if not context:
                return False

            # 根据键设置对应字段
            if key == "keywords":
                context.keywords = value
            elif key == "posts":
                context.posts = value
            elif key == "analyses":
                context.analyses = value
            elif key == "final_report":
                context.final_report = value
            else:
                # 存入 metadata
                context.metadata[key] = value

            return True

    def update_run_status(
        self,
        run_id: str,
        status: str
    ) -> bool:
        """
        更新运行状态

        Args:
            run_id: 运行 ID
            status: 新状态

        Returns:
            是否成功
        """
        return self.update_run(run_id, status=status)

    def get_run_data(
        self,
        run_id: str,
        key: str
    ) -> Optional[Any]:
        """
        获取运行数据

        Args:
            run_id: 运行 ID
            key: 数据键

        Returns:
            数据值
        """
        context = self.get_run(run_id)
        if not context:
            return None

        # 根据键获取对应字段
        if key == "keywords":
            return context.keywords
        elif key == "posts":
            return context.posts
        elif key == "analyses":
            return context.analyses
        elif key == "final_report":
            return context.final_report
        else:
            return context.metadata.get(key)

    def list_runs(
        self,
        limit: int = 10,
        status: Optional[str] = None
    ) -> List[RunContext]:
        """
        列出运行上下文

        Args:
            limit: 最多返回数量
            status: 状态筛选

        Returns:
            运行上下文列表
        """
        with self._lock:
            runs = list(self._runs.values())

            # 状态筛选
            if status:
                runs = [r for r in runs if r.status == status]

            # 排序（最新在前）
            runs.sort(key=lambda r: r.created_at, reverse=True)

            # 限制数量
            return runs[:limit]

    def delete_run(self, run_id: str) -> bool:
        """
        删除运行上下文

        Args:
            run_id: 运行 ID

        Returns:
            是否成功
        """
        with self._lock:
            if run_id in self._runs:
                del self._runs[run_id]
                logger.info(f"Deleted run context: {run_id}")
                return True
            return False

    # ========================================================================
    # 进度管理
    # ========================================================================

    def set_progress(
        self,
        run_id: str,
        update: ProgressUpdate
    ):
        """
        设置进度

        Args:
            run_id: 运行 ID
            update: 进度更新
        """
        with self._lock:
            # 保存到历史
            self._progress_history[run_id].append(update)

            # 限制历史长度
            if len(self._progress_history[run_id]) > 100:
                self._progress_history[run_id] = self._progress_history[run_id][-50:]

            # 更新运行上下文
            context = self._runs.get(run_id)
            if context:
                context.progress_updates.append({
                    "agent": update.agent_name,
                    "step": update.step,
                    "progress": update.progress,
                    "message": update.message,
                    "timestamp": update.timestamp.isoformat()
                })

    def get_progress(
        self,
        run_id: str,
        limit: int = 50
    ) -> List[ProgressUpdate]:
        """
        获取进度历史

        Args:
            run_id: 运行 ID
            limit: 最多返回数量

        Returns:
            进度更新列表
        """
        with self._lock:
            history = self._progress_history.get(run_id, [])
            return history[-limit:]

    def get_latest_progress(
        self,
        run_id: str
    ) -> Optional[ProgressUpdate]:
        """
        获取最新进度

        Args:
            run_id: 运行 ID

        Returns:
            最新进度更新
        """
        history = self.get_progress(run_id, 1)
        return history[0] if history else None

    # ========================================================================
    # Agent 状态管理
    # ========================================================================

    def register_agent(
        self,
        agent_name: str,
        agent_type: str
    ):
        """
        注册 Agent

        Args:
            agent_name: Agent 名称
            agent_type: Agent 类型
        """
        with self._lock:
            if agent_name not in self._agents:
                self._agents[agent_name] = AgentState(
                    agent_name=agent_name,
                    agent_type=agent_type,
                    status="idle"
                )
                logger.info(f"Registered agent: {agent_name} ({agent_type})")

    def get_agent(self, agent_name: str) -> Optional[AgentState]:
        """
        获取 Agent 状态

        Args:
            agent_name: Agent 名称

        Returns:
            Agent 状态
        """
        with self._lock:
            return self._agents.get(agent_name)

    def update_agent_status(
        self,
        agent_name: str,
        status: str,
        current_task: Optional[str] = None,
        progress: float = 0.0
    ):
        """
        更新 Agent 状态

        Args:
            agent_name: Agent 名称
            status: 状态
            current_task: 当前任务
            progress: 进度
        """
        with self._lock:
            agent = self._agents.get(agent_name)
            if agent:
                agent.status = status
                agent.current_task = current_task
                agent.progress = progress
                agent.last_update = datetime.now()

    def list_agents(
        self,
        agent_type: Optional[str] = None
    ) -> List[AgentState]:
        """
        列出所有 Agent

        Args:
            agent_type: 类型筛选

        Returns:
            Agent 状态列表
        """
        with self._lock:
            agents = list(self._agents.values())

            if agent_type:
                agents = [a for a in agents if a.agent_type == agent_type]

            return agents

    # ========================================================================
    # 清理
    # ========================================================================

    def cleanup_progress_history(self, run_id: str) -> int:
        """
        清理指定 run 的进度历史（用于 run 完成后释放内存）

        Args:
            run_id: 运行 ID

        Returns:
            清理的进度记录数量
        """
        with self._lock:
            if run_id in self._progress_history:
                count = len(self._progress_history[run_id])
                del self._progress_history[run_id]
                logger.debug(f"Cleaned up {count} progress records for run: {run_id}")
                return count
        return 0

    def cleanup_expired(self) -> int:
        """
        清理过期数据

        Returns:
            清理的运行数量
        """
        now = datetime.now()
        expired_runs = []

        with self._lock:
            for run_id, context in self._runs.items():
                if context.expires_at and now > context.expires_at:
                    expired_runs.append(run_id)

            for run_id in expired_runs:
                del self._runs[run_id]
                if run_id in self._progress_history:
                    del self._progress_history[run_id]

        if expired_runs:
            logger.info(f"Cleaned up {len(expired_runs)} expired runs")

        return len(expired_runs)

    def clear_all(self):
        """清空所有数据"""
        with self._lock:
            self._runs.clear()
            self._agents.clear()
            self._progress_history.clear()
            logger.info("Cleared all context data")


class FileSystemContextStore(ContextStore):
    """
    基于文件系统的上下文存储

    持久化上下文到文件系统
    """

    def __init__(
        self,
        data_dir: str = "agent_context",
        ttl_seconds: int = 3600
    ):
        """
        初始化文件系统上下文存储

        Args:
            data_dir: 数据目录
            ttl_seconds: 过期时间
        """
        super().__init__(ttl_seconds)
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)

        # 加载已有数据
        self._load_from_disk()

    def _load_from_disk(self):
        """从磁盘加载数据"""
        # 这里可以实现从文件加载已有上下文的逻辑
        logger.info(f"FileSystemContextStore initialized with dir: {self.data_dir}")

    def _save_run_to_disk(self, run_id: str):
        """保存运行上下文到磁盘"""
        context = self._runs.get(run_id)
        if not context:
            return

        run_file = self.data_dir / f"{run_id}.json"

        try:
            with open(run_file, 'w', encoding='utf-8') as f:
                json.dump(
                    context.model_dump(),
                    f,
                    ensure_ascii=False,
                    indent=2,
                    default=str
                )
        except Exception as e:
            logger.error(f"Failed to save run context to disk: {e}")

    def update_run(self, run_id: str, **updates) -> bool:
        """更新运行上下文并持久化"""
        result = super().update_run(run_id, **updates)
        if result:
            self._save_run_to_disk(run_id)
        return result


# ============================================================================
# 全局上下文存储实例
# ============================================================================

_global_context_store: Optional[ContextStore] = None


def get_context_store() -> ContextStore:
    """
    获取全局上下文存储实例

    Returns:
        上下文存储实例
    """
    global _global_context_store
    if _global_context_store is None:
        _global_context_store = ContextStore()
    return _global_context_store


def set_context_store(store: ContextStore):
    """设置全局上下文存储实例"""
    global _global_context_store
    _global_context_store = store
