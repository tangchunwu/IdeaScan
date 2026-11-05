import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolvePool } from '../_shared/config-resolver.ts';
import { runOpportunityResearch, parseOpportunityRequest } from './core.ts';
import { resolveMarketContext } from '../_shared/market-context.ts';
import { loadResearchHandoff, type ResearchReader } from '../_shared/research-handoff.ts';
import type { OpportunityResult } from '../_shared/opportunity-types.ts';
import { createOpportunityHandler, RadarServiceError } from './handler.ts';
import { collectOpportunitySources, collectOpportunityFollowUpSources } from './sources.ts';
import { analyzeOpportunitySources } from './model.ts';
import { resolveRadarConfiguration } from './configuration.ts';
import { authenticateExternalApiKeyValue, isExternalApiKey } from '../_shared/external-api-key.ts';

const handler = createOpportunityHandler({
  authenticate: async token => {
    if (isExternalApiKey(token)) {
      const external = await authenticateExternalApiKeyValue(token, 'opportunity:read');
      if (external) return { userId: external.userId, external: true };
      return null;
    }
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.getUser(token);
    return !error && data.user ? data.user.id : null;
  },
  research: async (request, config, userId, authMode = 'session') => {
    const { model, sources } = await resolveRadarConfiguration(config, {
      useServerKeys: authMode === 'external' || Deno.env.get('OPPORTUNITY_USE_SERVER_KEYS') === 'true',
      allowedModelHosts: Deno.env.get('OPPORTUNITY_LLM_ALLOWED_HOSTS'), getPool: resolvePool,
      getServerTikHubToken: () => Deno.env.get('TIKHUB_TOKEN') || '',
    });
    if (!sources.bochaApiKey && !sources.youApiKey && !sources.tavilyApiKey && !(sources.tikhubToken && request.platforms.length)) {
      throw new RadarServiceError('请在设置中配置至少一个搜索服务密钥，或配置 TikHub 并选择平台');
    }
    let collect = () => collectOpportunitySources(request, sources);
    if(request.parentResearchId) {
      if(!sources.bochaApiKey&&!sources.youApiKey&&!sources.tavilyApiKey)throw new RadarServiceError('继续补证据需要配置一个搜索服务，以追加价格、替代和反证来源');
      const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
      const {data,error}=await db.from('research_sessions').select('result').eq('id',request.parentResearchId).eq('user_id',userId).maybeSingle();
      if(error||!data)throw new RadarServiceError('研究记录不可用，请检查账号或新建研究');
      const previous=data.result as OpportunityResult;
      const previousRequest=parseOpportunityRequest(previous.request);
      const market=resolveMarketContext(request), oldMarket=resolveMarketContext(previousRequest);
      if((market.countryCode||market.country)!==(oldMarket.countryCode||oldMarket.country)||market.language!==oldMarket.language||request.industry!==previousRequest.industry||request.keyword!==previousRequest.keyword||request.opportunityType!==previousRequest.opportunityType||[...request.platforms].sort().join(',')!==[...previousRequest.platforms].sort().join(','))throw new RadarServiceError('研究范围已变化，请新建研究；旧证据不会自动用于新市场');
      const candidates=previous.candidates?.slice(0,2)||[];
      if(!candidates.length)throw new RadarServiceError('此前研究没有可补证的候选，请新建研究');
      const handoffs=await Promise.all(candidates.map(candidate=>loadResearchHandoff(db as unknown as ResearchReader,userId,request.parentResearchId!,candidate.id)));
      collect=async()=>{
        const added=await collectOpportunityFollowUpSources(request,sources,candidates);
        return {...added,evidence:[...handoffs.flatMap(item=>item.evidence),...added.evidence],warnings:['沿用此前保存的历史原文，追加价格、替代方案和反证检索；原文时间保留，不假装全部重新采集。',...added.warnings]};
      };
    }
    let modelCalls = 0;
    const result = await runOpportunityResearch(request, {
      collect,
      followUp: request.parentResearchId ? undefined : candidates => collectOpportunityFollowUpSources(request, sources, candidates),
      analyze: evidence => { modelCalls += 1; return analyzeOpportunitySources(request, evidence, model); },
    });
    result.stats.apiCalls += modelCalls;
    return result;
  },
});

Deno.serve(handler);
