import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Sparkles, History, Home, GitCompare, LogIn, LogOut, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { path: "/", label: "首页", icon: Home },
  { path: "/validate", label: "创意验证", icon: Sparkles, requireAuth: true },
  { path: "/history", label: "历史记录", icon: History, requireAuth: true },
  { path: "/compare", label: "对比分析", icon: GitCompare, requireAuth: true },
];

export const Navbar = () => {
  const location = useLocation();
  const { user, signOut, isLoading } = useAuth();

  const visibleNavItems = navItems.filter(item => 
    !item.requireAuth || user
  );

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-4 py-4">
      <div className="max-w-6xl mx-auto">
        <div className="glass-card px-6 py-3 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center group-hover:scale-110 transition-transform">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg text-foreground hidden sm:block">
              创意验证器
            </span>
          </Link>

          {/* Navigation Links */}
          <div className="flex items-center gap-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300",
                    isActive 
                      ? "bg-primary text-primary-foreground shadow-lg" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden md:block text-sm font-medium">{item.label}</span>
                </Link>
              );
            })}

            {/* Auth Button */}
            {!isLoading && (
              user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-xl ml-2">
                      <User className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem className="text-muted-foreground" disabled>
                      {user.email}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={signOut} className="text-destructive">
                      <LogOut className="w-4 h-4 mr-2" />
                      退出登录
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Link to="/auth">
                  <Button variant="outline" size="sm" className="rounded-xl ml-2">
                    <LogIn className="w-4 h-4 mr-2" />
                    登录
                  </Button>
                </Link>
              )
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
