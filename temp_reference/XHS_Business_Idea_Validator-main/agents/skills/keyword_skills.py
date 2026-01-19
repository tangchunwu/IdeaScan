"""
关键词生成 Skills

提供关键词相关的业务技能
"""

import logging
from typing import List, Dict, Any

from models.business_models import KeywordModel, KeywordRefinement
from agents.base_agent import BaseAgent


logger = logging.getLogger(__name__)


async def generate_keywords_skill(
    agent: BaseAgent,
    business_idea: str,
    count: int = 3
) -> List[str]:
    """
    生成搜索关键词

    Args:
        agent: Agent 实例
        business_idea: 业务创意
        count: 生成数量

    Returns:
        关键词列表
    """
    logger.info(f"Generating {count} keywords for: {business_idea}")

    prompt = f"""
你是一位市场调研专家。请为以下业务创意生成 {count} 个搜索关键词：

业务创意："{business_idea}"

要求：
1. 关键词应该是小红书用户会搜索的短语
2. 每个关键词3-6个字
3. 覆盖不同角度：产品名、用途、场景、人群等
4. 返回中文关键词
5. 如果业务创意中包含地点信息，请考虑地域相关搜索

示例：
- 输入："在深圳卖陈皮"
- 输出：["深圳陈皮", "新会陈皮深圳", "陈皮茶深圳", "深圳特产陈皮", "陈皮养生"]

请以 JSON 格式返回，格式为：
{{
    "keywords": ["关键词1", "关键词2", "关键词3"]
}}
"""

    try:
        result = await agent.use_llm(
            prompt=prompt,
            response_model=KeywordModel
        )

        keywords = result.keywords if hasattr(result, 'keywords') else result.get('keywords', [])
        logger.info(f"Generated keywords: {keywords}")
        return keywords

    except Exception as e:
        logger.error(f"Failed to generate keywords: {e}")
        # 改进的 fallback 机制：从业务创意中提取关键词
        fallback_keywords = _extract_fallback_keywords(business_idea, count)
        logger.warning(f"Using fallback keywords: {fallback_keywords}")
        return fallback_keywords


async def refine_keywords_skill(
    agent: BaseAgent,
    existing_keywords: List[str],
    feedback: str,
    business_idea: str
) -> Dict[str, Any]:
    """
    优化关键词

    Args:
        agent: Agent 实例
        existing_keywords: 现有关键词
        feedback: 用户反馈
        business_idea: 业务创意

    Returns:
        优化结果
    """
    logger.info(f"Refining keywords based on feedback: {feedback}")

    prompt = f"""
作为市场调研专家，请根据反馈优化以下关键词：

原始关键词：{existing_keywords}
业务创意：{business_idea}
用户反馈：{feedback}

请提供：
1. 优化后的关键词列表（保持与原始数量相同）
2. 优化的原因（简短说明）
3. 建议额外添加的关键词（1-2个）

请以 JSON 格式返回：
{{
    "refined_keywords": ["关键词1", "关键词2", ...],
    "refinement_reason": "优化原因",
    "suggested_additions": ["建议1", "建议2"]
}}
"""

    try:
        result = await agent.use_llm(
            prompt=prompt,
            response_model=KeywordRefinement
        )

        if hasattr(result, 'model_dump'):
            return result.model_dump()
        else:
            return result

    except Exception as e:
        logger.error(f"Failed to refine keywords: {e}")
        return {
            "refined_keywords": existing_keywords,
            "refinement_reason": "保持原样",
            "suggested_additions": []
        }


async def validate_keywords_skill(
    agent: BaseAgent,
    keywords: List[str],
    business_idea: str
) -> Dict[str, Any]:
    """
    验证关键词质量

    Args:
        agent: Agent 实例
        keywords: 关键词列表
        business_idea: 业务创意

    Returns:
        验证结果
    """
    logger.info(f"Validating {len(keywords)} keywords")

    validation_results = []

    for keyword in keywords:
        # 简单验证规则
        is_valid = len(keyword) >= 2 and len(keyword) <= 10
        score = 8 if is_valid else 4

        validation_results.append({
            "keyword": keyword,
            "valid": is_valid,
            "score": score,
            "suggestion": "keep" if is_valid else "too short or too long"
        })

    valid_count = sum(1 for v in validation_results if v["valid"])
    avg_score = sum(v["score"] for v in validation_results) / len(validation_results) if validation_results else 0

    return {
        "validation_results": validation_results,
        "valid_count": valid_count,
        "total_count": len(keywords),
        "avg_score": avg_score
    }


# ============================================================================
# 辅助函数
# ============================================================================

def _extract_fallback_keywords(business_idea: str, count: int = 3) -> List[str]:
    """
    从业务创意中提取 fallback 关键词

    Args:
        business_idea: 业务创意描述
        count: 需要的关键词数量

    Returns:
        提取的关键词列表
    """
    import re

    keywords = []

    # 1. 直接使用完整的业务创意（如果不太长）
    if len(business_idea) <= 8:
        keywords.append(business_idea)

    # 2. 提取核心词（去掉常见动词和介词）
    # 移除常见的前缀词
    cleaned = re.sub(r'^(在|从|向|把|被|让|使|给|为)', '', business_idea)
    # 移除动作词
    cleaned = re.sub(r'(卖|买|做|开|搞|弄|办|建|创|造|制|生产|加工|销售|经营|运营)', '', cleaned)
    # 移除常见后缀
    cleaned = re.sub(r'(业务|项目|创意|计划|方案|服务|平台|系统)$', '', cleaned)

    if cleaned and len(cleaned) >= 2 and cleaned != business_idea:
        keywords.append(cleaned.strip())

    # 3. 提取地点信息（如果有的话）
    location_match = re.search(r'(北京|上海|广州|深圳|杭州|成都|重庆|武汉|西安|南京|天津|苏州|无锡|宁波|青岛|大连|厦门|长沙|郑州|哈尔滨|沈阳|济南|石家庄|太原|合肥|南昌|福州|昆明|贵阳|兰州|南宁|海口|呼和浩特|银川|西宁|拉萨|乌鲁木齐|台北|香港|澳门)', business_idea)
    if location_match:
        location = location_match.group(1)
        # 尝试组合地点和其他词
        for word in ['体验', '推广', '市场', '加盟', '招商', '代理']:
            combined = f"{location}{word}"
            if combined not in keywords:
                keywords.append(combined)
                if len(keywords) >= count:
                    break

    # 4. 如果还不够，尝试拆分短语
    if len(keywords) < count:
        # 按常见分隔符拆分
        parts = re.split(r'[、，,和与及]', business_idea)
        for part in parts:
            part = part.strip()
            if 2 <= len(part) <= 8 and part not in keywords:
                keywords.append(part)
                if len(keywords) >= count:
                    break

    # 5. 最后的 fallback：使用业务创意的主要部分
    if len(keywords) < count:
        # 如果业务创意包含多个词，取主要产品/服务名
        words = re.findall(r'[\u4e00-\u9fa5]{2,6}', business_idea)
        for word in words:
            if word not in keywords:
                keywords.append(word)
                if len(keywords) >= count:
                    break

    # 确保至少有一个关键词
    if not keywords:
        keywords = [business_idea[:6] if len(business_idea) > 6 else business_idea]

    # 截取到需要的数量
    return keywords[:count]
