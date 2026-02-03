import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ImportResult {
  success: boolean;
  summary: {
    totalImported: number;
    totalSkipped: number;
    totalErrors: number;
  };
  tables: Record<string, { imported: number; skipped: number; errors: string[] }>;
}

export function ImportDataButton() {
  const [isImporting, setIsImporting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [importData, setImportData] = useState<any>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate structure
      if (!data.tables || !data.summary || !data.exportedAt) {
        throw new Error("Invalid export file format");
      }

      setImportData(data);
      setShowConfirm(true);
    } catch (error) {
      toast.error(t("import.invalidFile", "文件格式无效，请选择正确的导出文件"));
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImport = async () => {
    if (!importData) return;

    setIsImporting(true);
    setShowConfirm(false);

    try {
      const { data, error } = await supabase.functions.invoke("import-user-data", {
        body: { data: importData },
      });

      if (error) {
        throw new Error(error.message || "Import failed");
      }

      setImportResult(data);

      if (data.summary.totalImported > 0) {
        toast.success(
          t("import.success", `导入成功！共导入 ${data.summary.totalImported} 条记录`)
        );
      } else {
        toast.info(t("import.noData", "没有新数据需要导入"));
      }
    } catch (error: any) {
      console.error("Import error:", error);
      toast.error(t("import.error", "导入失败: ") + (error.message || "Unknown error"));
    } finally {
      setIsImporting(false);
      setImportData(null);
    }
  };

  const handleCancel = () => {
    setShowConfirm(false);
    setImportData(null);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={isImporting}
        className="gap-2"
      >
        {isImporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {isImporting ? t("import.importing", "导入中...") : t("import.button", "导入数据")}
      </Button>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认导入数据</DialogTitle>
            <DialogDescription>
              您即将导入以下数据：
            </DialogDescription>
          </DialogHeader>

          {importData && (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                导出时间: {new Date(importData.exportedAt).toLocaleString()}
              </p>
              <p className="text-muted-foreground">
                总记录数: {importData.summary.totalRecords} 条
              </p>
              <div className="mt-3 p-3 bg-muted rounded-md space-y-1">
                {Object.entries(importData.tables).map(([table, info]: [string, any]) => (
                  <div key={table} className="flex justify-between">
                    <span>{table}</span>
                    <span className="text-muted-foreground">{info.count} 条</span>
                  </div>
                ))}
              </div>
              <p className="text-amber-600 text-xs mt-3">
                ⚠️ 注意：加密的用户设置无法导入，请在新项目中重新配置 API 密钥。
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              取消
            </Button>
            <Button onClick={handleImport} disabled={isImporting}>
              {isImporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              确认导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Result Dialog */}
      <Dialog open={!!importResult} onOpenChange={() => setImportResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导入完成</DialogTitle>
          </DialogHeader>

          {importResult && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 bg-green-50 rounded-md">
                  <div className="text-2xl font-bold text-green-600">
                    {importResult.summary.totalImported}
                  </div>
                  <div className="text-xs text-green-700">成功导入</div>
                </div>
                <div className="p-3 bg-yellow-50 rounded-md">
                  <div className="text-2xl font-bold text-yellow-600">
                    {importResult.summary.totalSkipped}
                  </div>
                  <div className="text-xs text-yellow-700">跳过/重复</div>
                </div>
                <div className="p-3 bg-red-50 rounded-md">
                  <div className="text-2xl font-bold text-red-600">
                    {importResult.summary.totalErrors}
                  </div>
                  <div className="text-xs text-red-700">错误</div>
                </div>
              </div>

              <div className="mt-3 p-3 bg-muted rounded-md space-y-1 max-h-48 overflow-y-auto">
                {Object.entries(importResult.tables).map(([table, info]: [string, any]) => (
                  <div key={table} className="flex justify-between items-center">
                    <span>{table}</span>
                    <span className="text-xs">
                      <span className="text-green-600">{info.imported} 导入</span>
                      {info.skipped > 0 && (
                        <span className="text-yellow-600 ml-2">{info.skipped} 跳过</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setImportResult(null)}>
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
