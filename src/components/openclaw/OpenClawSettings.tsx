import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useOpenClawConnections, type OpenClawConnection } from "@/hooks/useOpenClawConnections";
import { GlassCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, Star, RefreshCw, Copy, Check, Circle, Download, Link2 } from "lucide-react";
import { toast } from "sonner";
import { PairingDialog } from "./PairingDialog";
import { SetupGuide } from "./SetupGuide";

const ONLINE_THRESHOLD_MS = 15_000; // 15 seconds — bridge polls every 2s

function useRelayOnlineStatus(connections: OpenClawConnection[]) {
  const [now, setNow] = useState(Date.now());
  const hasRelay = connections.some(c => c.mode === 'relay');

  useEffect(() => {
    if (!hasRelay) return;
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, [hasRelay]);

  return useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const c of connections) {
      if (c.mode === 'relay' && c.last_synced_at) {
        map[c.id] = now - new Date(c.last_synced_at).getTime() < ONLINE_THRESHOLD_MS;
      }
    }
    return map;
  }, [connections, now]);
}

export function OpenClawSettings() {
  const { user } = useAuth();
  const { connections, loading, addConnection, deleteConnection, setDefault, syncToOpenClaw, reload } = useOpenClawConnections(user?.id);
  const onlineStatus = useRelayOnlineStatus(connections);

  // Auto-reload connections every 10s to refresh last_synced_at for relay connections
  const hasRelay = connections.some(c => c.mode === 'relay');
  useEffect(() => {
    if (!hasRelay) return;
    const timer = setInterval(() => reload(true), 10_000);
    return () => clearInterval(timer);
  }, [hasRelay, reload]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("default");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [mode, setMode] = useState<'direct' | 'relay'>('direct');
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showPairing, setShowPairing] = useState(false);

  const handleAdd = async () => {
    if (mode === 'direct' && !url.trim()) return;
    setAdding(true);
    try {
      const result = await addConnection(name.trim() || "default", url.trim(), token.trim(), mode);
      if (mode === 'relay' && result) {
        // Show the connection info for bridge script
        const connId = result.id;
        const connToken = result.token;
        toast.success(
          `中继连接已创建！请使用 bridge 脚本启动本地桥接。`,
          { duration: 6000 }
        );
      }
      setShowForm(false);
      setName("default");
      setUrl("");
      setToken("");
      setMode('direct');
    } catch {}
    finally { setAdding(false); }
  };

  const handleSync = async (id?: string) => {
    setSyncing(true);
    try { await syncToOpenClaw(id); } finally { setSyncing(false); }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('已复制');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const [bridgeBackend, setBridgeBackend] = useState<'claude' | 'codex' | 'openai'>('claude');

  const BRIDGE_RAW_URL = "https://raw.githubusercontent.com/tangchunwu/IdeaScan/main/scripts/agent-bridge/bridge.py";

  const getSetupCommands = () => {
    return `# 1. 下载 bridge 脚本\ncurl -fsSL ${BRIDGE_RAW_URL} -o bridge.py\n\n# 2. 安装依赖\npip install requests\n\n# 3. 一键配对（推荐）\npython bridge.py pair --supabase-url ${import.meta.env.VITE_SUPABASE_URL || `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co`} --backend claude --work-dir ~/my-project`;
  };

  const getBridgeCommand = (conn: OpenClawConnection) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co`;
    const base = `python bridge.py run \\\n  --supabase-url ${supabaseUrl} \\\n  --connection-id ${conn.id} \\\n  --token ${conn.token || '<token>'}`;
    if (bridgeBackend === 'claude') {
      return `${base} \\\n  --backends claude,codex \\\n  --backend claude \\\n  --work-dir ~/my-project \\\n  --dangerously-skip-permissions`;
    }
    if (bridgeBackend === 'codex') {
      return `${base} \\\n  --backends claude,codex \\\n  --backend codex \\\n  --work-dir ~/my-project`;
    }
    return `${base} \\\n  --backend openai \\\n  --agent-url http://localhost:11434`;
  };

  if (!user) return null;

  return (
    <GlassCard className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm text-foreground">OpenClaw 连接</h3>
          <p className="text-xs text-muted-foreground mt-0.5">连接你的 AI Agent 服务器</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="default" className="rounded-xl gap-1" onClick={() => setShowPairing(true)}>
            <Link2 className="w-3 h-3" /> 配对
          </Button>
          <Button size="sm" variant="outline" className="rounded-xl gap-1" onClick={() => setShowForm(!showForm)}>
            <Plus className="w-3 h-3" /> 手动添加
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="space-y-3 p-3 rounded-xl bg-muted/20 border border-border/30">
          <Input placeholder="连接名称" value={name} onChange={e => setName(e.target.value)} className="text-sm rounded-lg" />
          
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">连接模式</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as 'direct' | 'relay')} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="direct" id="mode-direct" />
                <Label htmlFor="mode-direct" className="text-sm cursor-pointer">直连模式</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="relay" id="mode-relay" />
                <Label htmlFor="mode-relay" className="text-sm cursor-pointer">中继模式</Label>
              </div>
            </RadioGroup>
            <p className="text-[10px] text-muted-foreground">
              {mode === 'direct' 
                ? '需要 Agent 有公网可访问的 URL' 
                : '无需公网 IP，通过本地脚本轮询消息'}
            </p>
          </div>

          {mode === 'direct' && (
            <>
              <Input placeholder="服务器 URL (如 http://localhost:3000)" value={url} onChange={e => setUrl(e.target.value)} className="text-sm rounded-lg" />
              <Input placeholder="Token (可选)" value={token} onChange={e => setToken(e.target.value)} type="password" className="text-sm rounded-lg" />
            </>
          )}

          {mode === 'relay' && (
            <div className="p-2 rounded-lg bg-primary/5 border border-primary/10 text-xs text-muted-foreground space-y-1">
              <p>🔗 中继模式会自动生成 Token。</p>
              <p>创建后，在本地运行 bridge 脚本即可连接。</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={(mode === 'direct' && !url.trim()) || adding} className="rounded-lg">
              {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : "保存"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setMode('direct'); }} className="rounded-lg">取消</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : connections.length === 0 ? (
        <SetupGuide onStartPairing={() => setShowPairing(true)} />
      ) : (
        <div className="space-y-2">
          {connections.map(conn => (
            <div key={conn.id} className="p-3 rounded-xl bg-muted/10 border border-border/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {conn.mode === 'relay' && (
                      <span className="relative flex h-2.5 w-2.5 shrink-0" title={onlineStatus[conn.id] ? 'Bridge 在线' : 'Bridge 离线'}>
                        {onlineStatus[conn.id] && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        )}
                        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${onlineStatus[conn.id] ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                      </span>
                    )}
                    <span className="text-sm font-medium truncate">{conn.name}</span>
                    {conn.is_default && <Badge variant="secondary" className="text-[9px]">默认</Badge>}
                    <Badge variant={conn.mode === 'relay' ? 'default' : 'outline'} className="text-[9px]">
                      {conn.mode === 'relay' ? '中继' : '直连'}
                    </Badge>
                    {conn.mode === 'relay' && (
                      <span className={`text-[9px] ${onlineStatus[conn.id] ? 'text-green-600' : 'text-muted-foreground/50'}`}>
                        {onlineStatus[conn.id] ? '在线' : '离线'}
                      </span>
                    )}
                  </div>
                  {conn.mode === 'direct' && (
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{conn.url}</p>
                  )}
                  {conn.last_synced_at && (
                    <p className="text-[9px] text-muted-foreground/60 mt-0.5">
                      最后同步: {new Date(conn.last_synced_at).toLocaleString('zh-CN')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {!conn.is_default && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDefault(conn.id)} title="设为默认">
                      <Star className="w-3 h-3" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleSync(conn.id)} disabled={syncing} title="同步画像">
                    <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteConnection(conn.id)} title="删除">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {/* Relay mode: show bridge command */}
              {conn.mode === 'relay' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <code className="text-[9px] bg-muted/30 px-1.5 py-0.5 rounded flex-1 truncate font-mono">
                      ID: {conn.id}
                    </code>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => copyToClipboard(conn.id, `id-${conn.id}`)}>
                      {copiedId === `id-${conn.id}` ? <Check className="w-2.5 h-2.5 text-primary" /> : <Copy className="w-2.5 h-2.5" />}
                    </Button>
                  </div>
                  {conn.token && (
                    <div className="flex items-center gap-1">
                      <code className="text-[9px] bg-muted/30 px-1.5 py-0.5 rounded flex-1 truncate font-mono">
                        Token: {conn.token.slice(0, 8)}...{conn.token.slice(-4)}
                      </code>
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => copyToClipboard(conn.token!, `tok-${conn.id}`)}>
                        {copiedId === `tok-${conn.id}` ? <Check className="w-2.5 h-2.5 text-primary" /> : <Copy className="w-2.5 h-2.5" />}
                      </Button>
                    </div>
                  )}

                  {/* Step 1: Setup — download bridge */}
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Download className="w-3 h-3" /> 第一步：下载脚本
                    </Label>
                    <pre className="text-[9px] bg-muted/30 p-2 rounded-lg overflow-x-auto font-mono whitespace-pre-wrap break-all text-muted-foreground leading-relaxed">
                      {getSetupCommands()}
                    </pre>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-[10px] h-7 rounded-lg gap-1"
                      onClick={() => copyToClipboard(getSetupCommands(), `setup-${conn.id}`)}
                    >
                      {copiedId === `setup-${conn.id}` ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                      复制安装命令
                    </Button>
                  </div>

                  {/* Step 2: Choose backend & run */}
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">第二步：选择 Agent 后端并启动</Label>
                    <div className="flex gap-1">
                      {(['claude', 'codex', 'openai'] as const).map(b => (
                        <Button
                          key={b}
                          variant={bridgeBackend === b ? 'default' : 'outline'}
                          size="sm"
                          className="h-6 text-[10px] px-2 rounded-md"
                          onClick={() => setBridgeBackend(b)}
                        >
                          {b === 'claude' ? 'Claude Code' : b === 'codex' ? 'Codex' : 'OpenAI API'}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <pre className="text-[9px] bg-muted/30 p-2 rounded-lg overflow-x-auto font-mono whitespace-pre-wrap break-all text-muted-foreground leading-relaxed">
                    {getBridgeCommand(conn)}
                  </pre>

                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full text-[10px] h-7 rounded-lg gap-1"
                    onClick={() => copyToClipboard(getBridgeCommand(conn), `cmd-${conn.id}`)}
                  >
                    {copiedId === `cmd-${conn.id}` ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                    复制启动命令
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <PairingDialog
        open={showPairing}
        onOpenChange={setShowPairing}
        onPaired={() => reload()}
      />
    </GlassCard>
  );
}
