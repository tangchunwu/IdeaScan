export class ValidationRunStopped extends Error {
  constructor(){super('验证已取消或已由新一轮研究接管');this.name='ValidationRunStopped';}
}
interface RunClient {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>}
export async function writeRunReport(client:RunClient,validationId:string,userId:string,runId:string|null,report:unknown,finish=false,score:number|null=null):Promise<void> {
  const {data,error}=await client.rpc('write_validation_run_report',{p_validation_id:validationId,p_user_id:userId,p_run_id:runId,p_report:report,p_finish:finish,p_score:score});
  if(error)throw new Error('研究结果保存失败，请检查数据库迁移是否已应用');
  if(data!==true)throw new ValidationRunStopped();
}
