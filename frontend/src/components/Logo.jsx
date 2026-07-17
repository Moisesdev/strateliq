
import { cn } from "@/lib/utils";
import { useTheme } from "@/context/ThemeContext";
import { useBranding } from "@/context/BrandingContext";

export function Logo({ className, showText = true, size = "md" }) {
  const dim = size === "lg" ? 40 : size === "sm" ? 24 : 32;
  const { theme } = useTheme();
  const { logoLight, logoDark, companyName, fontFamily } = useBranding();
  
  const activeLogo = theme === "dark" ? logoDark : logoLight;

  // La tipografía de Google Fonts se carga globalmente a nivel de BrandingProvider

  return (
    <div className={cn("inline-flex items-center gap-2", className)} data-testid="strateliq-logo">
      {activeLogo ? (
        <div
          className="relative rounded-lg overflow-hidden flex items-center justify-center bg-transparent"
          style={{ width: dim, height: dim }}
        >
          <img src={activeLogo} alt="Logo" className="h-full w-full object-contain" />
        </div>
      ) : (
        <div
          className="relative rounded-lg overflow-hidden"
          style={{ width: dim, height: dim }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#0A2540] via-[#0066FF] to-[#0A2540]" />
          <svg
            viewBox="0 0 32 32"
            className="relative z-10 h-full w-full"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M8 20 L14 12 L18 17 L24 9" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="24" cy="9" r="1.6" fill="white" />
          </svg>
        </div>
      )}
      {showText && (
        <span 
          className="font-bold tracking-tight text-foreground text-lg"
          style={{ fontFamily: fontFamily ? `'${fontFamily}', sans-serif` : 'inherit' }}
        >
          {companyName || "STRATELIQ"}
        </span>
      )}
    </div>
  );
}
