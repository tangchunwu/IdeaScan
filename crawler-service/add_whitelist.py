import urllib.request
import urllib.parse
import json

import os
def get_my_ip():
    try:
        return os.popen('curl -s ifconfig.me').read().strip()
    except Exception as e:
        print(f"获取本机IP失败: {e}")
        return None

def add_whitelist(ip, key, sign):
    # 提取 API URL
    url = f"https://api.quanminip.com/qmip-product/outer/whiteIP/add?key={key}&sign={sign}&ip={ip}"
    print(f"正在调用白名单接口: {url.replace(sign, '***')}")
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as response:
            res_str = response.read().decode('utf-8')
            print(f"接口返回: {res_str}")
            res_json = json.loads(res_str)
            if res_json.get("code") == 0 or res_json.get("code") == 200:
                print(f"✅ 成功将IP {ip} 加入代理白名单！")
                return True
            else:
                print("❌ 添加白名单失败")
                return False
    except Exception as e:
        print(f"请求失败: {e}")
        return False

if __name__ == "__main__":
    my_ip = get_my_ip()
    if my_ip:
        print(f"探测到本机外部IP: {my_ip}")
        # 用户提供的套餐 ID 和 认证密码
        key = "202602211637657898"  # 从最新截图独享资源池看到的账号，如果不对等下再换之前的
        # sign="qreuhxyd"
        # 考虑到上文提到隧道和普通代理可能使用老账号：
        # key: 202602200922523622 sign: qreuhxyd
        # 新截图独立资源池: 套餐ID: 202602211637657898 认证密码 UfX0jMTs
        key = "202602211637657898"
        sign = "UfX0jMTs"
        
        ok = add_whitelist(my_ip, key, sign)
        if not ok:
            print("尝试使用之前的密钥重试...")
            ok2 = add_whitelist(my_ip, "202602200922523622", "qreuhxyd")
            if not ok2:
                 print("尝试长效静态隧道提取密码 4cc4d890dfc1257a90130e07e428aa27...")
                 add_whitelist(my_ip, "202602200922523622", "4cc4d890dfc1257a90130e07e428aa27")
