import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useOpenClawConnections, type OpenClawConnection } from "@/hooks/useOpenClawConnections";
import { GlassCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Star, RefreshCw, ExternalLink } from "lucide-react";

export function OpenClawSettings() {
  const { user } = useAuth();
  const { connections, loading, addConnection, deleteConnection, setDefault, syncToOpenClaw } = useOpenClawConnections(user?.id);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("default");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleAdd = async () => {
    if (!url.trim()) return;
    setAdding(true);
    try {
      await addConnection(name.trim() || "default", url.trim(), token.trim());
      setShowForm(false);
      setName("default");
      setUrl("");
      setToken("");
    } catch {}
    finally { setAdding(false); }
  };

  const handleSync = async (id?: string) => {
    setSyncing(true);
    try { await syncToOpenClaw(id); } finally { setSyncing(false); }
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
        <div className="space-y-2 p-3 rounded-xl bg-muted/20 border border-border/30">
          <Input placeholder="连接名称" value={name} onChange={e => setName(e.target.value)} className="text-sm rounded-lg" />
          <Input placeholder="服务器 URL (如 http://localhost:3000)" value={url} onChange={e => setUrl(e.target.value)} className="text-sm rounded-lg" />
          <Input placeholder="Token (可选)" value={token} onChange={e => setToken(e.target.value)} type="password" className="text-sm rounded-lg" />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={!url.trim() || adding} className="rounded-lg">
              {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : "保存"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)} className="rounded-lg">取消</Button>
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
            <div key={conn.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/10 border border-border/20">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{conn.name}</span>
                  {conn.is_default && <Badge variant="secondary" className="text-[9px]">默认</Badge>}
                </div>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">{conn.url}</p>
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
          ))}
        </div>
      )}
    </GlassCard>
  );
}
