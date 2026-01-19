import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { PageBackground, GlassCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Mail, Lock, User, ArrowLeft, Loader2 } from "lucide-react";
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

  // Login Form Hook
  const {
    register: registerLogin,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  // Signup Form Hook
  const {
    register: registerSignup,
    handleSubmit: handleSignupSubmit,
    formState: { errors: signupErrors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
  });

  const onLogin = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) throw error;

      toast({
        title: "登录成功",
        description: "欢迎回来！",
      });
      navigate("/");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "登录失败";
      toast({
        title: "登录失败",
        description: errorMessage,
        variant: "destructive",
      });
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
          data: {
            full_name: data.name,
          },
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) throw error;

      toast({
        title: "注册成功",
        description: "欢迎加入！",
      });
      navigate("/");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "注册失败";
      toast({
        title: "注册失败",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PageBackground>
      <main className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Back Link */}
          <Link
            to="/"
            className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回首页
          </Link>

          {/* Logo */}
          <div className="text-center mb-8 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20">
              <Sparkles className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">创意验证器</h1>
            <p className="text-muted-foreground mt-1">登录开始验证你的商业创意</p>
          </div>

          {/* Auth Card */}
          <GlassCard className="animate-slide-up">
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">登录</TabsTrigger>
                <TabsTrigger value="signup">注册</TabsTrigger>
              </TabsList>

              {/* Login Tab */}
              <TabsContent value="login">
                <form onSubmit={handleLoginSubmit(onLogin)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">邮箱</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="your@email.com"
                        className={`pl-10 rounded-xl ${loginErrors.email ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        {...registerLogin("email")}
                        disabled={isLoading}
                      />
                    </div>
                    {loginErrors.email && (
                      <p className="text-xs text-destructive ml-1">{loginErrors.email.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">密码</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
                        className={`pl-10 rounded-xl ${loginErrors.password ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        {...registerLogin("password")}
                        disabled={isLoading}
                      />
                    </div>
                    {loginErrors.password && (
                      <p className="text-xs text-destructive ml-1">{loginErrors.password.message}</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full rounded-xl py-5 font-medium shadow-md hover:shadow-lg transition-all"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        登录中...
                      </>
                    ) : (
                      "登录"
                    )}
                  </Button>
                </form>
              </TabsContent>

              {/* Signup Tab */}
              <TabsContent value="signup">
                <form onSubmit={handleSignupSubmit(onSignup)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">昵称</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-name"
                        type="text"
                        placeholder="你的昵称"
                        className={`pl-10 rounded-xl ${signupErrors.name ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        {...registerSignup("name")}
                        disabled={isLoading}
                      />
                    </div>
                    {signupErrors.name && (
                      <p className="text-xs text-destructive ml-1">{signupErrors.name.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email">邮箱</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="your@email.com"
                        className={`pl-10 rounded-xl ${signupErrors.email ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        {...registerSignup("email")}
                        disabled={isLoading}
                      />
                    </div>
                    {signupErrors.email && (
                      <p className="text-xs text-destructive ml-1">{signupErrors.email.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password">密码</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="至少6位密码"
                        className={`pl-10 rounded-xl ${signupErrors.password ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        {...registerSignup("password")}
                        disabled={isLoading}
                      />
                    </div>
                    {signupErrors.password && (
                      <p className="text-xs text-destructive ml-1">{signupErrors.password.message}</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full rounded-xl py-5 font-medium shadow-md hover:shadow-lg transition-all"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        注册中...
                      </>
                    ) : (
                      "注册"
                    )}
                  </Button>
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
