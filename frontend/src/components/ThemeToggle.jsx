import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ variant = "ghost" }) {
  const { theme, toggle } = useTheme();
  return (
    <Button
      variant={variant}
      size="icon"
      onClick={toggle}
      aria-label="Cambiar tema"
      data-testid="theme-toggle-btn"
      className="rounded-full h-9 w-9"
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" strokeWidth={1.5} />
      ) : (
        <Moon className="h-4 w-4" strokeWidth={1.5} />
      )}
    </Button>
  );
}
