import { GlassCard } from "@/components/shared";
import { Star } from "lucide-react";

const testimonials = [
  {
    quote: "本来打算花3个月做一个宠物社交APP，用 IdeaScan 验证后发现市场已经极度饱和。省下了至少10万块的开发成本。",
    author: "Alex W.",
    role: "独立开发者",
    score: "42/100 → 放弃伪需求",
  },
  {
    quote: "我用它验证了3个想法，最终选了得分最高的'健身打卡陪练'方向，上线两周就有了200个种子用户。",
    author: "小鱼",
    role: "大学生创业者",
    score: "87/100 → 已上线 MVP",
  },
  {
    quote: "竞品分析那部分特别实用，直接帮我发现了竞品没做好的差评痛点，成了我产品的核心卖点。",
    author: "Chen Y.",
    role: "产品经理 @某创业公司",
    score: "73/100 → 找到差异化方向",
  },
];

export const TestimonialSection = () => {
  return (
    <section className="mb-24 section-breathe">
      <div className="text-center mb-14">
        <h2 className="text-2xl md:text-4xl font-bold text-foreground mb-4">
          他们用数据避开了弯路
        </h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          真实用户的验证故事
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {testimonials.map((t) => (
          <GlassCard key={t.author} className="flex flex-col justify-between" hover>
            <div>
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-primary text-primary" />
                ))}
              </div>
              <p className="text-foreground leading-relaxed mb-4">"{t.quote}"</p>
            </div>
            <div className="pt-4 border-t border-border/30">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm text-foreground">{t.author}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
                <div className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                  {t.score}
                </div>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </section>
  );
};
