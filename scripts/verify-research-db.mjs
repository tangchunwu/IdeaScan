// 在隔离 PGlite 中执行真实迁移；不读取环境凭据，不连接生产数据库。
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.argv[2] || '@electric-sql/pglite');
const db=new PGlite();let checks=0;
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const V='11111111-1111-4111-8111-111111111111',R1='22222222-2222-4222-8222-222222222222',R2='33333333-3333-4333-8333-333333333333';
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
INSERT INTO auth.users VALUES('${A}'),('${B}');
CREATE TABLE public.validations(id uuid PRIMARY KEY,user_id uuid,status text,overall_score integer,updated_at timestamptz DEFAULT now());
CREATE TABLE public.validation_reports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),validation_id uuid,created_at timestamptz DEFAULT now(),market_analysis jsonb,xiaohongshu_data jsonb,competitor_data jsonb,sentiment_analysis jsonb,ai_analysis jsonb,dimensions jsonb,persona jsonb,data_summary jsonb,data_quality_score integer,keywords_used jsonb,evidence_grade text,cost_breakdown jsonb,proof_result jsonb);`);
for(const file of ['20261104090000_add_research_sessions.sql','20261104091000_validation_run_writes.sql','20261104100000_research_session_versions.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
async function asUser(role,id,fn){await db.exec(`SET ROLE ${role}`);if(id)await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);try{return await fn()}finally{await db.exec('RESET ROLE')}}
function ok(value,message){assert.ok(value,message);checks++}
const saved=await asUser('authenticated',A,()=>db.query('INSERT INTO public.research_sessions(user_id,result) VALUES($1,$2) RETURNING id',[A,{schemaVersion:1}]));
const S=saved.rows[0].id;ok(!!S,'owner insert');
ok((await asUser('authenticated',B,()=>db.query('SELECT * FROM public.research_sessions'))).rows.length===0,'other user cannot read');
for(const sql of ["UPDATE public.research_sessions SET result='{}' WHERE id=$1 RETURNING id",'DELETE FROM public.research_sessions WHERE id=$1 RETURNING id'])ok((await asUser('authenticated',B,()=>db.query(sql,[S]))).rows.length===0,'other user cannot modify');
await assert.rejects(()=>asUser('authenticated',B,()=>db.query('INSERT INTO public.research_sessions(user_id,result) VALUES($1,$2)',[A,{}])));checks++;
await assert.rejects(()=>asUser('authenticated',A,()=>db.query('UPDATE public.research_sessions SET user_id=$1 WHERE id=$2',[B,S])));checks++;
await assert.rejects(()=>asUser('anon',null,()=>db.query('SELECT * FROM public.research_sessions')));checks++;
const first=await asUser('authenticated',A,()=>db.query("UPDATE public.research_sessions SET outcomes=$1 WHERE id=$2 AND outcomes='{}'::jsonb RETURNING id",[{c1:[]},S]));ok(first.rows.length===1,'first CAS writes');
const stale=await asUser('authenticated',A,()=>db.query("UPDATE public.research_sessions SET outcomes=$1 WHERE id=$2 AND outcomes='{}'::jsonb RETURNING id",[{c2:[]},S]));ok(stale.rows.length===0,'stale CAS does not overwrite');
const signature='public.write_validation_run_report(uuid,uuid,uuid,jsonb,boolean,integer)';
for(const role of ['anon','authenticated'])ok((await db.query('SELECT has_function_privilege($1,$2,$3) AS allowed',[role,signature,'EXECUTE'])).rows[0].allowed===false,'RPC restricted');
await db.query('INSERT INTO public.validations(id,user_id,status,active_run_id) VALUES($1,$2,$3,$4)',[V,A,'processing',R1]);
async function write(user,run,report,finish=false,score=null){return asUser('service_role',null,async()=> (await db.query('SELECT public.write_validation_run_report($1,$2,$3,$4,$5,$6) AS accepted',[V,user,run,report,finish,score])).rows[0].accepted)}
ok(await write(B,R1,{data_summary:{}})===false,'wrong owner refused');
ok(await write(A,R2,{data_summary:{}})===false,'wrong run refused');
ok(await write(A,R1,{xiaohongshu_data:{sampleNotes:[{id:1},{id:2}],sampleComments:[]},data_summary:{checkpointStage:'crawl',researchScope:'scope'}})===true,'checkpoint accepted');
ok(await write(A,R1,{data_summary:{checkpointStage:'analyze'}})===true,'next checkpoint accepted');
ok((await db.query('SELECT data_summary FROM public.validation_reports')).rows[0].data_summary.researchScope==='scope','checkpoint merge preserves scope');
ok(await write(A,R1,{xiaohongshu_data:{sampleNotes:[{id:1}],sampleComments:[]},data_summary:{cancelled:true,analysisStatus:'incomplete',sampleCounts:{posts:1,comments:0}}},true)===true,'cancel finishes atomically');
ok((await db.query('SELECT xiaohongshu_data FROM public.validation_reports')).rows[0].xiaohongshu_data.sampleNotes.length===2,'cancel keeps newer checkpoint samples');
ok(await write(A,R1,{data_summary:{analysisStatus:'complete'}},true,99)===false,'old finish cannot overwrite cancellation');
await db.query("UPDATE public.validations SET status='processing',active_run_id=$1 WHERE id=$2",[R2,V]);
ok(await write(A,R1,{data_summary:{old:true}})===false,'old checkpoint refused after resume');
ok(await write(A,R1,{data_summary:{old:true}},true,99)===false,'old finish refused after resume');
ok(await write(A,R2,{data_summary:{analysisStatus:'complete'}},true,60)===true,'new run finishes');
ok((await db.query('SELECT count(*)::integer AS n FROM public.validation_reports')).rows[0].n===1,'no duplicate report');
ok((await db.query('SELECT overall_score FROM public.validations WHERE id=$1',[V])).rows[0].overall_score===60,'latest run owns score');
ok((await db.query("SELECT version_no,parent_session_id,change_summary FROM public.research_sessions WHERE id=$1",[S])).rows[0].version_no===1,'research version fields exist');
await db.close();
console.log(`研究数据库隔离验证通过：${checks} 项（真实迁移、RLS、CAS、运行代际、取消与续跑）`);
