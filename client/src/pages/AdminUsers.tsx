import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Users,
  RefreshCw,
  Search,
  Check,
  ChevronsUpDown,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { ROLE_LABELS, ROLE_COLORS, type UserRole } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const ROLES: UserRole[] = ["admin", "hwp", "tom", "kam", "tl"];

type UserForm = {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  companyName: string;
  airtableAccountId: string;
};

const emptyForm: UserForm = {
  email: "",
  password: "",
  name: "",
  role: "hwp",
  companyName: "",
  airtableAccountId: "",
};

// ─── Airtable-Account-Lookup-Komponente ──────────────────────────────────────

type AirtableAccount = {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
};

type AirtableAccountPickerProps = {
  value: string;
  onChange: (accountId: string, name?: string) => void;
  disabled?: boolean;
};

function AirtableAccountPicker({ value, onChange, disabled }: AirtableAccountPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: accounts, isLoading, error } = trpc.users.listAirtableAccounts.useQuery(undefined, {
    enabled: open, // Nur laden wenn Popover offen
    staleTime: 5 * 60 * 1000, // 5 Minuten cachen
    retry: false,
  });

  const filtered = useMemo(() => {
    if (!accounts) return [];
    if (!search.trim()) return accounts;
    const s = search.toLowerCase();
    return accounts.filter(a =>
      a.name.toLowerCase().includes(s) ||
      a.accountName.toLowerCase().includes(s) ||
      a.accountId.toLowerCase().includes(s)
    );
  }, [accounts, search]);

  const selectedAccount = accounts?.find(a => a.accountId === value);

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="flex-1 justify-between font-normal text-left"
          >
            <span className="truncate">
              {selectedAccount
                ? `${selectedAccount.name} (${selectedAccount.accountId})`
                : value
                ? value
                : "Aus Airtable auswählen..."}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Name oder Account-ID suchen..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {isLoading && (
                <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Airtable-Accounts laden...
                </div>
              )}
              {error && (
                <div className="py-4 px-3 text-sm text-destructive">
                  Fehler beim Laden: {error.message}
                </div>
              )}
              {!isLoading && !error && (
                <>
                  <CommandEmpty>Kein Account gefunden.</CommandEmpty>
                  <CommandGroup>
                    {filtered.slice(0, 50).map(account => (
                      <CommandItem
                        key={account.id}
                        value={account.accountId}
                        onSelect={() => {
                          onChange(account.accountId, account.name);
                          setOpen(false);
                          setSearch("");
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4 shrink-0",
                            value === account.accountId ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{account.name}</p>
                          {account.accountName && account.accountName !== account.name && (
                            <p className="text-xs text-muted-foreground truncate">{account.accountName}</p>
                          )}
                          <p className="text-xs text-muted-foreground font-mono">{account.accountId}</p>
                        </div>
                      </CommandItem>
                    ))}
                    {filtered.length > 50 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        {filtered.length - 50} weitere Ergebnisse – Suche verfeinern
                      </div>
                    )}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function AdminUsers() {
  return (
    <DashboardLayout>
      <AdminUsersContent />
    </DashboardLayout>
  );
}

function AdminUsersContent() {
  const utils = trpc.useUtils();
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<any | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [editForm, setEditForm] = useState<Partial<UserForm> & { id: number }>({ id: 0 });

  const { data: users, isLoading, refetch } = trpc.users.list.useQuery(undefined, {
    staleTime: 30 * 1000,
  });

  const createMutation = trpc.users.create.useMutation({
    onSuccess: () => {
      toast.success("Benutzer erfolgreich erstellt");
      utils.users.list.invalidate();
      setShowCreate(false);
      setForm(emptyForm);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.users.update.useMutation({
    onSuccess: () => {
      toast.success("Benutzer aktualisiert");
      utils.users.list.invalidate();
      setEditUser(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.users.delete.useMutation({
    onSuccess: () => {
      toast.success("Benutzer gelöscht");
      utils.users.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      email: form.email,
      password: form.password,
      name: form.name,
      role: form.role,
      companyName: form.companyName || undefined,
      airtableAccountId: form.airtableAccountId || undefined,
    });
  };

  const handleEdit = (user: any) => {
    setEditUser(user);
    setEditForm({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyName: user.companyName ?? "",
      airtableAccountId: user.airtableAccountId ?? "",
      password: "",
    });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    const { id, password, ...rest } = editForm;
    updateMutation.mutate({
      id: id!,
      ...rest,
      password: password || undefined,
    } as any);
  };

  const handleToggleActive = (user: any) => {
    updateMutation.mutate({ id: user.id, isActive: !user.isActive });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Benutzerverwaltung</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {users?.length ?? 0} Benutzer registriert
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Benutzer anlegen
          </Button>
        </div>
      </div>

      {/* Benutzerliste */}
      <Card className="border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : !users?.length ? (
          <div className="text-center py-12">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Users className="h-8 w-8 opacity-40" />
              <p className="text-sm">Noch keine Benutzer angelegt</p>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {users.map((user) => (
              <div key={user.id} className="flex items-center gap-3 p-3 sm:p-4 hover:bg-muted/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{user.name}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[user.role as UserRole]}`}>
                      {ROLE_LABELS[user.role as UserRole]}
                    </span>
                    {!user.isActive && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">Inaktiv</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{user.email}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {user.companyName && (
                      <span className="text-xs text-muted-foreground">{user.companyName}</span>
                    )}
                    {user.airtableAccountId && (
                      <div className="flex items-center gap-1">
                        <Link2 className="h-3 w-3 text-emerald-600 shrink-0" />
                        <span className="text-xs text-muted-foreground font-mono truncate max-w-[100px] sm:max-w-[160px]">
                          {user.airtableAccountId}
                        </span>
                      </div>
                    )}
                    <span className="text-xs text-muted-foreground">{new Date(user.createdAt).toLocaleDateString("de-DE")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={user.isActive}
                    onCheckedChange={() => handleToggleActive(user)}
                    aria-label="Benutzer aktiv/inaktiv"
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(user)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Bearbeiten
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          if (confirm(`Benutzer "${user.name}" wirklich löschen?`)) {
                            deleteMutation.mutate({ id: user.id });
                          }
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Löschen
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Neuen Benutzer anlegen</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Max Mustermann"
                  required
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>E-Mail *</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="max@firma.de"
                  required
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Passwort * (min. 8 Zeichen)</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Rolle *</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => setForm({ ...form, role: v as UserRole })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Unternehmen</Label>
                <Input
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  placeholder="Firma GmbH"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Airtable Account-ID
                  {form.role === "hwp" && (
                    <Badge variant="outline" className="text-xs ml-1">Pflichtfeld für HWP</Badge>
                  )}
                </Label>
                {form.role === "hwp" ? (
                  <AirtableAccountPicker
                    value={form.airtableAccountId}
                    onChange={(accountId, name) => {
                      setForm(f => ({
                        ...f,
                        airtableAccountId: accountId,
                        // Name automatisch befüllen wenn noch leer
                        name: f.name || name || f.name,
                      }));
                    }}
                  />
                ) : (
                  <Input
                    value={form.airtableAccountId}
                    onChange={(e) => setForm({ ...form, airtableAccountId: e.target.value })}
                    placeholder="accXXXXXXXXXXXXXX"
                    className="font-mono text-sm"
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  {form.role === "hwp"
                    ? "Verknüpft den HWP-Login mit seinem Airtable-Account. Klicken Sie auf den Button um aus Airtable zu wählen."
                    : "Nur für HWP-Benutzer relevant."}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Erstellen
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Benutzer bearbeiten</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={editForm.name ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>E-Mail</Label>
                <Input
                  type="email"
                  value={editForm.email ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Neues Passwort (leer lassen = unverändert)</Label>
                <Input
                  type="password"
                  value={editForm.password ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="••••••••"
                  minLength={8}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Rolle</Label>
                <Select
                  value={editForm.role ?? "hwp"}
                  onValueChange={(v) => setEditForm({ ...editForm, role: v as UserRole })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Unternehmen</Label>
                <Input
                  value={editForm.companyName ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Airtable Account-ID
                </Label>
                {editForm.role === "hwp" ? (
                  <AirtableAccountPicker
                    value={editForm.airtableAccountId ?? ""}
                    onChange={(accountId) => setEditForm(f => ({ ...f, airtableAccountId: accountId }))}
                  />
                ) : (
                  <Input
                    value={editForm.airtableAccountId ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, airtableAccountId: e.target.value })}
                    className="font-mono text-sm"
                    placeholder="accXXXXXXXXXXXXXX"
                  />
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditUser(null)}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Speichern
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
