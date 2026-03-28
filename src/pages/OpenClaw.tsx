import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { OpenClawChannel, OpenClawSettings } from "@/components/openclaw";
import { OpenClawHistory } from "@/components/openclaw/OpenClawHistory";
import { Navbar } from "@/components/shared/Navbar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Settings, History, PanelLeftClose, PanelLeft, PenTool, Cog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLoader } from "@/components/shared";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

import { ContentStudioInline } from "./ContentStudio";

export default function OpenClawPage() {
  useDocumentTitle("OpenClaw AI 助手");
  const [searchParams] = useSearchParams();
  const [initialMessage, setInitialMessage] = useState<string | undefined>();
  const [validationId, setValidationId] = useState<string | undefined>();
  const [sessionId, setSessionId] = useState(() => `session-${Date.now()}`);
  const [showHistory, setShowHistory] = useState(true);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("chat");
  const isMobile = useIsMobile();

  // Swipe gesture for opening history on mobile
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    // Only track swipes starting from left edge (within 30px)
    if (touch.clientX < 30) {
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = Math.abs(touch.clientY - touchStartRef.current.y);
    touchStartRef.current = null;
    // Swipe right at least 60px, mostly horizontal
    if (dx > 60 && dy < dx * 0.6) {
      setMobileHistoryOpen(true);
    }
  }, []);

  useEffect(() => {
    const fromValidation = searchParams.get("from_validation");
    if (fromValidation) {
      // Store validation ID for skill context injection (unless it's 'content_studio')
      if (fromValidation !== "content_studio") {
        setValidationId(fromValidation);
      }
      const stored = sessionStorage.getItem("openclaw_initial_message");
      if (stored) {
        setInitialMessage(stored);
        sessionStorage.removeItem("openclaw_initial_message");
        sessionStorage.removeItem("openclaw_from_validation");
      }
      if (fromValidation === "content_studio") {
        setActiveTab("chat");
      }
    }
  }, [searchParams]);

  const handleSelectSession = (sid: string) => {
    setSessionId(sid);
    setInitialMessage(undefined);
    if (isMobile) setMobileHistoryOpen(false);
  };

  const handleNewSession = () => {
    setSessionId(`session-${Date.now()}`);
    setInitialMessage(undefined);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className={`container max-w-6xl mx-auto pb-4 px-2 sm:px-4 ${isMobile ? 'pt-20' : 'pt-28 pb-8'}`}>
        {/* Header — compact on mobile */}
        <div className={`flex items-center justify-between ${isMobile ? 'mb-2' : 'mb-4'}`}>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className={`${isMobile ? 'w-8 h-8' : 'w-10 h-10'} rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center shadow-sm`}>
              <Cog className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-primary`} />
            </div>
            <div>
              <h1 className={`${isMobile ? 'text-lg' : 'text-2xl'} font-bold tracking-tight`}>OpenClaw</h1>
              {!isMobile && (
                <p className="text-sm text-muted-foreground mt-0.5">AI Agent · 对话 · 内容创作 · 自动化</p>
              )}
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={`w-full max-w-md mb-2 sm:mb-4 ${isMobile ? 'h-9' : 'h-11'} rounded-xl bg-muted/50 p-1`}>
            <TabsTrigger value="chat" className={`gap-1 ${isMobile ? 'text-xs' : 'text-sm'} flex-1 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm`}>
              <Bot className={`${isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} /> 对话
            </TabsTrigger>
            <TabsTrigger value="content" className={`gap-1 ${isMobile ? 'text-xs' : 'text-sm'} flex-1 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm`}>
              <PenTool className={`${isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} /> {isMobile ? '创作' : '内容工作室'}
            </TabsTrigger>
            <TabsTrigger value="settings" className={`gap-1 ${isMobile ? 'text-xs' : 'text-sm'} flex-1 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm`}>
              <Settings className={`${isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} /> 设置
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="mt-0">
            {isMobile ? (
              /* ─── Mobile: full-screen chat, Sheet for history ─── */
              <div
                ref={chatAreaRef}
                className="relative"
                style={{ height: "calc(100vh - 170px)" }}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                <div className="h-full rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm overflow-hidden">
                  <OpenClawChannel
                    initialMessage={initialMessage}
                    sessionId={sessionId}
                    validationId={validationId}
                    onNewSession={handleNewSession}
                    historyToggle={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setMobileHistoryOpen(true)}
                      >
                        <History className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    }
                  />
                </div>

                {/* Mobile history drawer */}
                <Sheet open={mobileHistoryOpen} onOpenChange={setMobileHistoryOpen}>
                  <SheetContent side="left" className="w-[280px] p-0 pt-2">
                    <SheetHeader className="px-4 py-2 border-b border-border/30">
                      <SheetTitle className="text-sm font-medium flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-muted-foreground" />
                        历史记录
                      </SheetTitle>
                    </SheetHeader>
                    <div className="flex-1 overflow-y-auto" style={{ height: "calc(100vh - 80px)" }}>
                      <OpenClawHistory
                        currentSessionId={sessionId}
                        onSelectSession={handleSelectSession}
                        onSessionDeleted={handleNewSession}
                      />
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            ) : (
              /* ─── Desktop: side-by-side layout ─── */
              <div className="flex gap-3" style={{ height: "calc(100vh - 200px)" }}>
                {showHistory && (
                  <div className="w-56 shrink-0 rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/30">
                      <div className="flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">历史记录</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowHistory(false)}>
                        <PanelLeftClose className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto">
                      <OpenClawHistory currentSessionId={sessionId} onSelectSession={handleSelectSession} onSessionDeleted={handleNewSession} />
                    </div>
                  </div>
                )}

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
            )}
          </TabsContent>

          <TabsContent value="content" className="mt-0">
            <Suspense fallback={<BrandLoader text="加载内容工作室..." />}>
              <ContentStudioInline />
            </Suspense>
          </TabsContent>

          <TabsContent value="settings" className="mt-0">
            <OpenClawSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
