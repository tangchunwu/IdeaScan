import { describe, expect, it, vi } from 'vitest';
import { resolveRadarConfiguration } from '../../supabase/functions/opportunity-discover/configuration';

describe('radar shared credential policy', () => {
  it('requires BYOK by default without reading any shared key', async () => {
    const getPool = vi.fn();
    const getServerTikHubToken = vi.fn();
    await expect(resolveRadarConfiguration({}, { useServerKeys: false, getPool, getServerTikHubToken })).rejects.toThrow('自己的模型');
    expect(getPool).not.toHaveBeenCalled();
    expect(getServerTikHubToken).not.toHaveBeenCalled();
  });
  it('does not supplement user keys from server pools without administrator opt-in', async () => {
    const getPool = vi.fn();
    const getServerTikHubToken = vi.fn();
    const config = await resolveRadarConfiguration({ llmApiKey: 'user-model' }, { useServerKeys: false, getPool, getServerTikHubToken });
    expect(config.sources).toEqual({ tikhubToken: '', bochaApiKey: '', youApiKey: '', tavilyApiKey: '' });
    expect(getPool).not.toHaveBeenCalled();
    expect(getServerTikHubToken).not.toHaveBeenCalled();
  });
  it('reuses existing configuration only after administrator opt-in', async () => {
    const getPool = vi.fn(async (group: string) => group === 'llm'
      ? [{ base_url: 'https://api.openai.com/v1', api_key: 'server-model', model: 'gpt-4o' }]
      : [{ base_url: '', api_key: 'server-search', model: 'tavily' }]);
    const config = await resolveRadarConfiguration({}, { useServerKeys: true, getPool, getServerTikHubToken: () => 'server-social' });
    expect(config.sources.tavilyApiKey).toBe('server-search');
    expect(config.sources.tikhubToken).toBe('server-social');
    expect(getPool).toHaveBeenCalledTimes(2);
  });
});
