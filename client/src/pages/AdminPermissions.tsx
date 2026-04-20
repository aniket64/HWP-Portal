import DashboardLayout from "@/components/DashboardLayout";

function AdminPermissionsContent() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Berechtigungen entfernt</h1>
      <p className="text-muted-foreground text-sm max-w-2xl">
        Rollen und Berechtigungen werden nicht mehr in der Datenbank verwaltet. Zugriff wird jetzt über Airtable-User und Team-Zuordnung gesteuert.
      </p>
    </div>
  );
}

export default function AdminPermissions() {
  return (
    <DashboardLayout>
      <AdminPermissionsContent />
    </DashboardLayout>
  );
}
