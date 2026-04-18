// Token-Key für localStorage – in eigener Datei um zirkuläre Imports zu vermeiden
export const TOKEN_KEY = "hwp_auth_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
