import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { PageBackground, GlassCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Mail, Lock, User, ArrowLeft, Loader2, ExternalLink } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

// Zod Schemas
const loginSchema = z.object({
  email: z.string().email({ message: "请输入有效的邮箱地址" }),
  password: z.string().min(1, { message: "请输入密码" }),
});

const signupSchema = z.object({
  name: z.string().min(2, { message: "昵称至少需要2个字符" }),
  email: z.string().email({ message: "请输入有效的邮箱地址" }),
  password: z.string().min(6, { message: "密码至少需要6位" }),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type SignupFormValues = z.infer<typeof signupSchema>;

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const searchParams = new URLSearchParams(window.location.search);
  const redirectTo = searchParams.get('redirect') || "/";

  const {
    register: registerLogin,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const {
    register: registerSignup,
    handleSubmit: handleSignupSubmit,
    formState: { errors: signupErrors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
  });

  const handleLinuxDOLogin = () => {
    const clientId = "lnCHca7XSPnBQxJMmpLoowYmqfUkCmij";
    const redirectUri = encodeURIComponent(`${window.location.origin}/auth/callback/linuxdo`);
    const state = encodeURIComponent(redirectTo);
    const authUrl = `https://connect.linux.do/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}`;

    const isEmbeddedPreview = window.self !== window.top;

    if (isEmbeddedPreview) {
      const popup = window.open(authUrl, "_blank", "noopener,noreferrer");
      if (!popup) {
        toast({
          title: "无法打开登录窗口",
          description: "请允许浏览器弹窗后重试 Linux DO 登录",
          variant: "destructive",
        });
      }
      return;
    }

    window.location.assign(authUrl);
  };

  const onLogin = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (error) throw error;
      toast({ title: "登录成功", description: "欢迎回来！" });
      navigate(redirectTo);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "登录失败";
      toast({ title: "登录失败", description: errorMessage, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const onSignup = async (data: SignupFormValues) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: { full_name: data.name },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      toast({ title: "注册成功", description: "欢迎加入！" });
      navigate(redirectTo);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "注册失败";
      toast({ title: "注册失败", description: errorMessage, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PageBackground>
      <main className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回首页
          </Link>

          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center rounded-full border border-border/50 bg-background/50 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm mb-4">
              安全登录 · 一键进入验证控制台
            </div>
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center mx-auto mb-5 shadow-xl shadow-primary/20 rotate-3 hover:rotate-0 transition-transform duration-300">
              <Sparkles className="w-10 h-10 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2 tracking-tight">需求验证器</h1>
            <p className="text-muted-foreground">
              分辨<span className="text-primary font-medium">真刚需</span>与<span className="text-destructive font-medium">伪需求</span>，少走弯路
            </p>
          </div>

          <GlassCard className="relative overflow-hidden animate-slide-up p-6 border border-border/50 bg-card/70 backdrop-blur-xl shadow-2xl shadow-primary/10">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
            {/* Linux DO OAuth */}
            <Button
              type="button"
              variant="default"
              className="group w-full h-12 rounded-xl font-semibold text-base mb-4 shadow-lg shadow-primary/25"
              disabled={isLoading}
              onClick={handleLinuxDOLogin}
            >
              <ExternalLink className="w-4 h-4 mr-2 transition-transform duration-200 group-hover:translate-x-0.5" />
              通过 Linux DO 登录
            </Button>

            <div className="flex items-center gap-3 mb-4">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">或使用邮箱</span>
              <Separator className="flex-1" />
            </div>

            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6 h-12">
                <TabsTrigger value="login" className="text-base">登录</TabsTrigger>
                <TabsTrigger value="signup" className="text-base">免费注册</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLoginSubmit(onLogin)} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-sm font-medium">邮箱地址</Label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="your@email.com"
                        className={`pl-11 h-11 rounded-xl bg-background/50 ${loginErrors.email ? "border-destructive focus-visible:ring-destructive" : "border-border/50"}`}
                        {...registerLogin("email")}
                        disabled={isLoading}
                      />
                    </div>
                    {loginErrors.email && <p className="text-xs text-destructive ml-1">{loginErrors.email.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password" className="text-sm font-medium">密码</Label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
                        className={`pl-11 h-11 rounded-xl bg-background/50 ${loginErrors.password ? "border-destructive focus-visible:ring-destructive" : "border-border/50"}`}
                        {...registerLogin("password")}
                        disabled={isLoading}
                      />
                    </div>
                    {loginErrors.password && <p className="text-xs text-destructive ml-1">{loginErrors.password.message}</p>}
                  </div>

                  <Button type="submit" className="w-full h-12 rounded-xl font-medium shadow-md hover:shadow-lg transition-all text-base" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />登录中...</> : "登录账户"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignupSubmit(onSignup)} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name" className="text-sm font-medium">昵称</Label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-name"
                        type="text"
                        placeholder="给自己取个名字"
                        className={`pl-11 h-11 rounded-xl bg-background/50 ${signupErrors.name ? "border-destructive focus-visible:ring-destructive" : "border-border/50"}`}
                        {...registerSignup("name")}
                        disabled={isLoading}
                      />
                    </div>
                    {signupErrors.name && <p className="text-xs text-destructive ml-1">{signupErrors.name.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="text-sm font-medium">邮箱地址</Label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="your@email.com"
                        className={`pl-11 h-11 rounded-xl bg-background/50 ${signupErrors.email ? "border-destructive focus-visible:ring-destructive" : "border-border/50"}`}
                        {...registerSignup("email")}
                        disabled={isLoading}
                      />
                    </div>
                    {signupErrors.email && <p className="text-xs text-destructive ml-1">{signupErrors.email.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-sm font-medium">设置密码</Label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="至少6位密码"
                        className={`pl-11 h-11 rounded-xl bg-background/50 ${signupErrors.password ? "border-destructive focus-visible:ring-destructive" : "border-border/50"}`}
                        {...registerSignup("password")}
                        disabled={isLoading}
                      />
                    </div>
                    {signupErrors.password && <p className="text-xs text-destructive ml-1">{signupErrors.password.message}</p>}
                  </div>

                  <Button type="submit" className="w-full h-12 rounded-xl font-medium shadow-md hover:shadow-lg transition-all text-base" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />注册中...</> : "开始验证需求"}
                  </Button>

                  <p className="text-xs text-center text-muted-foreground mt-4">
                    注册即表示同意我们的服务条款和隐私政策
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </GlassCard>
        </div>
      </main>
    </PageBackground>
  );
};

export default Auth;
