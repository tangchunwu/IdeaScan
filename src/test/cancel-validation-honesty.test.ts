// 编译并执行实际 Edge handler；隔离 Supabase/鉴权，避免为行为回归调用生产服务。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { buildValidationEvidence, buildIncompleteAnalysis } from '../../supabase/functions/_shared/validation-evidence.ts';
import { calculateEvidenceGrade, estimateCostBreakdown, createDefaultProofResult } from '../../supabase/functions/_shared/report-metrics.ts';
import { writeRunReport } from '../../supabase/functions/_shared/validation-run';

describe('cancelled validation report', () => {
  it('preserves collected sources but does not turn cancellation into a positive demand decision', async () => {
    const notes = Array.from({ length: 40 }, (_, index) => ({ note_id: `p${index}`, _platform: 'reddit', title: `Post ${index}`, desc: 'nice photo' }));
    const comments = Array.from({ length: 20 }, (_, index) => ({ comment_id: `c${index}`, _platform: 'reddit', post_id: `p${index}`, content: 'looks great' }));
    const existing = { id: 'report', xiaohongshu_data: { totalNotes: 4000, avgLikes: 999, sampleNotes: notes, sampleComments: comments }, competitor_data: [], data_summary: {} };
    const writes: Record<string, Record<string, unknown>> = {};
    const client = { rpc:async (_name:string,args:Record<string,unknown>)=>{writes.validation_reports=args.p_report as Record<string,unknown>;writes.validations={overall_score:args.p_score};return {data:true,error:null}},from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: table === 'validations' ? { id: 'v1', user_id: 'u1', status: 'processing', tags: [] } : existing }),
        update: (value: Record<string, unknown>) => { writes[table] = value; return query; },
        insert: async (value: Record<string, unknown>) => { writes[table] = value; return { error: null }; },
        then: (resolve: (value: unknown) => void) => resolve({ error: null }),
      };
      return query;
    } };
    let handler: (request: Request) => Promise<Response> = async () => new Response();
    const runtime = { env: { get: () => '' }, serve: (value: typeof handler) => { handler = value; } };
    const source = readFileSync(resolve(process.cwd(), 'supabase/functions/cancel-validation/index.ts'), 'utf8');
    const body = source.slice(source.indexOf('Deno.serve('));
    const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('Deno', 'createClient', 'resolveAuthUserOrBypass', 'calculateEvidenceGrade', 'estimateCostBreakdown', 'createDefaultProofResult', 'buildIncompleteAnalysis', 'buildValidationEvidence', 'corsHeaders','writeRunReport', compiled)(runtime, () => client, async () => ({ user: { id: 'u1' } }), calculateEvidenceGrade, estimateCostBreakdown, createDefaultProofResult, buildIncompleteAnalysis, buildValidationEvidence, {},writeRunReport);
    const response = await handler(new Request('https://local/cancel', { method: 'POST', body: JSON.stringify({ validationId: 'v1' }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ overallScore: null, analysisStatus: 'incomplete' });
    expect(writes.validations.overall_score).toBeNull();
    expect(writes.validation_reports.sentiment_analysis).toEqual({ positive: null, neutral: null, negative: null });
    expect(writes.validation_reports.ai_analysis).toMatchObject({ feasibilityScore: null, decision: 'insufficient', analysisStatus: 'incomplete' });
    expect(writes.validation_reports.data_summary).toMatchObject({ analysisStatus: 'incomplete', cancelled: true, validationEvidence: expect.any(Array) });
    expect(writes.validation_reports.xiaohongshu_data).toMatchObject({ totalNotes: 40, sampleNotes: notes, sampleComments: comments });
  });
});
