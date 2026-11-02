import type { RadarRuntimeConfig } from './handler.ts';
import { RadarServiceError } from './handler.ts';
import { validateRadarModel } from './model.ts';

export async function resolveRadarConfiguration(config: RadarRuntimeConfig, deps: {
  useServerKeys: boolean;
  allowedModelHosts?: string;
  getPool: (group: string) => Promise<Array<{ base_url: string; api_key: string; model: string }>>;
  getServerTikHubToken: () => string;
}) {
  // 未接分布式预算之前，公共付费密钥必须由管理员显式开放。
  if (!config.llmApiKey && !deps.useServerKeys) throw new RadarServiceError('请在设置中填写自己的模型地址、密钥和模型名称；商机研究不使用免费验证额度');
  const pool = config.llmApiKey || !deps.useServerKeys ? [] : await deps.getPool('llm');
  const provider = pool[0];
  const model = validateRadarModel(config.llmApiKey ? {
    baseUrl: config.llmBaseUrl || 'https://api.openai.com/v1', apiKey: config.llmApiKey, model: config.llmModel || 'gpt-4o',
  } : { baseUrl: provider?.base_url || '', apiKey: provider?.api_key || '', model: provider?.model || '' }, deps.allowedModelHosts);
  const searchPool = deps.useServerKeys ? await deps.getPool('search_api') : [];
  const sources = {
    tikhubToken: config.tikhubToken || (deps.useServerKeys ? deps.getServerTikHubToken() : '') || '',
    bochaApiKey: config.bochaApiKey || searchPool.find(p => p.model === 'bocha')?.api_key || '',
    youApiKey: config.youApiKey || searchPool.find(p => p.model === 'you')?.api_key || '',
    tavilyApiKey: config.tavilyApiKey || searchPool.find(p => p.model === 'tavily')?.api_key || '',
  };
  return { model, sources };
}
