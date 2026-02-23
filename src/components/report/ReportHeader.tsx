import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft, Download, Share2, Sparkles, RefreshCw, Loader2,
  ChevronDown, FileText, FileCode,
} from "lucide-react";

interface ReportHeaderProps {
  validation: { id: string; idea: string; tags: string[]; overall_score: number | null };
  aiAnalysis: { overallVerdict?: string };
  evidenceGrade: string;
  proofResult: { verdict: string };
  needsReanalysis: boolean;
  isReanalyzing: boolean;
  onReanalyze: () => void;
  onExportHTML: () => void;
  onExportPdf: () => void;
  onShare: () => void;
}

export const ReportHeader = ({
  validation, aiAnalysis, evidenceGrade, proofResult,
  needsReanalysis, isReanalyzing, onReanalyze, onExportHTML, onExportPdf, onShare,
}: ReportHeaderProps) => (
  <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 animate-fade-in mb-8">
    <div>
      <Link to="/history" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4 transition-colors text-sm font-medium">
        <ArrowLeft className="w-4 h-4 mr-2" />
        返回历史记录
      </Link>
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-3">
        <Sparkles className="w-3 h-3" />
        需求验证报告 #{validation.id.slice(0, 8)}
      </div>
      <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight mb-3">
        {validation.idea.length > 20 ? `${validation.idea.slice(0, 20)}...` : validation.idea}
      </h1>
      <p className="text-muted-foreground max-w-2xl text-lg leading-relaxed">
        {aiAnalysis.overallVerdict || "AI 正在生成深度分析结论..."}
      </p>
      <div className="flex flex-wrap gap-2 mt-4">
        {validation.tags.map((tag: string, i: number) => (
          <Badge key={i} variant="secondary" className="px-3 py-1 text-sm bg-muted/50 border-border/50">#{tag}</Badge>
        ))}
        <Badge variant="outline" className="px-3 py-1 text-sm">证据等级 {evidenceGrade}</Badge>
        <Badge variant="outline" className="px-3 py-1 text-sm">商业可用性 {proofResult.verdict}</Badge>
      </div>
    </div>
    <div className="flex flex-wrap gap-3 mt-4 md:mt-0">
      {needsReanalysis && (
        <Button variant="outline" size="sm" className="rounded-full h-9 border-amber-500/50 text-amber-500 hover:bg-amber-500/10" onClick={onReanalyze} disabled={isReanalyzing}>
          {isReanalyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          {isReanalyzing ? "分析中..." : "补充分析"}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="rounded-full h-9 border-dashed">
            <Download className="w-4 h-4 mr-2" />下载报告<ChevronDown className="w-3 h-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 bg-popover border border-border z-50">
          <DropdownMenuItem onClick={onExportHTML} className="cursor-pointer">
            <FileCode className="w-4 h-4 mr-2 text-primary" />
            <div className="flex flex-col"><span>导出为 HTML</span><span className="text-xs text-muted-foreground">完整报告，可离线查看</span></div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onExportPdf} className="cursor-pointer">
            <FileText className="w-4 h-4 mr-2 text-red-500" />
            <div className="flex flex-col"><span>导出为 PDF</span><span className="text-xs text-muted-foreground">多页完整报告</span></div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="default" size="sm" className="rounded-full h-9 shadow-lg shadow-primary/20" onClick={onShare}>
        <Share2 className="w-4 h-4 mr-2" />分享
      </Button>
    </div>
  </div>
);
