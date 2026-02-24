import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BrandLoader } from "@/components/shared";
import { useToast } from "@/hooks/use-toast";

const AuthCallback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const redirectTo = params.get("state") || "/";

      if (!code) {
        setError("未收到授权码");
        return;
      }

      try {
        const redirectUri = `${window.location.origin}/auth/callback/linuxdo`;

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/linuxdo-auth`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ code, redirect_uri: redirectUri }),
          }
        );

        const data = await res.json();

        if (!res.ok || !data.session) {
          throw new Error(data.error || "登录失败");
        }

        // Set the session in Supabase client
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        toast({
          title: data.is_new ? "注册成功" : "登录成功",
          description: data.is_new
            ? "欢迎加入 IdeaScan！"
            : "欢迎回来！",
        });

        navigate(redirectTo, { replace: true });
      } catch (err) {
        console.error("Linux DO auth callback error:", err);
        setError(err instanceof Error ? err.message : "登录失败");
      }
    };

    handleCallback();
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-destructive text-lg font-medium">登录失败</p>
          <p className="text-muted-foreground">{error}</p>
          <button
            onClick={() => navigate("/auth")}
            className="text-primary underline"
          >
            返回登录页
          </button>
        </div>
      </div>
    );
  }

  return <BrandLoader fullScreen text="正在通过 Linux DO 登录..." />;
};

export default AuthCallback;
