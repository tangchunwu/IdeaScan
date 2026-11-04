import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { buildValidationScope } from '../../supabase/functions/_shared/validation-evidence.ts';

const source = readFileSync(resolve(process.cwd(), 'supabase/functions/validate-idea-stream/index.ts'), 'utf8');
// 执行主函数实际断点分支，用受控数据库和时钟输入验证行为，不调用上游。
async function resume(options: { idea?: string; market?: string; status?: string; scope?: string; incomplete?: boolean } = {}) {
  const idea = options.idea || 'Trip expenses';
  const tags = ['travel'];
  const config = { marketContext: { country: options.market || 'Japan', countryCode: options.market === 'US' ? 'US' : 'JP', language: options.market === 'US' ? 'en' : 'ja' }, enableXiaohongshu: false, overseasPlatforms: ['reddit'] };
  const originalConfig = { ...config, marketContext: { country: 'Japan', countryCode: 'JP', language: 'ja' } };
  const checkpoint = { researchScope: options.scope ?? buildValidationScope('Trip expenses', tags, originalConfig), analysisStatus: options.incomplete === false ? 'complete' : 'incomplete', carriedEvidence: [], checkpointStage: 'summarize_l1_done', checkpointUpdatedAt: new Date().toISOString() };
  const updates: unknown[] = [];
  const original = { id: 'v1', user_id: 'u1', idea: 'Trip expenses', status: options.status || 'completed' };
  const client = { from: () => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: original }), update: (value: unknown) => { updates.push(value); return query; }, single: async () => ({ data: { ...original, status: 'processing' } }) };
    return query;
  } };
  const region = source.slice(source.indexOf('      const requestedResumeValidationId ='), source.indexOf('      if (!validation) {'));
  const compiled = ts.transpileModule(region, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const run = new Function('args', `return (async () => { const {body,idea,tags,config,user,supabase,loadValidationCheckpoint,buildValidationScope,validateUUID,ValidationError} = args; const runId='offline-run'; let carriedEvidence=[]; ${compiled}; return {validation,resumeCheckpoint,updates:args.updates}; })();`);
  return run({ body: { resumeValidationId: 'v1' }, idea, tags, config, user: { id: 'u1' }, supabase: client, loadValidationCheckpoint: async () => checkpoint, buildValidationScope, validateUUID: (id: string) => id, ValidationError: Error, updates });
}

describe('scoped continuation of validation evidence', () => {
  it('continues a completed but incomplete report using its existing ID', async () => {
    const result = await resume();
    expect(result.validation.id).toBe('v1');
    expect(result.resumeCheckpoint.analysisStatus).toBe('incomplete');
    expect(result.updates).toHaveLength(1);
  });
  it('rejects changed ideas or market context before writing', async () => {
    await expect(resume({ idea: 'A different product' })).rejects.toThrow('研究想法');
    await expect(resume({ market: 'US' })).rejects.toThrow('研究想法');
  });
  it('does not silently start another paid run for missing scope or an active run', async () => {
    await expect(resume({ scope: '' })).rejects.toThrow('旧断点');
    await expect(resume({ status: 'processing' })).rejects.toThrow('不能重复续跑');
    await expect(resume({ incomplete: false })).rejects.toThrow('不能重复续跑');
  });
  it('keeps native post and comment IDs separate across platforms when merging', () => {
    const region = source.slice(source.indexOf('function mergeSocialSamples('), source.indexOf('Deno.serve('));
    const compiled = ts.transpileModule(region, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const merge = new Function(`${compiled}; return mergeSocialSamples;`)();
    const data = (platform: string) => ({ totalNotes: 10000, sampleNotes: [{ note_id: 'same', _platform: platform }], sampleComments: [{ comment_id: 'same-comment', _platform: platform, post_id: 'same' }] });
    const result = merge(data('reddit'), data('twitter'));
    expect(result.sampleNotes).toHaveLength(2);
    expect(result.sampleComments).toHaveLength(2);
    expect(result.totalNotes).toBe(2);
  });
});
