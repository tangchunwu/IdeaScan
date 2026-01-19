"""
业务数据模型

定义业务验证相关的数据模型
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime


# ============================================================================
# 关键词相关
# ============================================================================

class KeywordModel(BaseModel):
    """关键词模型"""
    keywords: List[str] = Field(description="关键词列表")


class KeywordRefinement(BaseModel):
    """关键词优化结果"""
    original_keywords: List[str] = Field(description="原始关键词")
    refined_keywords: List[str] = Field(description="优化后的关键词")
    refinement_reason: str = Field(description="优化原因")
    suggested_additions: List[str] = Field(description="建议添加的关键词")


# ============================================================================
# 小红书笔记相关
# ============================================================================

class XhsNoteModel(BaseModel):
    """小红书笔记模型"""
    note_id: str = Field(description="笔记 ID")
    title: str = Field(description="标题")
    desc: Optional[str] = Field(default=None, description="描述")
    type: str = Field(default="normal", description="笔记类型: normal/video")
    publish_time: int = Field(description="发布时间戳")
    liked_count: int = Field(default=0, description="点赞数")
    collected_count: int = Field(default=0, description="收藏数")
    shared_count: int = Field(default=0, description="分享数")
    comments_count: int = Field(default=0, description="评论数")
    user_id: str = Field(description="用户 ID")
    user_nickname: str = Field(description="用户昵称")
    user_avatar: Optional[str] = Field(default=None, description="用户头像")
    cover_url: Optional[str] = Field(default=None, description="封面图 URL")
    images: List[str] = Field(default_factory=list, description="图片列表")
    keyword_matched: Optional[str] = Field(default=None, description="匹配的关键词")


class XhsCommentModel(BaseModel):
    """小红书评论模型"""
    comment_id: str = Field(description="评论 ID")
    note_id: str = Field(description="笔记 ID")
    content: str = Field(description="评论内容")
    publish_time: int = Field(description="发布时间戳")
    ip_location: Optional[str] = Field(default=None, description="IP 地理位置")
    like_count: int = Field(default=0, description="点赞数")
    user_id: str = Field(description="用户 ID")
    user_nickname: str = Field(description="用户昵称")
    parent_comment_id: Optional[str] = Field(default=None, description="父评论 ID")


class PostWithComments(BaseModel):
    """Post with embedded comments for unified analysis"""
    # All fields from XhsNoteModel
    note_id: str = Field(description="笔记 ID")
    title: str = Field(description="标题")
    desc: Optional[str] = Field(default=None, description="描述")
    type: str = Field(default="normal", description="笔记类型: normal/video")
    publish_time: int = Field(description="发布时间戳")
    liked_count: int = Field(default=0, description="点赞数")
    collected_count: int = Field(default=0, description="收藏数")
    shared_count: int = Field(default=0, description="分享数")
    comments_count: int = Field(default=0, description="评论数")
    user_id: str = Field(description="用户 ID")
    user_nickname: str = Field(description="用户昵称")
    user_avatar: Optional[str] = Field(default=None, description="用户头像")
    cover_url: Optional[str] = Field(default=None, description="封面图 URL")
    images: List[str] = Field(default_factory=list, description="图片列表")
    keyword_matched: Optional[str] = Field(default=None, description="匹配的关键词")

    # Embedded comments (NEW)
    comments_data: List[XhsCommentModel] = Field(default_factory=list, description="该帖子的评论数据")
    comments_fetched: bool = Field(default=False, description="是否已获取评论")
    comments_fetch_error: Optional[str] = Field(default=None, description="评论获取错误信息")


# ============================================================================
# 分析相关
# ============================================================================

class XhsPostAnalysis(BaseModel):
    """小红书帖子分析结果"""
    relevant: bool = Field(description="是否与业务创意相关")
    pain_points: List[str] = Field(default_factory=list, description="用户痛点")
    solutions_mentioned: List[str] = Field(default_factory=list, description="提到的解决方案")
    market_signals: List[str] = Field(default_factory=list, description="市场信号")
    sentiment: str = Field(description="情感倾向: positive/negative/neutral")
    engagement_score: int = Field(default=0, ge=1, le=10, description="互动评分 1-10")
    analysis_summary: Optional[str] = Field(default=None, description="分析摘要")


class PostWithCommentsAnalysis(BaseModel):
    """Unified analysis result for post + its comments"""
    note_id: str = Field(description="笔记 ID")
    title: str = Field(description="标题")

    # Core analysis (from post + comments)
    relevant: bool = Field(description="是否与业务创意相关")
    pain_points: List[str] = Field(default_factory=list, description="用户痛点 (来自帖子+评论)")
    solutions_mentioned: List[str] = Field(default_factory=list, description="提到的解决方案")
    market_signals: List[str] = Field(default_factory=list, description="市场信号")

    # User feedback from comments
    user_insights: List[str] = Field(default_factory=list, description="用户洞察 (来自评论)")
    user_needs: List[str] = Field(default_factory=list, description="用户需求 (来自评论)")
    feedback_sentiment: str = Field(description="评论情感倾向: positive/negative/neutral")

    # Overall assessment
    sentiment: str = Field(description="整体情感倾向: positive/negative/neutral")
    engagement_score: int = Field(default=0, ge=1, le=10, description="互动评分 1-10")
    analysis_summary: Optional[str] = Field(default=None, description="分析摘要")
    comments_count: int = Field(default=0, description="分析的评论数")


class CombinedAnalysis(BaseModel):
    """综合分析结果"""
    overall_score: int = Field(description="综合评分 0-100", ge=0, le=100)
    market_validation_summary: str = Field(description="市场验证摘要")
    key_pain_points: List[str] = Field(default_factory=list, description="关键痛点")
    existing_solutions: List[str] = Field(default_factory=list, description="现有解决方案")
    market_opportunities: List[str] = Field(default_factory=list, description="市场机会")
    recommendations: List[str] = Field(default_factory=list, description="建议")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="元数据")


class CommentsAnalysis(BaseModel):
    """评论分析结果"""
    insights: List[str] = Field(default_factory=list, description="用户洞察")
    common_themes: List[str] = Field(default_factory=list, description="常见主题")
    sentiment_distribution: Dict[str, int] = Field(default_factory=dict, description="情感分布")
    user_needs: List[str] = Field(default_factory=list, description="用户需求")
    pain_points: List[str] = Field(default_factory=list, description="痛点")


class TagAnalysis(BaseModel):
    """标签分析结果 - 基于functions.txt的标签体系"""
    # 一级标签维度
    crowd_scenario: Dict[str, List[str]] = Field(default_factory=dict, description="人群与场景 - 二级标签及其三级标签")
    functional_value: Dict[str, List[str]] = Field(default_factory=dict, description="功能价值 - 二级标签及其三级标签")
    assurance_value: Dict[str, List[str]] = Field(default_factory=dict, description="保障价值 - 二级标签及其三级标签")
    experience_value: Dict[str, List[str]] = Field(default_factory=dict, description="体验价值 - 二级标签及其三级标签")

    # 分析元数据
    total_comments_analyzed: int = Field(default=0, description="分析的评论总数")
    total_tags_applied: int = Field(default=0, description="应用的标签总数")
    analysis_summary: Optional[str] = Field(default=None, description="分析摘要")

    # 标签统计（每个三级标签的应用次数）
    tag_statistics: Dict[str, int] = Field(default_factory=dict, description="标签使用统计")


class PersonaProfile(BaseModel):
    """用户画像"""
    gender: Optional[str] = Field(default=None, description="性别")
    age_estimate: Optional[str] = Field(default=None, description="年龄估计")
    demand_keywords: List[str] = Field(default_factory=list, description="需求关键词")
    purchase_motivation: List[str] = Field(default_factory=list, description="购买动机")
    emotional_tone: Optional[str] = Field(default=None, description="情绪语气判断")
    persona_tags: List[str] = Field(default_factory=list, description="用户画像标签")


class PersonaAnalysis(BaseModel):
    """用户画像分析结果"""
    personas: List[PersonaProfile] = Field(default_factory=list, description="典型用户画像列表")
    total_personas: int = Field(default=0, description="生成画像数量")
    analysis_summary: Optional[str] = Field(default=None, description="分析摘要")


class TagSystemGeneration(BaseModel):
    """标签体系生成结果"""
    人群场景: Dict[str, List[str]] = Field(default_factory=dict, description="人群场景 - 二级标签及其三级标签")
    功能价值: Dict[str, List[str]] = Field(default_factory=dict, description="功能价值 - 二级标签及其三级标签")
    保障价值: Dict[str, List[str]] = Field(default_factory=dict, description="保障价值 - 二级标签及其三级标签")
    体验价值: Dict[str, List[str]] = Field(default_factory=dict, description="体验价值 - 二级标签及其三级标签")


# ============================================================================
# 验证结果相关
# ============================================================================

class ValidationResult(BaseModel):
    """验证结果"""
    business_idea: str = Field(description="业务创意")
    run_id: str = Field(description="运行 ID")
    timestamp: datetime = Field(default_factory=datetime.now, description="验证时间")
    analysis: CombinedAnalysis = Field(description="综合分析")
    raw_data: Dict[str, Any] = Field(default_factory=dict, description="原始数据引用")
    execution_stats: Dict[str, Any] = Field(default_factory=dict, description="执行统计")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
