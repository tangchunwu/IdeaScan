

## 计划：SEO 全面优化

### 当前问题

1. **canonical 和 OG URL 指向错误域名**：`index.html` 中所有 URL 指向 `ideascan.lovable.app`，而非正式域名 `ideascan.me`
2. **没有 sitemap.xml**：搜索引擎无法发现所有页面
3. **robots.txt 缺少 sitemap 引用**
4. **SPA 无结构化数据**：缺少 JSON-LD（Organization / WebApplication）
5. **keywords 不够丰富**：缺少英文关键词，长尾词不足

### 改动方案

#### 1. 修复 `index.html` — 域名统一 + 结构化数据

- canonical、og:url、twitter:url 全部改为 `https://ideascan.me`
- og:image、twitter:image 改为 `https://ideascan.me/og-image.png`
- 补充英文关键词：`startup validation, idea validator, market research AI`
- 添加 JSON-LD 结构化数据（WebApplication schema）

#### 2. 新建 `public/sitemap.xml`

包含所有公开页面：
- `/` — 首页
- `/validate` — 验证页
- `/discover` — 发现页
- `/pricing` — 定价页
- `/faq` — FAQ
- `/privacy` — 隐私政策
- `/terms` — 服务条款

#### 3. 更新 `public/robots.txt`

添加 `Sitemap: https://ideascan.me/sitemap.xml`

### 改动文件

| 文件 | 改动 |
|------|------|
| `index.html` | 修复域名、补关键词、加 JSON-LD |
| `public/sitemap.xml` | 新建 |
| `public/robots.txt` | 加 sitemap 引用 |

