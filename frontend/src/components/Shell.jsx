import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Home, MessageSquare, Building2, Clock, Settings, LogOut, ChevronsLeft, ChevronsRight, Shield } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const NAV = [
  { to: "/app", label: "Inicio", icon: Home, testid: "nav-dashboard", end: true },
  { to: "/app/chat", label: "Comité", icon: MessageSquare, testid: "nav-chat" },
  { to: "/app/company", label: "Empresa", icon: Building2, testid: "nav-company" },
  { to: "/app/history", label: "Historial", icon: Clock, testid: "nav-history" },
  { to: "/app/settings", label: "Ajustes", icon: Settings, testid: "nav-settings" },
];

function initials(name) {
  return (name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

export function Shell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-border/60 bg-background/50 sticky top-0 h-screen transition-[width] duration-200 ease-out",
          collapsed ? "w-[72px]" : "w-64"
        )}
        data-testid="app-sidebar"
      >
        <div className={cn("flex items-center h-16 px-4 border-b border-border/60", collapsed ? "justify-center" : "justify-between")}>
          <Link to="/app" className="flex items-center">
            <Logo showText={!collapsed} />
          </Link>
        </div>
        <nav className="flex-1 py-4 px-2 space-y-1">
          {NAV.map(({ to, label, icon: Icon, testid, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-testid={testid}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                  collapsed && "justify-center px-2"
                )
              }
            >
              <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
          {user?.is_admin && (
            <NavLink
              to="/app/admin"
              data-testid="nav-admin"
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                  collapsed && "justify-center px-2"
                )
              }
            >
              <Shield className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
              {!collapsed && <span>Admin</span>}
            </NavLink>
          )}
        </nav>

        <div className="border-t border-border/60 p-2 space-y-1">
          <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2", collapsed && "justify-center px-2")}>
            <Avatar className="h-8 w-8 border border-border/60">
              <AvatarImage src={user?.picture} />
              <AvatarFallback className="text-xs bg-secondary">{initials(user?.name)}</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate" data-testid="user-name">{user?.name}</div>
                <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
              </div>
            )}
          </div>
          <div className={cn("flex", collapsed ? "flex-col gap-1 items-center" : "items-center gap-1")}>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full h-9 w-9"
              onClick={handleLogout}
              data-testid="logout-btn"
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.5} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full h-9 w-9 ml-auto"
              onClick={() => setCollapsed((c) => !c)}
              data-testid="sidebar-toggle"
              aria-label="Colapsar sidebar"
            >
              {collapsed ? (
                <ChevronsRight className="h-4 w-4" strokeWidth={1.5} />
              ) : (
                <ChevronsLeft className="h-4 w-4" strokeWidth={1.5} />
              )}
            </Button>
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 h-14 border-b border-border/60 glass flex items-center justify-between px-4">
          <Link to="/app"><Logo /></Link>
          <ThemeToggle />
        </header>

        <main className="flex-1 pb-24 md:pb-8">{children}</main>

        {/* Mobile Bottom Navigation */}
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 border-t border-border/60 glass"
          data-testid="mobile-bottom-nav"
        >
          <ul className="grid grid-cols-5 h-full">
            {NAV.map(({ to, label, icon: Icon, testid, end }) => {
              const active = end ? location.pathname === to : location.pathname.startsWith(to);
              return (
                <li key={to} className="flex">
                  <NavLink
                    to={to}
                    end={end}
                    data-testid={`${testid}-mobile`}
                    className={cn(
                      "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                      active ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                    <span>{label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
