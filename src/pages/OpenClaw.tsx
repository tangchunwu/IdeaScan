import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { OpenClawChannel, OpenClawSettings } from "@/components/openclaw";
import { Navbar } from "@/components/shared/Navbar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Settings } from "lucide-react";

export default function OpenClawPage() {
  const [searchParams] = useSearchParams();
  const [initialMessage, setInitialMessage] = useState<string | undefined>();

  useEffect(() => {
    const fromValidation = searchParams.get("from_validation");
    if (fromValidation) {
      const stored = sessionStorage.getItem("openclaw_initial_message");
      if (stored) {
        setInitialMessage(stored);
        sessionStorage.removeItem("openclaw_initial_message");
        sessionStorage.removeItem("openclaw_from_validation");
      }
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container max-w-4xl mx-auto pt-20 pb-8 px-4">
        {/* Page header */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight">AI Agent</h1>
          <p className="text-sm text-muted-foreground mt-1">连接你的 OpenClaw 服务器，与 AI Agent 实时对话</p>
        </div>

        <Tabs defaultValue="chat" className="w-full">
          <TabsList className="w-full max-w-xs mb-4">
            <TabsTrigger value="chat" className="gap-1.5 text-sm flex-1">
              <Bot className="w-4 h-4" /> 对话
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5 text-sm flex-1">
              <Settings className="w-4 h-4" /> 设置
            </TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="mt-0">
            <div className="rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm overflow-hidden" style={{ height: "calc(100vh - 260px)" }}>
              <OpenClawChannel initialMessage={initialMessage} />
            </div>
          </TabsContent>
          <TabsContent value="settings" className="mt-0">
            <OpenClawSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
