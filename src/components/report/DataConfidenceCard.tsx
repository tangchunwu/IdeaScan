import { Shield, Database, TrendingUp, BarChart3 } from 'lucide-react';
import { GlassCard } from '@/components/shared';

interface DataConfidenceCardProps {
  sampleSize: number;
  platforms: { name: string; count: number }[];
  dataFreshness?: 'fresh' | 'moderate' | 'stale';
  qualityScore?: number;
  className?: string;
}

export const DataConfidenceCard = ({ sampleSize, platforms, dataFreshness, className = '' }: DataConfidenceCardProps) => {
  const covered = platforms.filter(p => Number.isFinite(p.count) && p.count > 0);
  const total = covered.reduce((sum, p) => sum + p.count, 0);
  const freshness = dataFreshness ? ({ fresh: '最近7天', moderate: '7-30天', stale: '超过30天' })[dataFreshness] : '时间范围未知';
  return <GlassCard className={`p-5 ${className}`}>
    <div className="mb-4 flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /><h4 className="font-semibold">证据覆盖情况</h4></div>
    <div className="mb-4 grid grid-cols-3 gap-3 text-center">
      <div className="rounded-xl bg-card/50 p-3"><Database className="mx-auto mb-1 h-4 w-4 text-primary" /><p className="number-highlight text-lg font-bold">{sampleSize}</p><p className="text-xs text-muted-foreground">实际样本</p></div>
      <div className="rounded-xl bg-card/50 p-3"><BarChart3 className="mx-auto mb-1 h-4 w-4 text-primary" /><p className="number-highlight text-lg font-bold">{covered.length}</p><p className="text-xs text-muted-foreground">有数据的平台</p></div>
      <div className="rounded-xl bg-card/50 p-3"><TrendingUp className="mx-auto mb-1 h-4 w-4 text-primary" /><p className="text-xs text-muted-foreground">{freshness}</p></div>
    </div>
    <div className="space-y-2">{covered.map(p => <div className="flex items-center gap-2 text-xs" key={p.name}><span className="w-20 truncate">{p.name}</span><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${total ? p.count / total * 100 : 0}%` }} /></div><span>{p.count} 条</span></div>)}</div>
    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">公开样本受检索和平台分布影响。请核对来源相关性、地域与时间，并结合反证和实际行为继续验证。</p>
  </GlassCard>;
};
export default DataConfidenceCard;
