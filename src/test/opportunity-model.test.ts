import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeOpportunitySources, validateRadarModel } from '../../supabase/functions/opportunity-discover/model';

const model = { baseUrl: 'https://api.openai.com/v1', apiKey: 'test-only', model: 'gpt-4o' };
afterEach(() => vi.unstubAllGlobals());
describe('radar model safety', () => {
  it('only accepts configured HTTPS domains without credentials or query strings', () => {
    expect(validateRadarModel(model)).toEqual(model);
    for (const url of ['http://api.openai.com/v1', 'https://127.0.0.1', 'https://localhost', 'https://api.openai.com.evil.com', 'https://x:pass@api.openai.com', 'https://api.openai.com?secret=x', 'https://api.openai.com:8443']) {
      expect(() => validateRadarModel({ ...model, baseUrl: url })).toThrow();
    }
    expect(validateRadarModel({ ...model, baseUrl: 'https://proxy.example.com/v1' }, 'proxy.example.com').baseUrl).toContain('proxy.example.com');
  });
  it('issues one bounded call without redirects and does not follow source URLs', async () => {
    vi.stubGlobal('AbortSignal', { timeout: () => new AbortController().signal });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"candidates":[]}' } }] })));
    vi.stubGlobal('fetch', fetch);
    const result = await analyzeOpportunitySources({ country: 'US', industry: 'Software', platforms: [], mode: 'quick' }, [], model);
    expect(result).toEqual({ candidates: [] });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: 'error', method: 'POST' });
  });
});
