import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useOpenClawConnections, type OpenClawConnection } from "@/hooks/useOpenClawConnections";
import { GlassCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, Star, RefreshCw, Copy, Check } from "lucide-react";
import { toast } from "sonner";

export function OpenClawSettings() {
  const { user } = useAuth();
  const { connections, loading, addConnection, deleteConnection, setDefault, syncToOpenClaw } = useOpenClawConnections(user?.id);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("default");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [mode, setMode] = useState<'direct' | 'relay'>('direct');
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  const getBridgeCommand = (conn: OpenClawConnection) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co`;
    return `python bridge.py --supabase-url ${supabaseUrl} --connection-id ${conn.id} --token ${conn.token || '<token>'} --agent-url http://localhost:11434`;
  };

  if (!user) return null;

  return (
    <GlassCard className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm text-foreground">OpenClaw 连接</h3>
          <p className="text-xs text-muted-foreground mt-0.5">连接你的 AI Agent 服务器</p>
        </div>
        <Button size="sm" variant="outline" className="rounded-xl gap-1" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-3 h-3" /> 添加
        </Button>
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
        <p className="text-xs text-muted-foreground text-center py-4">尚未添加任何连接，点击上方"添加"按钮开始配置</p>
      ) : (
        <div className="space-y-2">
          {connections.map(conn => (
            <div key={conn.id} className="p-3 rounded-xl bg-muted/10 border border-border/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{conn.name}</span>
                    {conn.is_default && <Badge variant="secondary" className="text-[9px]">默认</Badge>}
                    <Badge variant={conn.mode === 'relay' ? 'default' : 'outline'} className="text-[9px]">
                      {conn.mode === 'relay' ? '中继' : '直连'}
                    </Badge>
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
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <code className="text-[9px] bg-muted/30 px-1.5 py-0.5 rounded flex-1 truncate font-mono">
                      ID: {conn.id}
                    </code>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => copyToClipboard(conn.id, `id-${conn.id}`)}>
                      {copiedId === `id-${conn.id}` ? <Check className="w-2.5 h-2.5 text-green-500" /> : <Copy className="w-2.5 h-2.5" />}
                    </Button>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full text-[10px] h-7 rounded-lg gap-1"
                    onClick={() => copyToClipboard(getBridgeCommand(conn), `cmd-${conn.id}`)}
                  >
                    {copiedId === `cmd-${conn.id}` ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    复制启动命令
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
