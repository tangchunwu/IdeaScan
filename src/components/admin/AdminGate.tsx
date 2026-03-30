import { ReactNode } from "react";
import { useAdminGate } from "@/hooks/useAdminGate";
import { BrandLoader } from "@/components/shared";
import AdminLogin from "@/pages/Admin/AdminLogin";

interface AdminGateProps {
  children: ReactNode;
}

const AdminGate = ({ children }: AdminGateProps) => {
  const { isUnlocked, isChecking } = useAdminGate();

  if (isChecking) {
    return <BrandLoader fullScreen text="验证中..." />;
  }

  if (!isUnlocked) {
    return <AdminLogin />;
  }

  return <>{children}</>;
};

export default AdminGate;
