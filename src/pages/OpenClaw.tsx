import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { OpenClawChannel, OpenClawSettings } from "@/components/openclaw";
import { OpenClawHistory } from "@/components/openclaw/OpenClawHistory";
import { Navbar } from "@/components/shared/Navbar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Settings, History, PanelLeftClose, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OpenClawPage() {
  const [searchParams] = useSearchParams();
  const [initialMessage, setInitialMessage] = useState<string | undefined>();
  const [sessionId, setSessionId] = useState(() => `session-${Date.now()}`);
  const [showHistory, setShowHistory] = useState(true);

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

  const handleSelectSession = (sid: string) => {
    setSessionId(sid);
    setInitialMessage(undefined);
  };

  const handleNewSession = () => {
    setSessionId(`session-${Date.now()}`);
    setInitialMessage(undefined);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container max-w-6xl mx-auto pt-28 pb-8 px-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AI Agent</h1>
            <p className="text-sm text-muted-foreground mt-1">连接你的 OpenClaw 服务器，与 AI Agent 实时对话</p>
          </div>
        </div>

        <Tabs defaultValue="chat" className="w-full">
          <TabsList className="w-full max-w-sm mb-4">
            <TabsTrigger value="chat" className="gap-1.5 text-sm flex-1">
              <Bot className="w-4 h-4" /> 对话
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5 text-sm flex-1">
              <Settings className="w-4 h-4" /> 设置
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="mt-0">
            <div className="flex gap-3" style={{ height: "calc(100vh - 260px)" }}>
              {/* History sidebar */}
              {showHistory && (
                <div className="w-64 shrink-0 rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/30">
                    <div className="flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">历史记录</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowHistory(false)}>
                      <PanelLeftClose className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <OpenClawHistory currentSessionId={sessionId} onSelectSession={handleSelectSession} onSessionDeleted={handleNewSession} />
                  </div>
                </div>
              )}

              {/* Chat area */}
              <div className="flex-1 rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm overflow-hidden">
                <OpenClawChannel
                  initialMessage={initialMessage}
                  sessionId={sessionId}
                  onNewSession={handleNewSession}
                  historyToggle={!showHistory ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setShowHistory(true)}
                    >
                      <PanelLeft className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  ) : undefined}
                />
              </div>
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
