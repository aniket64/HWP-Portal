import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save, Shield } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { ROLE_LABELS, type UserRole } from "@/hooks/useAuth";

const ROLES: UserRole[] = ["admin", "hwp", "tom", "kam", "tl"];

type PermissionSet = {
  viewMehrkosten: boolean;
  editMehrkosten: boolean;
  approveMehrkosten: boolean;
  viewAllHWP: boolean;
  viewOwnHWP: boolean;
  manageUsers: boolean;
  manageRoles: boolean;
  viewInvoices: boolean;
  uploadDocuments: boolean;
  viewReports: boolean;
};

const PERMISSION_LABELS: Record<keyof PermissionSet, string> = {
  viewMehrkosten: "Mehrkosten anzeigen",
  editMehrkosten: "Mehrkosten bearbeiten",
  approveMehrkosten: "Mehrkosten freigeben/ablehnen",
  viewAllHWP: "Alle HWP-Daten sehen",
  viewOwnHWP: "Eigene HWP-Daten sehen",
  manageUsers: "Benutzer verwalten",
  manageRoles: "Rollen & Berechtigungen verwalten",
  viewInvoices: "Rechnungen einsehen",
  uploadDocuments: "Dokumente hochladen",
  viewReports: "Berichte anzeigen",
};

const DEFAULT_PERMISSIONS: Record<UserRole, PermissionSet> = {
  admin: {
    viewMehrkosten: true,
    editMehrkosten: true,
    approveMehrkosten: true,
    viewAllHWP: true,
    viewOwnHWP: true,
    manageUsers: true,
    manageRoles: true,
    viewInvoices: true,
    uploadDocuments: true,
    viewReports: true,
  },
  tom: {
    viewMehrkosten: true,
    editMehrkosten: true,
    approveMehrkosten: true,
    viewAllHWP: true,
    viewOwnHWP: true,
    manageUsers: false,
    manageRoles: false,
    viewInvoices: true,
    uploadDocuments: true,
    viewReports: true,
  },
  kam: {
    viewMehrkosten: true,
    editMehrkosten: false,
    approveMehrkosten: true,
    viewAllHWP: true,
    viewOwnHWP: true,
    manageUsers: false,
    manageRoles: false,
    viewInvoices: true,
    uploadDocuments: false,
    viewReports: true,
  },
  tl: {
    viewMehrkosten: true,
    editMehrkosten: false,
    approveMehrkosten: false,
    viewAllHWP: true,
    viewOwnHWP: true,
    manageUsers: false,
    manageRoles: false,
    viewInvoices: false,
    uploadDocuments: false,
    viewReports: true,
  },
  hwp: {
    viewMehrkosten: true,
    editMehrkosten: false,
    approveMehrkosten: false,
    viewAllHWP: false,
    viewOwnHWP: true,
    manageUsers: false,
    manageRoles: false,
    viewInvoices: false,
    uploadDocuments: true,
    viewReports: false,
  },
};

export default function AdminPermissions() {
  return (
    <DashboardLayout>
      <AdminPermissionsContent />
    </DashboardLayout>
  );
}

function AdminPermissionsContent() {
  const utils = trpc.useUtils();
  const { data: dbPerms, isLoading } = trpc.permissions.list.useQuery();
  const updateMutation = trpc.permissions.update.useMutation({
    onSuccess: () => {
      toast.success("Berechtigungen gespeichert");
      utils.permissions.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [perms, setPerms] = useState<Record<UserRole, PermissionSet>>(DEFAULT_PERMISSIONS);
  const [dirty, setDirty] = useState<Set<UserRole>>(new Set());

  useEffect(() => {
    if (dbPerms && dbPerms.length > 0) {
      const merged = { ...DEFAULT_PERMISSIONS };
      for (const p of dbPerms) {
        if (p.role in merged) {
          merged[p.role as UserRole] = p.permissions as PermissionSet;
        }
      }
      setPerms(merged);
    }
  }, [dbPerms]);

  const toggle = (role: UserRole, key: keyof PermissionSet) => {
    setPerms((prev) => ({
      ...prev,
      [role]: { ...prev[role], [key]: !prev[role][key] },
    }));
    setDirty((d) => new Set(d).add(role));
  };

  const save = (role: UserRole) => {
    updateMutation.mutate({ role, permissions: perms[role] });
    setDirty((d) => { const s = new Set(d); s.delete(role); return s; });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Berechtigungen</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Rollenbasierte Zugriffsrechte konfigurieren
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {ROLES.map((role) => (
          <Card key={role} className="border shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">{ROLE_LABELS[role]}</CardTitle>
              </div>
              {dirty.has(role) && (
                <Button
                  size="sm"
                  onClick={() => save(role)}
                  disabled={updateMutation.isPending}
                  className="gap-2"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Speichern
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {(Object.keys(PERMISSION_LABELS) as (keyof PermissionSet)[]).map((key) => (
                <div key={key} className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <span className="text-sm text-foreground">{PERMISSION_LABELS[key]}</span>
                  <Switch
                    checked={perms[role][key]}
                    onCheckedChange={() => {
                      if (role === "admin" && (key === "manageUsers" || key === "manageRoles")) return;
                      toggle(role, key);
                    }}
                    disabled={role === "admin" && (key === "manageUsers" || key === "manageRoles")}
                    aria-label={PERMISSION_LABELS[key]}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
