import asyncio
import base64
import json
import logging
import sys
import time
import uuid
import os
from pathlib import Path

# Add the crawler directory to path
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.session_store import session_store
from app.adapters.xiaohongshu_adapter import XiaohongshuAdapter
from app.risk_control import RiskController
from app.config import settings
from app.models import CrawlerJobPayload, CrawlerJobLimits
from playwright.async_api import async_playwright

async def get_or_create_session(platform, user_id):
    print(">>> 1. 正在调起带缓存的浏览器窗口 (防止重复扫码)...")
    profile_dir = ROOT.parent / ".tmp-ref" / "xhs_profile"
    profile_dir.mkdir(parents=True, exist_ok=True)
    
    async with async_playwright() as p:
        # 使用持久化上下文，扫一次码以后就记住了
        context = await p.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
            viewport={"width": 1280, "height": 800}
        )
        page = context.pages[0] if context.pages else await context.new_page()
        print("🌍 正在访问小红书网页端...")
        await page.goto("https://www.xiaohongshu.com/explore", wait_until="domcontentloaded")
        
        print("\n=======================================================")
        print("🕵️‍♂️ 状态检测中...请在弹出的浏览器中确认您是否已处于【登录状态】。")
        print("如果未登录，请在浏览器里直接扫码登录。")
        print("=======================================================\n")
        
        # 等待页面出现登录后的特征（如侧边栏的用户头像或用户名称）
        logged_in = False
        for _ in range(30):
            try:
                # 小红书登录后通常侧边栏会有用户信息或者发笔记按钮
                is_avatar_visible = await page.locator("a.user-profile").is_visible()
                is_create_visible = await page.locator(".publish-btn").is_visible()
                if is_avatar_visible or is_create_visible:
                    logged_in = True
                    break
            except Exception:
                pass
            await asyncio.sleep(2)
            
        if not logged_in:
             print("⚠️ 未自动检测到登录状态，等待额外 30 秒供您扫码...")
             await asyncio.sleep(30)
             
        print("✅ 确认登录环境就绪！正在提取并保存安全 Cookie...")
        cookies = await context.cookies()
        
        # 将 Cookie 写入爬虫会话池
        await session_store.upsert_user_session(
            platform=platform,
            user_id=user_id,
            cookies=cookies,
            user_agent=settings.crawler_user_agent_pool.split(",")[0].strip(),
            region="",
            source="manual_persistent_login",
        )
        await context.close()

async def main():
    # 强制直连
    settings.crawler_default_proxy_server = ""
    settings.crawler_default_proxy_username = ""
    settings.crawler_default_proxy_password = ""
    settings.crawler_playwright_headless = False
    
    # 核心：降低爬虫频率，保护账号 (延迟调高至 4-7 秒！)
    settings.crawler_quick_delay_ms_min = 4000
    settings.crawler_quick_delay_ms_max = 7000
    settings.crawler_deep_delay_ms_min = 4000
    settings.crawler_deep_delay_ms_max = 7000

    platform = "xiaohongshu"
    user_id = "test-user-safe"
    
    await get_or_create_session(platform, user_id)
        
    print("\n>>> 2. 分析需求并拆解成关键词...")
    idea = "AI 辅助写荒诞逻辑和反直觉类比的废话文学和脱口秀"
    print(f"原始需求: {idea}")
    keywords = ["AI废话文学", "AI脱口秀段子", "反直觉类比"]
    print(f"安全抓取策略已开启 (每次操作间隔 4-7 秒)。搜索关键词: {keywords}\n")
    
    print(">>> 3. 开始执行缓慢且安全的并行抓取...")
    risk = RiskController(session_pool_size=1, user_agent_pool=settings.crawler_user_agent_pool)
    adapter = XiaohongshuAdapter(risk)
    
    for kw in keywords:
        print(f"\n==============================================")
        print(f"🔍 正在安全搜索关键词: 【{kw}】")
        print(f"==============================================")
        
        # 每个词只采样 3 篇笔记，且每篇笔记最多拉 4 条评论，确保不过度请求
        payload = CrawlerJobPayload(
            validation_id=f"sim-{uuid.uuid4().hex[:8]}",
            trace_id=f"sim-{uuid.uuid4().hex[:8]}",
            user_id=user_id,
            query=kw,
            platforms=[platform],
            mode="quick",
            limits=CrawlerJobLimits(notes=3, comments_per_note=4),
            freshness_days=30,
            timeout_ms=60000, 
            ignore_relevance_filter=True,  # 关闭严格的相关性过滤以确保少样本时也能吐出数据
        )
        
        try:
            result, cost = await adapter.crawl(payload)
            
            if not result.success:
                print(f"❌ 抓取报错 (可能触发了滑块验证或限流): {result.error}")
                # 遇到风控休息一下
                await asyncio.sleep(10)
                continue
                
            print(f"✅ 安全拉取完毕！获取到 {len(result.notes)} 篇有效笔记 和 {len(result.comments)} 条评论。\n")
            
            for i, note in enumerate(result.notes[:2]):
                print(f"📝 笔记 {i+1}: 《{note.title}》")
                desc = note.desc[:100] + "..." if len(note.desc) > 100 else note.desc
                desc = desc.replace('\\n', ' ')
                print(f"   摘要: {desc}")
                print(f"   数据表现: ❤️ {note.liked_count} | 💬 {note.comments_count} | ⭐ {note.collected_count}\n")
            
            print(f"💬 代表性评论抽样 (AI分析素材):")
            comment_samples = [c for c in result.comments if c.content]
            for i, c in enumerate(comment_samples[:3]):
                content = c.content[:80].replace('\\n', ' ')
                print(f"   - {c.user_nickname}: {content}")
                
        except Exception as e:
            print(f"❌ 抓取关键词 {kw} 时发生异常: {e}")
            
        print("\n⏳ 冷却等待 5 秒进入下个关键词...")
        await asyncio.sleep(5)

    print("\n\n>>> 🎉 模拟仿真数据调研已完成，账号安全无虞！")

if __name__ == "__main__":
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("app.adapters.xiaohongshu_adapter").setLevel(logging.INFO)
    asyncio.run(main())
