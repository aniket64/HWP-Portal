import { trpc } from "@/lib/trpc";
import { removeToken } from "@/lib/auth-token";
import { useCallback } from "react";

export type UserRole = "admin" | "hwp" | "tom" | "kam" | "tl";

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  airtableAccountId?: string | null;
  companyName?: string | null;
  isActive: boolean;
  createdAt: Date;
  lastSignedIn?: Date | null;
};

export function useAuth() {
  const { data: user, isLoading, error, refetch } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000,
    // Kein refetchOnWindowFocus – verhindert unerwartete Logouts bei Tab-Wechsel
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      // Token aus localStorage entfernen
      removeToken();
      window.location.href = "/login";
    },
  });

  const logout = useCallback(() => {
    logoutMutation.mutate();
  }, [logoutMutation]);

  return {
    user: user as AuthUser | null | undefined,
    isLoading,
    error,
    isAuthenticated: !!user,
    logout,
    refetch,
  };
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrator",
  hwp: "Handwerkspartner",
  tom: "Technical Operations Manager",
  kam: "Key Account Manager",
  tl: "Teamlead",
};

export const ROLE_COLORS: Record<UserRole, string> = {
  admin: "bg-purple-100 text-purple-800",
  hwp: "bg-blue-100 text-blue-800",
  tom: "bg-emerald-100 text-emerald-800",
  kam: "bg-amber-100 text-amber-800",
  tl: "bg-slate-100 text-slate-700",
};
