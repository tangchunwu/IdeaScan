import { OpenClawChannel, OpenClawSettings } from "@/components/openclaw";
import { PageBackground } from "@/components/shared/PageBackground";
import { Navbar } from "@/components/shared/Navbar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Settings } from "lucide-react";

export default function OpenClawPage() {
  return (
    <div className="min-h-screen bg-background">
      <PageBackground />
      <Navbar />
      <div className="container max-w-4xl mx-auto pt-20 pb-8 px-4">
        <Tabs defaultValue="chat" className="w-full">
          <TabsList className="grid w-full max-w-xs grid-cols-2 mx-auto mb-4">
            <TabsTrigger value="chat" className="gap-1.5 text-sm">
              <Bot className="w-4 h-4" /> 对话
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5 text-sm">
              <Settings className="w-4 h-4" /> 设置
            </TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="mt-0">
            <div className="rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm overflow-hidden" style={{ height: "calc(100vh - 180px)" }}>
              <OpenClawChannel />
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
