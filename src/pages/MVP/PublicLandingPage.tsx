import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getMVPBySlug, collectLead, trackExperimentEvent } from "@/services/mvpService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from "@/components/shared";
import { Check, ArrowRight, Zap, Shield, BarChart } from "lucide-react";

const ICON_MAP: any = {
        Zap,
        Shield,
        BarChart
};

export default function PublicLandingPage() {
        const { slug } = useParams();
        const { toast } = useToast();
        const [email, setEmail] = useState("");
        const [isSubmitted, setIsSubmitted] = useState(false);

        const { data: page, isLoading, error } = useQuery({
                queryKey: ['public-mvp', slug],
                queryFn: () => getMVPBySlug(slug!),
                enabled: !!slug,
                retry: false
        });

	const submitMutation = useMutation({
		mutationFn: () => collectLead(page!.id, email),
		onSuccess: () => {
			setIsSubmitted(true);
			toast({ title: "已加入等待名单！🚀" });
		},
		onError: (error: Error) => {
			const message = error.message?.includes('Too many') 
				? "提交过于频繁，请稍后再试" 
				: error.message?.includes('Invalid email')
				? "请输入有效的邮箱地址"
				: "提交失败，请重试";
			toast({ title: message, variant: "destructive" });
		}
	});

	useEffect(() => {
		if (!page?.id) return;
		void trackExperimentEvent(page.id, "view", { slug });
	}, [page?.id, slug]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (page?.id) {
			void trackExperimentEvent(page.id, "cta_click", { source: "hero_form" });
		}
		if (!email || !email.includes('@')) {
			toast({ title: "请输入有效的邮箱地址", variant: "destructive" });
			return;
		}
		if (page?.id) {
			void trackExperimentEvent(page.id, "checkout_start", { source: "hero_form" });
		}
		submitMutation.mutate();
	};

        if (isLoading) return (
                <div className="min-h-screen flex items-center justify-center bg-white">
                        <LoadingSpinner size="lg" />
                </div>
        );

        if (error || !page) return (
                <div className="min-h-screen flex items-center justify-center bg-zinc-50 flex-col">
                        <h1 className="text-4xl font-bold mb-4 text-zinc-300">404</h1>
                        <p className="text-zinc-500">Page not found</p>
                </div>
        );

        const { content } = page;

        // Dynamic Theme (Simplified)
        const isDark = page.theme === 'dark';
        const bgClass = isDark ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-900';

        return (
                <div className={`min-h-screen font-sans ${bgClass}`}>

                        {/* Hero Section */}
                        <section className="pt-32 pb-20 px-6 text-center max-w-5xl mx-auto">
                                <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent pb-4">
                                        {content.hero.title}
                                </h1>
                                <p className={`text-xl md:text-2xl mb-12 max-w-3xl mx-auto ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                        {content.hero.subtitle}
                                </p>

                                <div className="max-w-md mx-auto">
                                        {!isSubmitted ? (
                                                <form onSubmit={handleSubmit} className="flex gap-2">
                                                        <Input
                                                                type="email"
                                                                placeholder="Enter your email"
                                                                className="h-12 text-lg"
                                                                value={email}
                                                                onChange={e => setEmail(e.target.value)}
                                                                required
                                                        />
                                                        <Button type="submit" size="lg" className="h-12 px-8 font-bold" disabled={submitMutation.isPending}>
                                                                {content.hero.cta}
                                                                <ArrowRight className="ml-2 w-4 h-4" />
                                                        </Button>
                                                </form>
                                        ) : (
                                                <div className="p-4 bg-green-500/10 text-green-600 rounded-lg flex items-center justify-center gap-2 text-lg font-medium animate-in fade-in zoom-in">
                                                        <Check className="w-5 h-5" />
                                                        You are on the list! We'll be in touch.
                                                </div>
                                        )}
                                        <p className="text-xs text-zinc-400 mt-4">
                                                Join {Math.floor(Math.random() * 500) + 100} others in the waitlist.
                                        </p>
                                </div>
                        </section>

                        {/* Features */}
                        <section className={`py-24 ${isDark ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
                                <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-3 gap-12">
                                        {content.features.map((f: any, i: number) => {
                                                const Icon = ICON_MAP[f.icon] || Zap;
                                                return (
                                                        <div key={i} className="space-y-4">
                                                                <div className="w-12 h-12 rounded-2xl bg-blue-600/10 flex items-center justify-center text-blue-600">
                                                                        <Icon className="w-6 h-6" />
                                                                </div>
                                                                <h3 className="text-xl font-bold">{f.title}</h3>
                                                                <p className={`${isDark ? 'text-zinc-400' : 'text-zinc-600'} leading-relaxed`}>
                                                                        {f.description}
                                                                </p>
                                                        </div>
                                                );
                                        })}
                                </div>
                        </section>

                        {/* Pain Points Comparison */}
                        <section className="py-24 px-6 max-w-4xl mx-auto">
                                <div className="text-center mb-16">
                                        <h2 className="text-3xl font-bold mb-4">Why traditional ways fail</h2>
                                </div>
                                <div className="space-y-4">
                                        {content.painPoints.map((p: any, i: number) => (
                                                <div key={i} className={`p-6 rounded-2xl border ${isDark ? 'border-zinc-800 hover:bg-zinc-800' : 'border-zinc-100 hover:bg-zinc-50'} transition-colors flex gap-6 items-start group`}>
                                                        <div className="flex-1">
                                                                <div className="flex items-center gap-2 text-red-500 font-medium mb-1">
                                                                        <span className="text-lg">✕</span> Problem
                                                                </div>
                                                                <p className={`${isDark ? 'text-zinc-300' : 'text-zinc-800'} text-lg`}>{p.problem}</p>
                                                        </div>
                                                        <div className="w-px bg-border h-full self-stretch opacity-20 hidden md:block" />
                                                        <div className="flex-1">
                                                                <div className="flex items-center gap-2 text-green-500 font-medium mb-1">
                                                                        <span className="text-lg">✓</span> Our Solution
                                                                </div>
                                                                <p className={`${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>{p.solution}</p>
                                                        </div>
                                                </div>
                                        ))}
                                </div>
                        </section>

                        {/* Footer */}
                        <footer className="py-12 text-center text-sm text-zinc-500">
                                <p>© 2024 {content.hero.title}. All rights reserved.</p>
                                <p className="mt-2 text-xs opacity-50">Powered by Frontend Creator MVP Engine</p>
                        </footer>
                </div>
        );
}
