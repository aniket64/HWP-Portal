import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, Building2, AlertCircle, CheckCircle2, ArrowLeft, Globe } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { isLoginDisabled } from "@/lib/feature-flags";

export default function Register() {
  const [, setLocation] = useLocation();
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();
  const registerMutation = trpc.auth.registerHwp.useMutation({
    onSuccess: () => {
      setSuccess(true);
    },
    onError: (err) => {
      setError(err.message || t("registerError"));
    },
  });
  const [form, setForm] = useState({
    email: "",
    password: "",
    passwordConfirm: "",
    name: "",
    companyName: "",
    airtableAccountId: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isLoginDisabled) {
      setLocation("/dashboard");
    }
  }, [setLocation]);

  if (isLoginDisabled) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.passwordConfirm) {
      setError(t("passwordMismatch"));
      return;
    }
    if (form.password.length < 8) {
      setError(t("passwordTooShort"));
      return;
    }

    registerMutation.mutate({
      email: form.email,
      password: form.password,
      name: form.name,
      companyName: form.companyName,
      airtableAccountId: form.airtableAccountId || undefined,
    });
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="relative w-full max-w-md px-4">
          <Card className="bg-slate-800/60 border-slate-700 backdrop-blur-sm shadow-2xl">
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-400/30">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-white">{t("registerSuccess")}</h2>
              <p className="text-slate-400 text-sm">
                {t("registerSuccessMessage")}
              </p>
              <Button
                onClick={() => setLocation("/login")}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white mt-4"
              >
                {t("goToLogin")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      {/* Language toggle */}
      <div className="absolute top-6 right-6 z-50">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-10 w-10 flex items-center justify-center hover:bg-slate-700/50 rounded-lg transition-colors focus:outline-none border border-slate-600/50"
              aria-label="Sprache ändern"
            >
              <Globe className="h-5 w-5 text-slate-300" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40 bg-slate-800 border-slate-700">
            <DropdownMenuLabel className="text-xs font-semibold text-slate-300">Language</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-slate-700" />
            <DropdownMenuItem
              onClick={() => setLanguage("en")}
              className={`${language === "en" ? "bg-blue-900/50" : ""} text-slate-300 hover:text-white`}
            >
              <span>English</span>
              {language === "en" && <span className="ml-auto text-xs">✓</span>}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setLanguage("de")}
              className={`${language === "de" ? "bg-blue-900/50" : ""} text-slate-300 hover:text-white`}
            >
              <span>Deutsch</span>
              {language === "de" && <span className="ml-auto text-xs">✓</span>}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="relative w-full max-w-md px-4 py-8">
        {/* Logo / Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/20 border border-blue-400/30 mb-4">
            <Building2 className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">HWP Portal</h1>
          <p className="text-slate-400 mt-1 text-sm">{t("registerDescription")}</p>
        </div>

        <Card className="bg-slate-800/60 border-slate-700 backdrop-blur-sm shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-white text-lg">{t("register")}</CardTitle>
            <CardDescription className="text-slate-400 text-sm">
              Registrieren Sie sich als Handwerkspartner
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive" className="bg-red-900/30 border-red-700 text-red-300">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-slate-300 text-sm">{t("name")} *</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Max Mustermann"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    required
                    className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="companyName" className="text-slate-300 text-sm">{t("companyName")} *</Label>
                  <Input
                    id="companyName"
                    type="text"
                    placeholder="Mustermann GmbH"
                    value={form.companyName}
                    onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
                    required
                    className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-slate-300 text-sm">{t("emailAddress")} *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="max@mustermann.de"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  required
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-slate-300 text-sm">{t("password")} *</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min. 8 Zeichen"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    required
                    className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="passwordConfirm" className="text-slate-300 text-sm">{t("passwordConfirm")} *</Label>
                  <Input
                    id="passwordConfirm"
                    type="password"
                    placeholder="Passwort bestätigen"
                    value={form.passwordConfirm}
                    onChange={e => setForm(f => ({ ...f, passwordConfirm: e.target.value }))}
                    required
                    className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="airtableAccountId" className="text-slate-300 text-sm">
                  Airtable-Konto-ID <span className="text-slate-500 text-xs">(optional, kann später ergänzt werden)</span>
                </Label>
                <Input
                  id="airtableAccountId"
                  type="text"
                  placeholder="z.B. 0015g00000AbCdEfG"
                  value={form.airtableAccountId}
                  onChange={e => setForm(f => ({ ...f, airtableAccountId: e.target.value }))}
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                />
                <p className="text-xs text-slate-500">
                  Die Konto-ID verknüpft Ihr Konto mit Ihren Aufträgen. Falls unbekannt, kann der Administrator diese später eintragen.
                </p>
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium"
                disabled={registerMutation.isPending}
              >
                {registerMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("registering")}
                  </>
                ) : (
                  t("register")
                )}
              </Button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setLocation("/login")}
                  className="text-sm text-slate-400 hover:text-slate-300 inline-flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {t("back")}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
