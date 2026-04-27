import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";
import { isLoginDisabled } from "@/lib/feature-flags";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    enabled: !isLoginDisabled,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const disabledUser = {
    id: 1,
    email: "render@hwp-portal.local",
    name: "Render Admin",
    role: "admin" as const,
    airtableAccountId: null,
    companyName: null,
    isActive: true,
    createdAt: new Date(),
    lastSignedIn: null,
  };

  const logout = useCallback(async () => {
    if (isLoginDisabled) {
      utils.auth.me.setData(undefined, disabledUser as any);
      return;
    }

    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    const user = isLoginDisabled ? disabledUser : meQuery.data ?? null;
    localStorage.setItem(
      "runtime-user-info",
      JSON.stringify(user)
    );
    return {
      user,
      loading: isLoginDisabled ? false : meQuery.isLoading || logoutMutation.isPending,
      error: isLoginDisabled ? null : meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: isLoginDisabled ? true : Boolean(meQuery.data),
    };
  }, [
    disabledUser,
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (isLoginDisabled) return;
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
