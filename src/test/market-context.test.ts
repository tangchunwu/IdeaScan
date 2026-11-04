import { describe, expect, it } from 'vitest';
import { buildMarketQueries, resolveMarketContext } from '../../supabase/functions/_shared/market-context';

describe('目标市场检索', () => {
  it('把日本国家名解析成国家码和本地语言，生成日语经历与反证检索', () => {
    const context = resolveMarketContext({ country: 'Japan', opportunityType: 'festival' });
    expect(context).toMatchObject({ countryCode: 'JP', language: 'ja' });
    const queries = buildMarketQueries(context, '黑五');
    expect(queries.some(q => q.language === 'ja' && /ブラックフライデー/.test(q.query))).toBe(true);
    expect(queries.map(q => q.intent)).toEqual(expect.arrayContaining(['experience', 'payment', 'alternative', 'counter']));
    expect(queries.some(q => /中国市场|country=CN/.test(q.query))).toBe(false);
  });
  it('保留仪式和情绪价值，不统一追加效率工具口径', () => {
    const queries = buildMarketQueries(resolveMarketContext({ country: 'South Korea', opportunityType: 'ritual' }), '愿望');
    expect(queries[0].query).toMatch(/소원/);
    expect(queries.every(q => !/manual workflow/.test(q.query))).toBe(true);
  });
  it('显式语言可覆盖默认，未知地域不擅自设置美国', () => {
    expect(resolveMarketContext({ country: 'Japan', language: 'en' })).toMatchObject({ countryCode: 'JP', language: 'en' });
    expect(resolveMarketContext({ country: 'Unknown island' }).countryCode).toBe('');
  });
});
