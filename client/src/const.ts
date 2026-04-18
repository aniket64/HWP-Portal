export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Login erfolgt ausschliesslich ueber die interne Route.
export const getLoginUrl = (_returnPath?: string) => "/login";
