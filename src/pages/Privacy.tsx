import { PageBackground, Navbar, GlassCard } from "@/components/shared";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const Privacy = () => {
       return (
              <PageBackground showClouds={false}>
                     <Navbar />
                     <main className="pt-28 pb-16 px-4">
                            <div className="max-w-4xl mx-auto">
                                   <GlassCard className="p-8 md:p-12">
                                          <h1 className="text-3xl font-bold mb-2 text-foreground">隐私政策 (Privacy Policy)</h1>
                                          <p className="text-muted-foreground mb-8">生效日期：2024年2月3日</p>

                                          <ScrollArea className="h-[60vh] pr-4">
                                                 <div className="space-y-8 text-foreground/90 leading-relaxed">
                                                        <section>
                                                               <h2 className="text-xl font-semibold mb-3">1. 引言</h2>
                                                               <p>
                                                                      IdeaScan（“我们”）非常重视您的隐私。本隐私政策说明了当您使用我们的服务时，
                                                                      我们如何收集、使用、披露和保护您的信息。
                                                               </p>
                                                        </section>

                                                        <Separator />

                                                        <section>
                                                               <h2 className="text-xl font-semibold mb-3">2. 我们收集的信息</h2>
                                                               <div className="space-y-3">
                                                                      <h3 className="font-medium">2.1 个人身份信息</h3>
                                                                      <p>当您注册账户时，我们可能会收集您的相关信息，包括但不限于：电子邮件地址、用户名。</p>

                                                                      <h3 className="font-medium">2.2 输入数据</h3>
                                                                      <p>您提交用于分析的商业创意、想法文本会被传输给 AI 模型处理，但我们不会将其用于训练公共模型。</p>

                                                                      <h3 className="font-medium">2.3 使用数据</h3>
                                                                      <p>我们可能会收集有关如何访问和使用服务的信息（如访问时间、页面浏览、设备信息），以优化产品体验。</p>
                                                               </div>
                                                        </section>

                                                        <Separator />

                                                        <section>
                                                               <h2 className="text-xl font-semibold mb-3">3. 信息使用</h2>
                                                               <ul className="list-disc pl-5 space-y-2">
                                                                      <li>提供和维护我们的服务。</li>
                                                                      <li>通知您有关服务的更改。</li>
                                                                      <li>提供客户支持。</li>
                                                                      <li>监控服务的使用情况以检测技术问题。</li>
                                                               </ul>
                                                        </section>

                                                        <Separator />

                                                        <section>
                                                               <h2 className="text-xl font-semibold mb-3">4. 数据安全</h2>
                                                               <p>
                                                                      数据的安全性对我们很重要，可以说没有任何通过互联网传输的方法或电子存储方法是 100% 安全的。
                                                                      虽然我们努力使用商业上可接受的方式来保护您的个人数据，但我们不能保证其绝对安全。
                                                               </p>
                                                        </section>

                                                        <section>
                                                               <h2 className="text-xl font-semibold mb-3">5. Cookie 技术</h2>
                                                               <p>
                                                                      我们使用 Cookie 和类似的跟踪技术来跟踪我们服务上的活动并保存某些信息。
                                                                      您可以指示您的浏览器拒绝所有 Cookie 或指示何时发送 Cookie。
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

export default Privacy;
