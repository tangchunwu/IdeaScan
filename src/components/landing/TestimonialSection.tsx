import { useTranslation } from "react-i18next";
import { GlassCard } from "@/components/shared";
import { Star } from "lucide-react";

export const TestimonialSection = () => {
  const { t } = useTranslation();

  const testimonials = [
    {
      quote: t("landing.testimonial1Quote"),
      author: t("landing.testimonial1Author"),
      role: t("landing.testimonial1Role"),
      score: t("landing.testimonial1Score"),
    },
    {
      quote: t("landing.testimonial2Quote"),
      author: t("landing.testimonial2Author"),
      role: t("landing.testimonial2Role"),
      score: t("landing.testimonial2Score"),
    },
    {
      quote: t("landing.testimonial3Quote"),
      author: t("landing.testimonial3Author"),
      role: t("landing.testimonial3Role"),
      score: t("landing.testimonial3Score"),
    },
  ];

  return (
    <section className="mb-24 section-breathe">
      <div className="text-center mb-14">
        <h2 className="text-2xl md:text-4xl font-bold text-foreground mb-4">
          {t("landing.testimonialTitle")}
        </h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          {t("landing.testimonialDesc")}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {testimonials.map((item) => (
          <GlassCard key={item.author} className="flex flex-col justify-between" hover>
            <div>
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-primary text-primary" />
                ))}
              </div>
              <p className="text-foreground leading-relaxed mb-4">"{item.quote}"</p>
            </div>
            <div className="pt-4 border-t border-border/30">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm text-foreground">{item.author}</div>
                  <div className="text-xs text-muted-foreground">{item.role}</div>
                </div>
                <div className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                  {item.score}
                </div>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </section>
  );
};
