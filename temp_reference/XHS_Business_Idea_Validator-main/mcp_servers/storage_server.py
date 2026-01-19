"""
Storage MCP 服务器

提供数据持久化服务
"""

import asyncio
import json
import logging
from typing import Dict, Any, Optional
from datetime import datetime
from pathlib import Path

logger = logging.getLogger("mcp.storage_server")


class StorageMCPServer:
    """
    Storage MCP 服务器

    提供工具:
    - save_checkpoint: 保存检查点
    - load_checkpoint: 加载检查点
    - list_checkpoints: 列出检查点
    - delete_run: 删除运行数据
    """

    def __init__(self, data_dir: str = "agent_context"):
        """
        初始化 Storage MCP 服务器

        Args:
            data_dir: 数据目录
        """
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f"Storage MCP Server initialized: dir={data_dir}")

    async def start(self):
        """启动服务器"""
        logger.info("Storage MCP Server started")

    async def stop(self):
        """停止服务器"""
        logger.info("Storage MCP Server stopped")

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
        if tool_name == "save_checkpoint":
            return await self.save_checkpoint(**kwargs)
        elif tool_name == "load_checkpoint":
            return await self.load_checkpoint(**kwargs)
        elif tool_name == "list_checkpoints":
            return await self.list_checkpoints(**kwargs)
        elif tool_name == "delete_run":
            return await self.delete_run(**kwargs)
        else:
            raise ValueError(f"Unknown tool: {tool_name}")

    async def save_checkpoint(
        self,
        run_id: str,
        step: str,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        保存检查点

        Args:
            run_id: 运行 ID
            step: 步骤名称
            data: 要保存的数据

        Returns:
            {
                "success": true,
                "path": "文件路径"
            }
        """
        try:
            # 创建运行目录
            run_dir = self.data_dir / run_id
            run_dir.mkdir(parents=True, exist_ok=True)

            # 保存文件
            file_path = run_dir / f"{step}.json"

            # 处理不可序列化的对象
            serializable_data = self._make_serializable(data)

            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(serializable_data, f, ensure_ascii=False, indent=2, default=str)

            logger.info(f"Checkpoint saved: {file_path}")

            return {
                "success": True,
                "path": str(file_path)
            }

        except Exception as e:
            logger.error(f"Failed to save checkpoint: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def load_checkpoint(
        self,
        run_id: str,
        step: str
    ) -> Dict[str, Any]:
        """
        加载检查点

        Args:
            run_id: 运行 ID
            step: 步骤名称

        Returns:
            {
                "success": true,
                "data": 检查点数据
            }
            或
            {
                "success": false,
                "error": "错误信息"
            }
        """
        try:
            file_path = self.data_dir / run_id / f"{step}.json"

            if not file_path.exists():
                return {
                    "success": False,
                    "error": f"Checkpoint not found: {file_path}"
                }

            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            logger.info(f"Checkpoint loaded: {file_path}")

            return {
                "success": True,
                "data": data
            }

        except Exception as e:
            logger.error(f"Failed to load checkpoint: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def list_checkpoints(
        self,
        run_id: str
    ) -> Dict[str, Any]:
        """
        列出运行的所有检查点

        Args:
            run_id: 运行 ID

        Returns:
            {
                "success": true,
                "checkpoints": ["step1", "step2", ...]
            }
        """
        try:
            run_dir = self.data_dir / run_id

            if not run_dir.exists():
                return {
                    "success": True,
                    "checkpoints": []
                }

            checkpoints = []
            for file in run_dir.glob("*.json"):
                checkpoints.append(file.stem)

            checkpoints.sort()

            logger.info(f"Listed {len(checkpoints)} checkpoints for {run_id}")

            return {
                "success": True,
                "checkpoints": checkpoints
            }

        except Exception as e:
            logger.error(f"Failed to list checkpoints: {e}")
            return {
                "success": False,
                "error": str(e),
                "checkpoints": []
            }

    async def delete_run(
        self,
        run_id: str
    ) -> Dict[str, Any]:
        """
        删除运行数据

        Args:
            run_id: 运行 ID

        Returns:
            {
                "success": true,
                "deleted": true
            }
        """
        try:
            import shutil
            run_dir = self.data_dir / run_id

            if not run_dir.exists():
                return {
                    "success": False,
                    "error": f"Run not found: {run_id}"
                }

            shutil.rmtree(run_dir)

            logger.info(f"Deleted run data: {run_id}")

            return {
                "success": True,
                "deleted": True
            }

        except Exception as e:
            logger.error(f"Failed to delete run: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    # ========================================================================
    # 工具方法
    # ========================================================================

    def _make_serializable(self, data: Any) -> Any:
        """
        将数据转换为可序列化的格式

        Args:
            data: 原始数据

        Returns:
            可序列化的数据
        """
        if isinstance(data, dict):
            return {k: self._make_serializable(v) for k, v in data.items()}
        elif isinstance(data, list):
            return [self._make_serializable(item) for item in data]
        elif isinstance(data, tuple):
            return tuple(self._make_serializable(item) for item in data)
        elif isinstance(data, set):
            return list(self._make_serializable(item) for item in data)
        elif isinstance(data, (str, int, float, bool, type(None))):
            return data
        elif hasattr(data, 'model_dump'):
            # Pydantic 模型
            return data.model_dump()
        elif hasattr(data, 'isoformat'):
            # datetime, date, time 对象
            return data.isoformat()
        elif isinstance(data, bytes):
            # bytes 类型
            try:
                return data.decode('utf-8')
            except UnicodeDecodeError:
                return data.hex()
        elif isinstance(data, (frozenset)):
            # frozenset 类型
            return list(self._make_serializable(item) for item in data)
        else:
            # 其他类型转为字符串
            return str(data)

    async def ping(self) -> bool:
        """健康检查"""
        return self.data_dir.exists()


# ============================================================================
# 服务器工厂
# ============================================================================

async def create_storage_mcp_server(
    data_dir: str = "agent_context"
) -> StorageMCPServer:
    """
    创建 Storage MCP 服务器实例

    Args:
        data_dir: 数据目录

    Returns:
        Storage MCP 服务器实例
    """
    server = StorageMCPServer(data_dir)
    await server.start()
    return server
