import { ReactNode, useState, useCallback } from "react";
import { BrandLoader } from "@/components/shared";
import AdminLogin from "@/pages/Admin/AdminLogin";

const STORAGE_KEY = "admin_gate_token";

interface AdminGateProps {
  children: ReactNode;
}

const AdminGate = ({ children }: AdminGateProps) => {
  const [isUnlocked, setIsUnlocked] = useState(() => !!sessionStorage.getItem(STORAGE_KEY));

  const handleSuccess = useCallback(() => {
    setIsUnlocked(true);
  }, []);

  if (!isUnlocked) {
    return <AdminLogin onSuccess={handleSuccess} />;
  }

  return <>{children}</>;
};

export default AdminGate;
