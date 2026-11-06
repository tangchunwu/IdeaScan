// 使用产品客户端采集，禁止另写“递归寻找第一个数组”的解析器。
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TikHubClient } from '../supabase/functions/_shared/tikhub-client.ts';

export const defaultPlan = [
  { platform: 'tiktok', query: '사주', region: 'KR' },
  { platform: 'threads', query: 'kahve falı' },
];

const text = value => typeof value === 'string' ? value : '';
const count = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0;

export function projectPost(platform, item) {
  const id = String(platform === 'tiktok' ? item.aweme_id || item.id || item.video_id || '' : item.pk || item.id || '');
  const handle = text(platform === 'tiktok' ? item.author?.unique_id : item.user?.username);
  const code = text(item.code);
  const content = platform === 'tiktok' ? text(item.desc || item.description || item.title) : text(item.caption?.text || item.text);
  const url = platform === 'tiktok' && /^\d{15,22}$/.test(id) && /^[\w.]{1,30}$/.test(handle)
    ? `https://www.tiktok.com/@${handle}/video/${id}`
    : platform === 'threads' && /^[\w.]{1,30}$/.test(handle) && /^[\w-]{5,32}$/.test(code)
      ? `https://www.threads.com/@${handle}/post/${code}` : '';
  const stats = platform === 'tiktok' ? item.statistics || {} : item;
  return { platform, id, content, url, publishedAt: item.create_time || item.taken_at || null,
    metrics: { likes: count(stats.digg_count ?? stats.like_count), comments: count(stats.comment_count ?? stats.direct_reply_count ?? stats.reply_count), shares: count(stats.share_count ?? stats.repost_count) } };
}

export function projectComment(platform, item, post) {
  return { platform, id: String(item.cid || item.pk || item.id || item.comment_id || ''), postId: post.id,
    parentUrl: post.url, content: text(item.text || item.caption?.text || item.content),
    likes: count(item.digg_count ?? item.like_count) };
}

function failure(error) {
  // 只输出受控诊断字段；原始上游响应、账号信息和密钥不进入报告。
  return { status: 'failed', kind: error?.kind || 'unexpected', httpStatus: error?.httpStatus ?? null,
    ...(error?.businessCode !== undefined ? { businessCode: error.businessCode } : {}) };
}

export async function collectQuery(plan, client, { maxPosts = 5, commentPosts = 2, commentLimit = 5 } = {}) {
  const result = { ...plan, search: { status: 'pending' }, posts: [], commentProbes: [], comments: [] };
  try {
    const page = plan.platform === 'tiktok'
      ? await client.searchTikTok(plan.query, { count: 20, region: plan.region || 'US' })
      : await client.searchThreads(plan.query);
    result.posts = page.items.slice(0, maxPosts).map(item => projectPost(plan.platform, item)).filter(post => post.id);
    result.search = { status: result.posts.length ? 'success' : 'empty', parsedCount: page.items.length, savedCount: result.posts.length };
    for (const post of result.posts.slice(0, commentPosts)) {
      try {
        const raw = plan.platform === 'tiktok'
          ? await client.getTikTokComments(post.id, commentLimit)
          : await client.getThreadsComments(post.id, commentLimit);
        const comments = raw.map(item => projectComment(plan.platform, item, post)).filter(item => item.id && item.content);
        result.comments.push(...comments);
        result.commentProbes.push({ postId: post.id, status: comments.length ? 'success' : 'empty', count: comments.length });
      } catch (error) {
        result.commentProbes.push({ postId: post.id, ...failure(error) });
        if ([401, 402, 403, 422, 429].includes(error?.status) || error?.kind === 'budget') break;
      }
    }
  } catch (error) { result.search = failure(error); }
  result.apiCalls = client.stats.apiCalls;
  return result;
}

function markdown(report) {
  const out = ['# TikTok / Threads 修正后采集记录', '', `采集时间：${report.startedAt}`, '',
    '使用 IdeaScan 的 TikHubClient，正文保留原文；空结果与失败分开记录，不把 HTTP 200 当成已取得内容。', ''];
  for (const item of report.results) {
    out.push(`## ${item.platform} · ${item.query}`, '', `搜索：${item.search.status}；已保存 ${item.posts.length} 条帖子、${item.comments.length} 条评论；API 请求 ${item.apiCalls} 次。`, '');
    if (item.search.status === 'failed') out.push(`错误类型：${item.search.kind}；HTTP ${item.search.httpStatus ?? '未收到响应'}`, '');
    for (const post of item.posts) {
      out.push(`### 帖子 ${post.id}`, '', post.content, '', `原文：${post.url || '未取得可用原文链接'}`, '', `互动：${JSON.stringify(post.metrics)}`, '');
      const probe = item.commentProbes.find(probe => probe.postId === post.id);
      if (probe) out.push(`评论采集：${probe.status}${probe.kind ? `（${probe.kind} / HTTP ${probe.httpStatus ?? '无'}）` : ''}`, '');
      for (const comment of item.comments.filter(comment => comment.postId === post.id)) out.push(`> ${comment.content.replace(/\n/g, '\n> ')}`, '');
    }
  }
  return out.join('\n');
}

export async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; };
  const token = process.env.TIKHUB_TOKEN;
  if (!token?.trim()) throw new Error('请通过 --env-file 加载 TIKHUB_TOKEN');
  const planPath = option('--plan', '');
  const plan = planPath ? JSON.parse(await readFile(planPath, 'utf8')) : defaultPlan;
  if (!Array.isArray(plan) || !plan.length || plan.some(item => !['tiktok', 'threads'].includes(item.platform) || typeof item.query !== 'string' || !item.query.trim())) throw new Error('查询计划必须包含 tiktok/threads 和非空 query');
  const output = resolve(option('--out', 'outputs/tikhub-tiktok-threads-verification.json'));
  const report = { startedAt: new Date().toISOString(), client: 'IdeaScan TikHubClient', results: [] };
  await mkdir(dirname(output), { recursive: true });
  for (const query of plan) {
    const client = new TikHubClient(token, { maxRetries: 0, timeoutMs: 30000, maxRequests: 3 });
    report.results.push(await collectQuery(query, client));
    // 每个关键词独立落盘，进程中断也不会丢失已完成的采集。
    const serialized = JSON.stringify(report, null, 2);
    if (serialized.includes(token)) throw new Error('输出脱敏校验失败');
    await writeFile(`${output}.tmp`, serialized, { mode: 0o600 });
    await rename(`${output}.tmp`, output);
    await writeFile(output.replace(/\.json$/, '') + '.md', markdown(report), { mode: 0o600 });
    const latest = report.results.at(-1);
    console.log(JSON.stringify({ platform: query.platform, search: latest.search, posts: latest.posts.length, comments: latest.comments.length, apiCalls: latest.apiCalls }));
  }
  console.log(`采集记录已保存：${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('采集未完成，请检查环境和已保存的分阶段结果。'); process.exitCode = 1; });
}
