import type { UnifiedPost } from './channels/types.ts';
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'?value as Record<string,unknown>:{};
/** 仅生成展示地址，不访问外链。API ID 与公开短码分别处理。 */
export function publicPostUrl(post: UnifiedPost): string | undefined {
  const raw=record(post.raw_data);const data=record(raw.post||raw.media||raw.data||raw);
  for(const layer of [raw,data,record(data.share_info)]) for(const field of ['url','share_url','permalink','web_url']) {
    let value=layer[field];if(typeof value!=='string')continue;
    if(post.platform==='reddit'&&value.startsWith('/r/'))value=`https://www.reddit.com${value}`;
    try {const url=new URL(String(value));if(url.protocol==='https:'&&!url.username&&!url.password)return url.href;}catch{ /* 无公开链接时使用下方已知平台路由。 */ }
  }
  const id=post.post_id;
  if(post.platform==='twitter'&&/^\d{15,22}$/.test(id))return `https://x.com/i/status/${id}`;
  if(post.platform==='youtube'&&/^[\w-]{11}$/.test(id))return `https://www.youtube.com/watch?v=${id}`;
  if(post.platform==='douyin'&&/^\d{15,22}$/.test(id))return `https://www.douyin.com/video/${id}`;
  if(post.platform==='xiaohongshu'&&/^[a-f0-9]{24}$/i.test(id))return `https://www.xiaohongshu.com/explore/${id}`;
  const code=data.code||data.shortcode;const user=record(data.user);
  if(post.platform==='threads'&&typeof code==='string'&&/^[\w-]{5,32}$/.test(code)&&typeof user.username==='string'&&/^[\w.]{1,30}$/.test(user.username))return `https://www.threads.com/@${user.username}/post/${code}`;
  if(post.platform==='instagram'&&typeof code==='string'&&/^[\w-]{5,32}$/.test(code))return `https://www.instagram.com/p/${code}/`;
  const author=record(data.author);
  if(post.platform==='tiktok'&&typeof author.unique_id==='string'&&/^[\w.]{1,30}$/.test(author.unique_id)&&/^\d{15,22}$/.test(id))return `https://www.tiktok.com/@${author.unique_id}/video/${id}`;
  return undefined;
}
