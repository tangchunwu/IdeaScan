/**
 * Jina Reader - 将网页转换为干净的 Markdown
 * 
 * 使用 Jina AI 的免费 Reader API 清洗网页内容，
 * 移除广告、导航栏、脚本等噪音，只保留核心文本。
 */

export interface JinaResult {
  url: string;
  markdown: string;
  title: string;
  success: boolean;
  error?: string;
}

/**
 * 清洗单个网页
 * @param url 要清洗的网页 URL
 * @param maxLength 返回 markdown 的最大字符数 (默认 5000)
 */
export async function cleanWithJina(
  url: string, 
  maxLength = 5000
): Promise<JinaResult> {
  try {
    // Jina Reader API - 免费，无需 API Key
    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 
        'Accept': 'text/markdown',
        'X-No-Cache': 'true'
      },
      signal: AbortSignal.timeout(15000) // 15 秒超时
    });
    
    if (!response.ok) {
      return { 
        url, 
        markdown: '', 
        title: '', 
        success: false,
        error: `HTTP ${response.status}`
      };
    }
    
    const markdown = await response.text();
    
    // 提取标题 (第一个 # 开头的行)
    const titleMatch = markdown.match(/^#\s+(.+)$/m);
    
    // 清理 markdown，移除过长内容
    const cleanedMarkdown = cleanMarkdown(markdown, maxLength);
    
    return {
      url,
      markdown: cleanedMarkdown,
      title: titleMatch?.[1]?.trim() || '',
      success: true
    };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[Jina] Error cleaning URL:', url, errorMsg);
    return { 
      url, 
      markdown: '', 
      title: '', 
      success: false,
      error: errorMsg
    };
  }
}

/**
 * 批量清洗竞品网页
 * @param urls URL 列表
 * @param maxConcurrent 最大并发数 (默认 3)
 * @param maxLength 每个页面的最大字符数
 */
export async function cleanCompetitorPages(
  urls: string[], 
  maxConcurrent = 3,
  maxLength = 5000
): Promise<JinaResult[]> {
  const results: JinaResult[] = [];
  
  // 去重并过滤无效 URL
  const validUrls = [...new Set(urls)].filter(url => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  });
  
  // 分批处理
  for (let i = 0; i < validUrls.length; i += maxConcurrent) {
    const batch = validUrls.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(url => cleanWithJina(url, maxLength))
    );
    results.push(...batchResults);
    
    // 批次间速率限制 (避免被限流)
    if (i + maxConcurrent < validUrls.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  return results;
}

/**
 * 清理 markdown 内容
 * - 移除过多空行
 * - 截断到指定长度
 * - 保留完整段落
 */
function cleanMarkdown(markdown: string, maxLength: number): string {
  // 移除连续空行
  let cleaned = markdown.replace(/\n{3,}/g, '\n\n');
  
  // 移除图片链接 (减少噪音)
  cleaned = cleaned.replace(/!\[.*?\]\(.*?\)/g, '');
  
  // 移除链接但保留文本
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  
  // 如果超过长度，在段落边界截断
  if (cleaned.length > maxLength) {
    const truncated = cleaned.slice(0, maxLength);
    const lastParagraph = truncated.lastIndexOf('\n\n');
    if (lastParagraph > maxLength * 0.5) {
      cleaned = truncated.slice(0, lastParagraph) + '\n\n[...内容已截断]';
    } else {
      cleaned = truncated + '...[内容已截断]';
    }
  }
  
  return cleaned.trim();
}

/**
 * 判断 URL 是否适合用 Jina 清洗
 * 某些网站不适合或无法清洗
 */
export function isCleanableUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    
    // 排除的域名模式
    const excludePatterns = [
      /^(www\.)?youtube\.com/,
      /^(www\.)?youtu\.be/,
      /^(www\.)?twitter\.com/,
      /^(www\.)?x\.com/,
      /^(www\.)?instagram\.com/,
      /^(www\.)?facebook\.com/,
      /^(www\.)?tiktok\.com/,
      /^(www\.)?weixin\.qq\.com/,
      /^mp\.weixin\.qq\.com/,
    ];
    
    // 检查是否在排除列表中
    for (const pattern of excludePatterns) {
      if (pattern.test(parsed.hostname)) {
        return false;
      }
    }
    
    // 排除非 HTTP 协议
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}
