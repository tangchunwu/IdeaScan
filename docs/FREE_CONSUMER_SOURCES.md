# 免费消费证据来源

商机雷达在娱乐价值研究时，会在不新增密钥的情况下补充四个公开源：

- GitHub 公共仓库搜索：Stars、Forks、更新时间和项目描述。
- Hacker News：通过公开 HN 搜索接口获取故事、分数和评论数。
- App Store：通过公开 iTunes Search 接口获取价格、评分和评分数。
- Steam：通过公开 Store Search 接口获取价格和产品页。

同时，已有 Tavily、You 和 Bocha 网页检索在娱乐模式的付费查询中增加站内目标：

- Google Play 商店页面
- Etsy listing 页面
- Gumroad 商品页面

这些公开源只在娱乐价值研究中启用，避免工具型研究增加无关请求。公开页面和未授权接口的字段可能变化，结果应标记为公开消费证据，不等于平台流水。

## 证据边界

- GitHub Stars、HN 分数、App Store 评分和 Steam 评价只能说明使用或关注信号，不能直接推断收入。
- App Store、Steam、Google Play、Etsy 和 Gumroad 的价格可以作为 `pricing` 证据。
- 用户评论中的“买过、订阅过、退款、太贵”等内容才进入购买或反证判断。
- Etsy 官方 Open API 需要应用密钥并有 QPS/QPD 限制；当前版本先用公开网页检索，后续再考虑申请 API。
- TikTok、Instagram、Patreon、Ko-fi 等授权或受限平台仍沿用各自权限边界，不伪装成免费全网数据源。
