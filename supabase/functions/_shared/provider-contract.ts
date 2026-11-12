export type ProviderProtocol =
  | 'openai_chat'
  | 'openai_images'
  | 'openai_videos'
  | 'openai_compatible'
  | 'search_tavily'
  | 'search_bocha'
  | 'search_you'
  | 'custom';

export function normalizeProviderBaseUrl(value: string): string {
  let url: URL;
  try { url = new URL(String(value || '').trim()); } catch { return String(value || '').trim().replace(/\/$/, ''); }
  url.hash = '';
  url.search = '';
  const suffixes = ['/chat/completions', '/responses', '/images/generations', '/images/edits', '/videos', '/models'];
  for (const suffix of suffixes) {
    if (url.pathname.endsWith(suffix)) {
      url.pathname = url.pathname.slice(0, -suffix.length) || '/';
      break;
    }
  }
  url.pathname = url.pathname.replace(/\/v1\/v1\/?$/, '/v1').replace(/\/$/, '') || '/';
  return url.toString().replace(/\/$/, '');
}

export function providerEndpoint(baseUrl: string, path: string): string {
  const base = normalizeProviderBaseUrl(baseUrl);
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function inferProviderProtocol(baseUrl: string, model = '', configured?: string): ProviderProtocol {
  if (configured && ['openai_chat', 'openai_images', 'openai_videos', 'openai_compatible', 'search_tavily', 'search_bocha', 'search_you', 'custom'].includes(configured)) return configured as ProviderProtocol;
  const normalized = String(baseUrl || '').toLowerCase();
  if (/tavily/.test(normalized)) return 'search_tavily';
  if (/bocha/.test(normalized)) return 'search_bocha';
  if (/ydc-index|you\.com/.test(normalized)) return 'search_you';
  if (/images\/(generations|edits)|gpt-image-/.test(normalized) || /^gpt-image-/.test(model)) return 'openai_images';
  if (/videos|sora/.test(normalized) || /^sora/.test(model)) return 'openai_videos';
  return 'openai_compatible';
}
