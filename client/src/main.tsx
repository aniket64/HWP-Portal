import { trpc } from "@/lib/trpc";
import { getToken, removeToken } from "@/lib/auth-token";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import { toast } from "sonner";
import App from "./App";
import "./index.css";

// ─── Fehler-Übersetzung ───────────────────────────────────────────────────────

/**
 * Wandelt einen tRPC-Fehler in eine lesbare deutsche Meldung um.
 * Gibt null zurück, wenn der Fehler still ignoriert werden soll
 * (z.B. UNAUTHORIZED → Weiterleitung zur Login-Seite).
 */
function getReadableErrorMessage(error: unknown): string | null {
  if (!(error instanceof TRPCClientError)) return null;

  const code: string = error.data?.code ?? "";
  const rawMessage: string = error.message ?? "";

  // UNAUTHORIZED → Login-Weiterleitung, kein Toast
  if (rawMessage === UNAUTHED_ERR_MSG || code === "UNAUTHORIZED") return null;

  // FORBIDDEN
  if (code === "FORBIDDEN") {
    return "Keine Berechtigung für diese Aktion.";
  }

  // BAD_REQUEST – Zod-Validierungsfehler lesbar machen
  if (code === "BAD_REQUEST") {
    try {
      const parsed = JSON.parse(rawMessage) as Array<{ path?: string[]; message?: string }>;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const fieldErrors = parsed
          .map((e) => {
            const field = e.path?.join(".") ?? "";
            const msg = translateZodMessage(e.message ?? "", field);
            return field ? `${field}: ${msg}` : msg;
          })
          .join("; ");
        return `Ungültige Eingabe – ${fieldErrors}`;
      }
    } catch {
      // kein JSON → Rohtext verwenden
    }
    return "Ungültige Anfrage. Bitte Eingaben prüfen.";
  }

  // NOT_FOUND
  if (code === "NOT_FOUND") {
    return "Der angeforderte Datensatz wurde nicht gefunden.";
  }

  // TIMEOUT
  if (code === "TIMEOUT") {
    return "Die Anfrage hat zu lange gedauert. Bitte erneut versuchen.";
  }

  // TOO_MANY_REQUESTS
  if (code === "TOO_MANY_REQUESTS") {
    return "Zu viele Anfragen. Bitte kurz warten und erneut versuchen.";
  }

  // INTERNAL_SERVER_ERROR
  if (code === "INTERNAL_SERVER_ERROR") {
    // Airtable-Fehler erkennen
    if (rawMessage.includes("Airtable")) {
      return "Verbindung zu Airtable fehlgeschlagen. Bitte später erneut versuchen.";
    }
    return "Serverfehler. Bitte Seite neu laden oder Administrator kontaktieren.";
  }

  // Generischer Fallback – nur anzeigen wenn Meldung vorhanden
  if (rawMessage && rawMessage.length < 200) {
    return `Fehler: ${rawMessage}`;
  }

  return "Ein unbekannter Fehler ist aufgetreten.";
}

/** Übersetzt häufige Zod-Fehlermeldungen ins Deutsche */
function translateZodMessage(msg: string, field: string): string {
  if (msg.includes("too_big") || msg.includes("<=")) {
    const match = msg.match(/<=\s*(\d+)/);
    return match ? `Wert darf maximal ${match[1]} sein` : "Wert zu groß";
  }
  if (msg.includes("too_small") || msg.includes(">=")) {
    const match = msg.match(/>=\s*(\d+)/);
    return match ? `Wert muss mindestens ${match[1]} sein` : "Wert zu klein";
  }
  if (msg.includes("Required") || msg.includes("required")) return "Pflichtfeld";
  if (msg.includes("Invalid email")) return "Ungültige E-Mail-Adresse";
  if (msg.includes("String must contain at least")) return "Eingabe zu kurz";
  if (msg.includes("Invalid enum value")) return "Ungültiger Wert";
  return msg;
}

// ─── Fehler-Tracking (Deduplizierung) ────────────────────────────────────────

// Verhindert doppelte Toasts für denselben Fehler innerhalb von 3 Sekunden
const recentErrors = new Map<string, number>();

function showErrorToast(error: unknown) {
  const message = getReadableErrorMessage(error);
  if (!message) return; // still ignorieren (z.B. UNAUTHORIZED)

  const now = Date.now();
  const last = recentErrors.get(message) ?? 0;
  if (now - last < 3000) return; // Duplikat unterdrücken
  recentErrors.set(message, now);

  toast.error(message, {
    duration: 6000,
    closeButton: true,
  });
}

// ─── Login-Weiterleitung ──────────────────────────────────────────────────────

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;
  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
  if (!isUnauthorized) return;
  removeToken();
  if (!window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
};

// ─── QueryClient mit globalem Fehler-Handler ─────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Keine Wiederholung bei Client-Fehlern (4xx)
        if (error instanceof TRPCClientError) {
          const code = error.data?.code ?? "";
          if (["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"].includes(code)) {
            return false;
          }
        }
        return failureCount < 2;
      },
    },
  },
});

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    showErrorToast(error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    showErrorToast(error);
  }
});

// ─── tRPC-Client ─────────────────────────────────────────────────────────────

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        const token = getToken();
        if (token) {
          return { Authorization: `Bearer ${token}` };
        }
        return {};
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
