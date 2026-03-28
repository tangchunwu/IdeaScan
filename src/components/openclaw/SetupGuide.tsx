import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Terminal, Download, Link2, Zap, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const BRIDGE_RAW_URL = "https://raw.githubusercontent.com/tangchunwu/IdeaScan/main/scripts/agent-bridge/bridge.py";

interface SetupGuideProps {
  onStartPairing: () => void;
}

export function SetupGuide({ onStartPairing }: SetupGuideProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co`;

  const oneLineCommand = `curl -fsSL ${BRIDGE_RAW_URL} -o bridge.py && pip install requests && python bridge.py pair --supabase-url ${supabaseUrl} --backend claude --work-dir .`;

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("已复制到剪贴板");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Hero section */}
      <div className="text-center space-y-2 py-2">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
          <Zap className="w-7 h-7 text-primary" />
        </div>
        <h3 className="text-base font-semibold text-foreground">3 步连接你的 AI Agent</h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          在你的电脑上运行一行命令，输入配对码，即可开始使用
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {/* Step 1 */}
        <div className="flex gap-3 items-start">
          <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">1</div>
          <div className="flex-1 space-y-1.5">
            <p className="text-sm font-medium text-foreground">打开电脑终端</p>
            <p className="text-xs text-muted-foreground">
              Mac 用户搜索「终端」或 iTerm2；Windows 用户打开 PowerShell 或 CMD
            </p>
          </div>
        </div>

        {/* Step 2 */}
        <div className="flex gap-3 items-start">
          <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">2</div>
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-foreground">复制并运行这行命令</p>
            <div className="relative">
              <pre className="text-[10px] bg-muted/40 border border-border/30 p-3 pr-10 rounded-xl font-mono whitespace-pre-wrap break-all text-muted-foreground leading-relaxed select-all">
                {oneLineCommand}
              </pre>
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-1.5 right-1.5 h-7 w-7 p-0"
                onClick={() => copyToClipboard(oneLineCommand, "one-line")}
              >
                {copiedId === "one-line" ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              💡 需要已安装 <Badge variant="outline" className="text-[9px] px-1 py-0">Python 3</Badge> 和 <Badge variant="outline" className="text-[9px] px-1 py-0">curl</Badge>
            </p>
          </div>
        </div>

        {/* Step 3 */}
        <div className="flex gap-3 items-start">
          <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">3</div>
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-foreground">输入终端显示的 6 位配对码</p>
            <p className="text-xs text-muted-foreground">
              脚本运行后会显示类似 <code className="bg-muted/40 px-1.5 py-0.5 rounded text-primary font-mono font-bold">A3F7K2</code> 的配对码
            </p>
            <Button onClick={onStartPairing} className="w-full rounded-xl gap-2">
              <Link2 className="w-4 h-4" />
              输入配对码
            </Button>
          </div>
        </div>
      </div>

      {/* Prerequisites expandable */}
      <div className="border border-border/30 rounded-xl overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted/20 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5" />
            前置要求 & 常见问题
          </span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {expanded && (
          <div className="px-3 pb-3 space-y-3 text-xs text-muted-foreground border-t border-border/20">
            <div className="pt-2 space-y-2">
              <div>
                <p className="font-medium text-foreground mb-0.5">需要什么？</p>
                <ul className="space-y-0.5 list-disc list-inside">
                  <li>Python 3.7+（<code className="bg-muted/40 px-1 rounded">python3 --version</code> 检查）</li>
                  <li>已安装 Claude Code 或 Codex CLI</li>
                  <li>稳定的网络连接</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground mb-0.5">Claude Code 怎么安装？</p>
                <code className="block bg-muted/40 px-2 py-1 rounded text-[10px] font-mono">npm install -g @anthropic-ai/claude-code</code>
              </div>
              <div>
                <p className="font-medium text-foreground mb-0.5">Codex 怎么安装？</p>
                <code className="block bg-muted/40 px-2 py-1 rounded text-[10px] font-mono">npm install -g @openai/codex</code>
              </div>
              <div>
                <p className="font-medium text-foreground mb-0.5">配对码过期了？</p>
                <p>配对码 5 分钟内有效。过期后重新运行命令即可获取新码。</p>
              </div>
              <div>
                <p className="font-medium text-foreground mb-0.5">已经配对过，想再连一台？</p>
                <p>每次运行 <code className="bg-muted/40 px-1 rounded">pair</code> 命令都会创建新的连接，可以同时连接多台设备。</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
