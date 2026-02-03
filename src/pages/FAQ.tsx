import { PageBackground, Navbar, GlassCard } from "@/components/shared";
import {
       Accordion,
       AccordionContent,
       AccordionItem,
       AccordionTrigger,
} from "@/components/ui/accordion";
import { Mail } from "lucide-react";

const FAQ = () => {
       const faqs = [
              {
                     question: "IdeaScan 是如何验证我的创业点子的？",
                     answer: "IdeaScan 利用先进的大语言模型，结合实时的市场数据和小红书趋势，从市场规模、竞争格局、用户痛点、商业模式等多个维度对您的点子进行全方位扫描和分析。"
              },
              {
                     question: "免费版和专业版有什么区别？",
                     answer: "免费版每月提供 3 次基础验证机会，适合尝鲜体验。专业版提供每月 50 次验证、更深度的商业分析（如 SWOT、PEST）、竞品雷达图以及高清 PDF 报告导出功能，适合严肃的创业者。"
              },
              {
                     question: "我的创意数据安全吗？",
                     answer: "非常安全。我们严格遵守隐私政策，您的创意仅用于生成分析报告，不会被用于训练公共 AI 模型或泄露给第三方。详情请参阅我们的隐私政策。"
              },
              {
                     question: "生成的报告可以用于融资商业计划书吗？",
                     answer: "可以。我们的报告结构专业，数据详实，非常适合作为商业计划书（BP）的市场分析部分素材。专业版用户更可直接导出排版精美的 PDF。"
              },
              {
                     question: "如果我对分析结果不满意怎么办？",
                     answer: "AI 分析结果基于现有数据推演，仅供参考。如果您觉得分析有误，建议优化您的输入描述，提供更具体的上下文，通常能获得更精准的结果。您也可以通过右下角的反馈按钮联系我们。"
              }
       ];

       return (
              <PageBackground showClouds={true}>
                     <Navbar />
                     <main className="pt-32 pb-20 px-4">
                            <div className="max-w-4xl mx-auto">
                                   <div className="text-center mb-12">
                                          <h1 className="text-4xl font-bold mb-4">常见问题 (FAQ)</h1>
                                          <p className="text-muted-foreground">
                                                 解答您关于 IdeaScan 的所有疑问
                                          </p>
                                   </div>

                                   <GlassCard className="p-8 mb-12">
                                          <Accordion type="single" collapsible className="w-full">
                                                 {faqs.map((faq, index) => (
                                                        <AccordionItem key={index} value={`item-${index}`}>
                                                               <AccordionTrigger className="text-left text-lg font-medium">
                                                                      {faq.question}
                                                               </AccordionTrigger>
                                                               <AccordionContent className="text-muted-foreground leading-relaxed">
                                                                      {faq.answer}
                                                               </AccordionContent>
                                                        </AccordionItem>
                                                 ))}
                                          </Accordion>
                                   </GlassCard>

                                   <div className="text-center">
                                          <p className="text-muted-foreground mb-4">如果没有找到您需要的答案？</p>
                                          <a
                                                 href="mailto:support@ideascan.ai"
                                                 className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
                                          >
                                                 <Mail className="w-4 h-4" />
                                                 联系客服支持
                                          </a>
                                   </div>
                            </div>
                     </main>
              </PageBackground>
       );
};

export default FAQ;
