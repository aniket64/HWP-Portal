import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import de from "../locales/de.json";

type Language = "en" | "de";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Initialize i18n
i18n.use(initReactI18next).init({
  fallbackLng: "de",
  lng: typeof window !== "undefined" ? localStorage.getItem("language") || "de" : "de",
  interpolation: {
    escapeValue: false,
  },
  resources: {
    en: { translation: en },
    de: { translation: de },
  },
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(
    (typeof window !== "undefined" ? localStorage.getItem("language") : "de") as Language || "de"
  );

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("language", lang);
    i18n.changeLanguage(lang);
  };

  useEffect(() => {
    const storedLang = localStorage.getItem("language") as Language;
    if (storedLang && storedLang !== language) {
      setLanguage(storedLang);
    }
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
