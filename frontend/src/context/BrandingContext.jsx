import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

const BrandingCtx = createContext(null);

export function BrandingProvider({ children }) {
  const [logoLight, setLogoLight] = useState(() => localStorage.getItem("strateliq-logo-light") || null);
  const [logoDark, setLogoDark] = useState(() => localStorage.getItem("strateliq-logo-dark") || null);
  const [companyName, setCompanyName] = useState(() => localStorage.getItem("strateliq-company-name") || "STRATELIQ");
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem("strateliq-font-family") || "Exo 2");
  const [loading, setLoading] = useState(true);

  const fetchBranding = useCallback(async () => {
    try {
      const { data } = await api.get("/branding");
      const light = data?.logo_light || null;
      const dark = data?.logo_dark || null;
      const name = data?.company_name || "STRATELIQ";
      const font = data?.font_family || "Exo 2";

      setLogoLight(light);
      setLogoDark(dark);
      setCompanyName(name);
      setFontFamily(font);

      if (light) localStorage.setItem("strateliq-logo-light", light);
      else localStorage.removeItem("strateliq-logo-light");

      if (dark) localStorage.setItem("strateliq-logo-dark", dark);
      else localStorage.removeItem("strateliq-logo-dark");

      localStorage.setItem("strateliq-company-name", name);
      localStorage.setItem("strateliq-font-family", font);
    } catch (e) {
      console.error("Error fetching branding:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  // Load Google Fonts tipography globally
  useEffect(() => {
    if (fontFamily && typeof window !== "undefined") {
      const linkId = "google-font-logo";
      let link = document.getElementById(linkId);
      if (!link) {
        link = document.createElement("link");
        link.id = linkId;
        link.rel = "stylesheet";
        document.head.appendChild(link);
      }
      const fontName = encodeURIComponent(fontFamily);
      link.href = `https://fonts.googleapis.com/css2?family=${fontName}:wght@400;700&display=swap`;
    }
  }, [fontFamily]);

  return (
    <BrandingCtx.Provider value={{ logoLight, logoDark, companyName, fontFamily, loading, refreshBranding: fetchBranding }}>
      {children}
    </BrandingCtx.Provider>
  );
}

export const useBranding = () => useContext(BrandingCtx);
