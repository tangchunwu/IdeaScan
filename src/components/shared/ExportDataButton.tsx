import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export function ExportDataButton() {
  const [isExporting, setIsExporting] = useState(false);
  const { t } = useTranslation();

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("export-user-data");

      if (error) {
        throw new Error(error.message || "Export failed");
      }

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lovable-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(
        t("export.success", `导出成功！共 ${data.summary.totalRecords} 条记录，${data.summary.tablesExported} 个表`)
      );
    } catch (error: any) {
      console.error("Export error:", error);
      toast.error(t("export.error", "导出失败: ") + (error.message || "Unknown error"));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={isExporting}
      className="gap-2"
    >
      {isExporting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {isExporting ? t("export.exporting", "导出中...") : t("export.button", "导出我的数据")}
    </Button>
  );
}
