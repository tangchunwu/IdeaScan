import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolvePool } from '../_shared/config-resolver.ts';
import { runOpportunityResearch } from './core.ts';
import { createOpportunityHandler, RadarServiceError } from './handler.ts';
import { collectOpportunitySources } from './sources.ts';
import { analyzeOpportunitySources } from './model.ts';
import { resolveRadarConfiguration } from './configuration.ts';

const handler = createOpportunityHandler({
  authenticate: async token => {
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.getUser(token);
    return !error && data.user ? data.user.id : null;
  },
  research: async (request, config) => {
    const { model, sources } = await resolveRadarConfiguration(config, {
      useServerKeys: Deno.env.get('OPPORTUNITY_USE_SERVER_KEYS') === 'true',
      allowedModelHosts: Deno.env.get('OPPORTUNITY_LLM_ALLOWED_HOSTS'), getPool: resolvePool,
      getServerTikHubToken: () => Deno.env.get('TIKHUB_TOKEN') || '',
    });
    if (!sources.bochaApiKey && !sources.youApiKey && !sources.tavilyApiKey && !(sources.tikhubToken && request.platforms.length)) {
      throw new RadarServiceError('请在设置中配置至少一个搜索服务密钥，或配置 TikHub 并选择平台');
    }
    let modelCalls = 0;
    const result = await runOpportunityResearch(request, {
      collect: () => collectOpportunitySources(request, sources),
      analyze: evidence => { modelCalls += 1; return analyzeOpportunitySources(request, evidence, model); },
    });
    result.stats.apiCalls += modelCalls;
    return result;
  },
});

Deno.serve(handler);
