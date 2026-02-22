import asyncio
import base64
import json
import logging
import sys
import time
import uuid
from pathlib import Path

# Add the crawler directory to path
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.auth_manager import auth_manager
from app.session_store import session_store
from app.adapters.xiaohongshu_adapter import XiaohongshuAdapter
from app.risk_control import RiskController
from app.config import settings
from app.models import CrawlerJobPayload, CrawlerJobLimits

async def main():
    # 强制关闭所有的代理配置（直连）并打开浏览器看到界面
    settings.crawler_default_proxy_server = ""
    settings.crawler_default_proxy_username = ""
    settings.crawler_default_proxy_password = ""
    settings.crawler_playwright_headless = False

    print("\n【注意】由于代理IP池白名单无法使用当前IP，我们将不走二次代理，使用本机网络直连小红书。")
    print(">>> 这会在后台启动一个【有头浏览器】窗口以方便排查网络环境。")
    
    platform = "xiaohongshu"
    user_id = "test-user-" + uuid.uuid4().hex[:8]
    
    print("\n>>> 1. 正在获取小红书登录二维码...")
    start = await auth_manager.start_flow(platform=platform, user_id=user_id, region="")
    flow_id = start.get("flow_id")
    qr = start.get("qr_image_base64")
    
    if not flow_id or not qr:
        print("❌ 获取二维码失败:", start)
        return

    qr_path = ROOT.parent / ".tmp-ref" / "qr-auth" / "simulate.png"
    qr_path.parent.mkdir(parents=True, exist_ok=True)
    qr_path.write_bytes(base64.b64decode(qr))
    
    import platform as sys_platform
    import subprocess
    system = sys_platform.system().lower()
    if "darwin" in system:
        subprocess.Popen(["open", str(qr_path)])
    
    print(f"\n[扫码提示] 请使用小红书 App 扫描已弹出的二维码确认登录！(Flow ID: {flow_id})")
    print(">>> 2. 等待授权返回结果 (限时 180 秒)...\n")
    
    deadline = time.time() + 180
    authorized = False
    while time.time() < deadline:
        status = await auth_manager.get_status(flow_id)
        state = status.get("status")
        if state == "authorized":
            print("\n✅ 授权成功！")
            authorized = True
            break
        elif state in ("failed", "expired", "cancelled"):
            print(f"\n❌ 授权流程异常中止: {state}")
            return
        await asyncio.sleep(2)
        print(".", end="", flush=True)

    if not authorized:
        print("\n❌ 扫码超时！")
        return
        
    print("\n>>> 3. 分析需求并拆解成关键词...")
    idea = "输入任意严肃的主题，AI 会运用荒诞逻辑和反直觉的类比，生成一段看似深奥实则毫无意义的“废话”文学或脱口秀段子。"
    print(f"原始需求: {idea}")
    keywords = ["废话文学", "AI脱口秀段子", "反角类比", "荒诞逻辑"]
    print(f"拆解出的长尾/核心搜索关键词: {keywords}\n")
    
    print(">>> 4. 开始并行抓取小红书帖子和评论 (使用直连)...")
    risk = RiskController(session_pool_size=1, user_agent_pool=settings.crawler_user_agent_pool)
    adapter = XiaohongshuAdapter(risk)
    
    for kw in keywords:
        print(f"\n==============================================")
        print(f"搜索关键词: 【{kw}】")
        print(f"==============================================")
        
        payload = CrawlerJobPayload(
            validation_id=f"sim-{uuid.uuid4().hex[:8]}",
            trace_id=f"sim-{uuid.uuid4().hex[:8]}",
            user_id=user_id,
            query=kw,
            platforms=[platform],
            mode="quick",
            limits=CrawlerJobLimits(notes=4, comments_per_note=6),
            freshness_days=14,
            timeout_ms=45000,
        )
        
        try:
            result, cost = await adapter.crawl(payload)
            
            if not result.success:
                print(f"❌ 抓取报错: {result.error}")
                continue
                
            print(f"✅ 获取到 {len(result.notes)} 篇有效笔记 和 {len(result.comments)} 条评论。\n")
            
            # 打印部分笔记
            for i, note in enumerate(result.notes[:3]):
                print(f"📝 笔记 {i+1}: 《{note.title}》")
                desc = note.desc[:150] + "..." if len(note.desc) > 150 else note.desc
                desc = desc.replace('\\n', ' ')
                print(f"   摘要: {desc}")
                print(f"   数据: ❤️ {note.liked_count}点赞 | 💬 {note.comments_count}评论 | ⭐ {note.collected_count}收藏\n")
            
            # 打印部分评论
            print(f"💬 相关代表性用户评论抽样:")
            comment_samples = [c for c in result.comments if c.content]
            for i, c in enumerate(comment_samples[:4]):
                content = c.content[:100].replace('\\n', ' ')
                print(f"   [{c.user_nickname}]: {content}")
        except Exception as e:
            print(f"❌ 抓取关键词 {kw} 时发生异常: {e}")

    print("\n\n>>> 模拟验证流程执行完毕！")

if __name__ == "__main__":
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("app.adapters.xiaohongshu_adapter").setLevel(logging.INFO)
    asyncio.run(main())
