"""
上下文存储的数据模型
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from datetime import datetime


class RunContext(BaseModel):
    """运行上下文"""
    run_id: str = Field(description="运行 ID")
    business_idea: str = Field(description="业务创意")
    user_preferences: Dict[str, Any] = Field(default_factory=dict, description="用户偏好")
    created_at: datetime = Field(default_factory=datetime.now, description="创建时间")
    expires_at: Optional[datetime] = Field(default=None, description="过期时间")
    status: str = Field(default="running", description="状态: running/completed/failed")

    # 各阶段数据
    keywords: Optional[List[str]] = Field(default=None, description="生成的关键词")
    posts: Optional[List[Dict[str, Any]]] = Field(default=None, description="抓取的帖子")
    analyses: Optional[List[Dict[str, Any]]] = Field(default=None, description="分析结果")
    final_report: Optional[Dict[str, Any]] = Field(default=None, description="最终报告")

    # 进度信息
    progress_updates: List[Dict[str, Any]] = Field(default_factory=list, description="进度更新历史")

    # 元数据
    metadata: Dict[str, Any] = Field(default_factory=dict, description="元数据")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class ContextQuery(BaseModel):
    """上下文查询"""
    run_id: Optional[str] = Field(default=None, description="运行 ID")
    business_idea: Optional[str] = Field(default=None, description="业务创意")
    status: Optional[str] = Field(default=None, description="状态筛选")
    date_from: Optional[datetime] = Field(default=None, description="起始日期")
    date_to: Optional[datetime] = Field(default=None, description="结束日期")
    limit: int = Field(default=10, ge=1, le=100, description="返回数量限制")


class AgentState(BaseModel):
    """Agent 状态"""
    agent_name: str = Field(description="Agent 名称")
    agent_type: str = Field(description="Agent 类型")
    status: str = Field(description="状态: idle/running/paused/completed/failed")
    current_task: Optional[str] = Field(default=None, description="当前任务")
    progress: float = Field(default=0.0, ge=0.0, le=1.0, description="当前进度")
    metrics: Dict[str, Any] = Field(default_factory=dict, description="运行指标")
    last_update: datetime = Field(default_factory=datetime.now, description="最后更新时间")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
