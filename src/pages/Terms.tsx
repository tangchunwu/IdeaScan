import { PageBackground, Navbar, GlassCard } from "@/components/shared";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const Terms = () => {
       return (
              <PageBackground showClouds={false}>
                     <Navbar />
                     <main className="pt-28 pb-16 px-4">
                            <div className="max-w-4xl mx-auto">
                                   <GlassCard className="p-8 md:p-12">
                                          <h1 className="text-3xl font-bold mb-2 text-foreground">服务条款 (Terms of Service)</h1>
                                          <p className="text-muted-foreground mb-8">最后更新日期：2024年2月3日</p>

                                          <ScrollArea className="h-[60vh] pr-4">
                                                 <div className="space-y-8 text-foreground/90 leading-relaxed">
                                                        <section>
                                                               <h2 className="text-xl font-semibold mb-3">1. 协议接受</h2>
                                                               <p>
                                                                      欢迎使用 IdeaScan（以下简称“本服务”）。通过访问或使用本服务，即表示您同意接受这些条款的约束。
                                                                      如果您不同意这些条款的任何部分，则您无权访问本服务。
                                                               </p>
                                                        </section>

                                                        <Separator />

                                                        <section>
                                                               <h2 className="text-xl font-semibold mb-3">2. 服务描述</h2>
                                                               <p>
                                                                      IdeaScan 提供基于人工智能的商业创意验证、市场分析和小红书数据洞察服务。
                                                                      我们的服务仅辅助决策，不对任何商业投资结果负责。分析结果基于大模型和公开数据生成，可能存在局限性。
                                                               </p>
                                                        </section>

                                                        <Separator />

                                                        <section>
                                                               <h2 className="text-xl font-semibold mb-3">3. 账户与安全</h2>
                                                               <ul className="list-disc pl-5 space-y-2">
                                                                      <li>您负责维护账户凭证的机密性。</li>
                                                                      <li>您对账户下的所有活动负全责。</li>
                                                                      <li>为了使用各项功能，您必须提供准确、完整的注册信息。</li>
                                                               </ul>
                                                        </section>

                                                        <Separator />

                                                        <section>
                                                               <h2 className="text-xl font-semibold mb-3">4. 知识产权</h2>
                                                               <p>
                                                                      本服务及其原创内容（不包括用户生成的内容）、功能和设计仍然是 IdeaScan 及其许可方的专有财产。
                                                                      本服务受版权、商标和其他法律保护。
                                                               </p>
                                                        </section>

                                                        <Separator />

                                                        <section>
                                                               <h2 className="text-xl font-semibold mb-3">5. 免责声明</h2>
                                                               <p className="font-medium text-destructive/80">
                                                                      本服务按“原样”和“可用”基础提供。IdeaScan 不对服务的准确性、可靠性或可用性做任何明示或暗示的保证。
                                                                      用户应自行评估分析结果的参考价值。
                                                               </p>
                                                        </section>

                                                        <section>
                                                               <h2 className="text-xl font-semibold mb-3">6. 联系我们</h2>
                                                               <p>
                                                                      如果您对本条款有任何疑问，请联系我们：support@ideascan.ai
                                                               </p>
                                                        </section>
                                                 </div>
                                          </ScrollArea>
                                   </GlassCard>
                            </div>
                     </main>
              </PageBackground>
       );
};

export default Terms;
