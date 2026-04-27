import { isLoginDisabled } from "@/lib/feature-flags";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const getLoginUrl = (_returnPath?: string) =>
	isLoginDisabled ? "/dashboard" : "/login";
