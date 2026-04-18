/**
 * Teams-Verwaltung
 *
 * Admin: Vollzugriff (anlegen, bearbeiten, löschen, Mitglieder + HWPs zuordnen)
 * KAM/TOM/TL: Nur eigene Teams anzeigen (read-only)
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Users,
  HardHat,
  Search,
  UsersRound,
} from "lucide-react";

// ─── Typen ───────────────────────────────────────────────────────────────────

type TeamMitglied = {
  id: number;
  teamId: number;
  userId: number;
  teamRolle: "kam" | "tom" | "tl";
  createdAt: Date;
  userName: string;
  userEmail: string;
  userRole: string;
};

type HwpZuordnung = {
  id: number;
  teamId: number;
  hwpAccountId: string;
  hwpName: string;
  createdAt: Date;
};

type Team = {
  id: number;
  name: string;
  beschreibung: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: number | null;
  mitglieder: TeamMitglied[];
  hwpZuordnungen: HwpZuordnung[];
};

type VerfuegbarerNutzer = {
  id: number;
  name: string;
  email: string;
  role: string;
};

// ─── Rollen-Badge ─────────────────────────────────────────────────────────────

const ROLLE_LABELS: Record<string, string> = {
  kam: "KAM",
  tom: "TOM",
  tl: "TL",
  admin: "Admin",
};

const ROLLE_COLORS: Record<string, string> = {
  kam: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  tom: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  tl: "bg-purple-500/20 text-purple-300 border-purple-500/30",
};

function RolleBadge({ rolle }: { rolle: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${ROLLE_COLORS[rolle] ?? "bg-muted text-muted-foreground"}`}>
      {ROLLE_LABELS[rolle] ?? rolle.toUpperCase()}
    </span>
  );
}

// ─── Team-Dialog (Anlegen / Bearbeiten) ───────────────────────────────────────

function TeamDialog({
  open,
  onClose,
  team,
  verfuegbareMitglieder,
  allHwps,
}: {
  open: boolean;
  onClose: () => void;
  team?: Team | null;
  verfuegbareMitglieder: VerfuegbarerNutzer[];
  allHwps: { hwpAccountId: string; hwpName: string }[];
}) {
  const utils = trpc.useUtils();
  const isEdit = !!team;

  const [name, setName] = useState(team?.name ?? "");
  const [beschreibung, setBeschreibung] = useState(team?.beschreibung ?? "");
  const [selectedMitglieder, setSelectedMitglieder] = useState<
    { userId: number; teamRolle: "kam" | "tom" | "tl" }[]
  >(
    team?.mitglieder.map((m) => ({ userId: m.userId, teamRolle: m.teamRolle })) ?? []
  );
  const [selectedHwps, setSelectedHwps] = useState<
    { hwpAccountId: string; hwpName: string }[]
  >(
    team?.hwpZuordnungen.map((h) => ({
      hwpAccountId: h.hwpAccountId,
      hwpName: h.hwpName,
    })) ?? []
  );
  const [hwpSearch, setHwpSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");

  const createMutation = trpc.teams.create.useMutation({
    onSuccess: () => {
      utils.teams.list.invalidate();
      toast.success(`Team "${name}" wurde erfolgreich erstellt.`);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.teams.update.useMutation({
    onSuccess: () => {
      utils.teams.list.invalidate();
      toast.success("Änderungen wurden gespeichert.");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const setMitgliederMutation = trpc.teams.setMitglieder.useMutation();
  const setHwpsMutation = trpc.teams.setHwpZuordnungen.useMutation();

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Bitte gib einen Team-Namen ein.");
      return;
    }

    try {
      let savedTeamId: number;

      if (isEdit && team) {
        const result = await updateMutation.mutateAsync({
          id: team.id,
          name: name.trim(),
          beschreibung: beschreibung.trim() || null,
        });
        savedTeamId = result!.id;
      } else {
        const result = await createMutation.mutateAsync({
          name: name.trim(),
          beschreibung: beschreibung.trim() || undefined,
        });
        savedTeamId = result!.id;
      }

      // Mitglieder und HWPs setzen
      await setMitgliederMutation.mutateAsync({
        teamId: savedTeamId,
        mitglieder: selectedMitglieder,
      });
      await setHwpsMutation.mutateAsync({
        teamId: savedTeamId,
        hwps: selectedHwps,
      });

      utils.teams.list.invalidate();
      onClose();
    } catch {
      // Fehler werden von den Mutations-Callbacks behandelt
    }
  };

  const toggleMitglied = (userId: number, rolle: string) => {
    setSelectedMitglieder((prev) => {
      const exists = prev.find((m) => m.userId === userId);
      if (exists) {
        return prev.filter((m) => m.userId !== userId);
      }
      return [...prev, { userId, teamRolle: rolle as "kam" | "tom" | "tl" }];
    });
  };

  const toggleHwp = (hwpAccountId: string, hwpName: string) => {
    setSelectedHwps((prev) => {
      const exists = prev.find((h) => h.hwpAccountId === hwpAccountId);
      if (exists) {
        return prev.filter((h) => h.hwpAccountId !== hwpAccountId);
      }
      return [...prev, { hwpAccountId, hwpName }];
    });
  };

  const filteredHwps = useMemo(() => {
    const q = hwpSearch.toLowerCase();
    return allHwps.filter((h) => h.hwpName.toLowerCase().includes(q));
  }, [allHwps, hwpSearch]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.toLowerCase();
    return verfuegbareMitglieder.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q)
    );
  }, [verfuegbareMitglieder, memberSearch]);

  const isSaving =
    createMutation.isPending ||
    updateMutation.isPending ||
    setMitgliederMutation.isPending ||
    setHwpsMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Team bearbeiten" : "Neues Team anlegen"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Passe Name, Beschreibung, Mitglieder und HWP-Zuordnungen an."
              : "Lege ein neues Team an und weise KAM/TOM-Mitglieder sowie HWP-Partner zu."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Team-Name *</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Team Nord"
              autoFocus
            />
          </div>

          {/* Beschreibung */}
          <div className="space-y-1.5">
            <Label htmlFor="team-beschreibung">Beschreibung</Label>
            <Textarea
              id="team-beschreibung"
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              placeholder="Optionale Beschreibung des Teams..."
              rows={2}
            />
          </div>

          {/* Mitglieder */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Mitglieder ({selectedMitglieder.length} ausgewählt)
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Mitglieder suchen..."
                className="pl-9"
              />
            </div>
            <ScrollArea className="h-44 rounded-md border bg-muted/30 p-2">
              {filteredMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Keine KAM/TOM/TL-Nutzer gefunden
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredMembers.map((m) => {
                    const isChecked = selectedMitglieder.some((s) => s.userId === m.id);
                    return (
                      <div
                        key={m.id}
                        className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer"
                        onClick={() => toggleMitglied(m.id, m.role)}
                      >
                        <Checkbox checked={isChecked} onCheckedChange={() => toggleMitglied(m.id, m.role)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{m.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                        </div>
                        <RolleBadge rolle={m.role} />
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* HWP-Zuordnungen */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <HardHat className="h-4 w-4" />
              HWP-Partner ({selectedHwps.length} ausgewählt)
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={hwpSearch}
                onChange={(e) => setHwpSearch(e.target.value)}
                placeholder="HWP suchen..."
                className="pl-9"
              />
            </div>
            <ScrollArea className="h-48 rounded-md border bg-muted/30 p-2">
              {filteredHwps.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Keine HWP-Partner gefunden
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredHwps.map((h) => {
                    const isChecked = selectedHwps.some((s) => s.hwpAccountId === h.hwpAccountId);
                    return (
                      <div
                        key={h.hwpAccountId}
                        className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer"
                        onClick={() => toggleHwp(h.hwpAccountId, h.hwpName)}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleHwp(h.hwpAccountId, h.hwpName)}
                        />
                        <span className="text-sm truncate">{h.hwpName}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Wird gespeichert…" : isEdit ? "Änderungen speichern" : "Team anlegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Team-Karte ───────────────────────────────────────────────────────────────

function TeamCard({
  team,
  isAdmin,
  onEdit,
  onDelete,
}: {
  team: Team;
  isAdmin: boolean;
  onEdit: (team: Team) => void;
  onDelete: (team: Team) => void;
}) {
  const [open, setOpen] = useState(false);

  const kamMembers = team.mitglieder.filter((m) => m.teamRolle === "kam");
  const tomMembers = team.mitglieder.filter((m) => m.teamRolle === "tom");
  const tlMembers = team.mitglieder.filter((m) => m.teamRolle === "tl");

  return (
    <Card className="border-border/50 hover:border-border transition-colors">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 text-left flex-1 min-w-0 group">
                {open ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
                )}
                <div className="min-w-0">
                  <CardTitle className="text-base truncate">{team.name}</CardTitle>
                  {team.beschreibung && (
                    <CardDescription className="mt-0.5 line-clamp-1">
                      {team.beschreibung}
                    </CardDescription>
                  )}
                </div>
              </button>
            </CollapsibleTrigger>

            {/* Kurzinfo-Badges */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {team.mitglieder.length}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <HardHat className="h-3.5 w-3.5" />
                {team.hwpZuordnungen.length}
              </span>
              {isAdmin && (
                <div className="flex gap-1 ml-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onEdit(team)}
                    title="Team bearbeiten"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => onDelete(team)}
                    title="Team löschen"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 space-y-4">
            {/* Mitglieder */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Mitglieder
              </p>
              {team.mitglieder.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Keine Mitglieder zugeordnet</p>
              ) : (
                <div className="space-y-1.5">
                  {[
                    { label: "KAM", members: kamMembers },
                    { label: "TOM", members: tomMembers },
                    { label: "TL", members: tlMembers },
                  ]
                    .filter((g) => g.members.length > 0)
                    .map((group) => (
                      <div key={group.label} className="flex items-start gap-2">
                        <RolleBadge rolle={group.label.toLowerCase()} />
                        <div className="flex flex-wrap gap-1">
                          {group.members.map((m) => (
                            <span
                              key={m.id}
                              className="text-sm bg-muted/50 px-2 py-0.5 rounded"
                            >
                              {m.userName}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* HWP-Partner */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <HardHat className="h-3.5 w-3.5" /> HWP-Partner
              </p>
              {team.hwpZuordnungen.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Keine HWP-Partner zugeordnet</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {team.hwpZuordnungen.map((h) => (
                    <Badge key={h.id} variant="secondary" className="text-xs font-normal">
                      {h.hwpName}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Erstellt am */}
            <p className="text-xs text-muted-foreground">
              Erstellt am{" "}
              {new Date(team.createdAt).toLocaleDateString("de-DE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            </p>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export default function Teams() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const isAdmin = user?.role === "admin";

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [deleteTeam, setDeleteTeam] = useState<Team | null>(null);

  // Teams laden
  const { data: teamsData, isLoading } = trpc.teams.list.useQuery(undefined, {
    enabled: !!user && ["admin", "kam", "tom", "tl"].includes(user.role),
  });

  // Verfügbare Mitglieder (nur Admin braucht diese)
  const { data: verfuegbareMitglieder = [] } = trpc.teams.listVerfuegbareMitglieder.useQuery(
    undefined,
    { enabled: isAdmin }
  );

  // Alle HWPs aus der Auftragsübersicht (für HWP-Auswahl im Dialog)
  const { data: hwpData } = trpc.users.listAirtableAccounts.useQuery(undefined, {
    enabled: isAdmin,
  });

  const allHwps = useMemo(() => {
    if (!hwpData) return [];
    return hwpData.map((h: { id: string; name: string }) => ({
      hwpAccountId: h.id,
      hwpName: h.name,
    }));
  }, [hwpData]);

  // Team löschen
  const deleteMutation = trpc.teams.delete.useMutation({
    onSuccess: () => {
      utils.teams.list.invalidate();
      toast.success(`Team "${deleteTeam?.name}" wurde entfernt.`);
      setDeleteTeam(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleEdit = (team: Team) => {
    setEditTeam(team);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditTeam(null);
  };

  // Gefilterte Teams
  const filteredTeams = useMemo(() => {
    if (!teamsData) return [];
    const q = search.toLowerCase();
    if (!q) return teamsData as Team[];
    return (teamsData as Team[]).filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.beschreibung?.toLowerCase().includes(q) ||
        t.mitglieder.some((m) => m.userName.toLowerCase().includes(q)) ||
        t.hwpZuordnungen.some((h) => h.hwpName.toLowerCase().includes(q))
    );
  }, [teamsData, search]);

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <UsersRound className="h-6 w-6 text-primary" />
              Teams
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isAdmin
                ? "Verwalte Teams, weise KAM/TOM-Mitglieder und HWP-Partner zu."
                : "Deine Team-Zuordnungen im Überblick."}
            </p>
          </div>
          {isAdmin && (
            <Button
              onClick={() => {
                setEditTeam(null);
                setDialogOpen(true);
              }}
              className="shrink-0"
            >
              <Plus className="h-4 w-4 mr-2" />
              Neues Team
            </Button>
          )}
        </div>

        {/* Suche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Teams, Mitglieder oder HWP suchen…"
            className="pl-9"
          />
        </div>

        {/* Statistik-Zeile */}
        {teamsData && (
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>
              <strong className="text-foreground">{(teamsData as Team[]).length}</strong> Teams gesamt
            </span>
            <span>
              <strong className="text-foreground">
                {new Set((teamsData as Team[]).flatMap((t) => t.mitglieder.map((m) => m.userId))).size}
              </strong>{" "}
              Mitglieder
            </span>
            <span>
              <strong className="text-foreground">
                {new Set((teamsData as Team[]).flatMap((t) => t.hwpZuordnungen.map((h) => h.hwpAccountId))).size}
              </strong>{" "}
              HWP-Partner
            </span>
          </div>
        )}

        {/* Team-Liste */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : filteredTeams.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <UsersRound className="h-12 w-12 mx-auto mb-4 opacity-30" />
            {search ? (
              <p>Keine Teams für „{search}" gefunden.</p>
            ) : isAdmin ? (
              <>
                <p className="font-medium">Noch keine Teams angelegt</p>
                <p className="text-sm mt-1">Klicke auf „Neues Team" um loszulegen.</p>
              </>
            ) : (
              <p>Du bist noch keinem Team zugeordnet.</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTeams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                isAdmin={isAdmin}
                onEdit={handleEdit}
                onDelete={setDeleteTeam}
              />
            ))}
          </div>
        )}
      </div>

      {/* Team-Dialog */}
      {dialogOpen && (
        <TeamDialog
          open={dialogOpen}
          onClose={handleCloseDialog}
          team={editTeam}
          verfuegbareMitglieder={verfuegbareMitglieder}
          allHwps={allHwps}
        />
      )}

      {/* Lösch-Bestätigung */}
      <AlertDialog open={!!deleteTeam} onOpenChange={(o) => !o && setDeleteTeam(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Team löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Das Team <strong>„{deleteTeam?.name}"</strong> wird unwiderruflich gelöscht. Alle
              Mitglieder- und HWP-Zuordnungen dieses Teams werden ebenfalls entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTeam && deleteMutation.mutate({ id: deleteTeam.id })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Wird gelöscht…" : "Löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
