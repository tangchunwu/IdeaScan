"""
Skills 模块

包含所有业务技能的实现
"""

from .scraper_skills import (
    search_posts_skill,
    get_comments_skill,
    batch_get_comments_skill,
    batch_scrape_skill,
    batch_scrape_with_comments_skill
)

from .analyzer_skills import (
    analyze_post_skill,
    analyze_comments_skill,
    batch_analyze_posts_skill,
    analyze_post_with_comments_skill,
    batch_analyze_posts_with_comments_skill,
    generate_combined_analysis_skill
)

from .reporter_skills import (
    generate_text_report_skill,
    generate_html_report_skill,
    save_report_skill
)


__all__ = [
    # Scraper skills
    "search_posts_skill",
    "get_comments_skill",
    "batch_get_comments_skill",
    "batch_scrape_skill",
    "batch_scrape_with_comments_skill",
    # Analyzer skills
    "analyze_post_skill",
    "analyze_comments_skill",
    "batch_analyze_posts_skill",
    "analyze_post_with_comments_skill",
    "batch_analyze_posts_with_comments_skill",
    "generate_combined_analysis_skill",
    # Reporter skills
    "generate_text_report_skill",
    "generate_html_report_skill",
    "save_report_skill",
]
