# HWP Portal Project Documentation

## 1. Document Purpose
This document provides a complete functional and technical overview of the HWP Portal application, including:
- Product features available from the sidebar navigation.
- Role-based visibility and authorization model.
- Backend module responsibilities and API ownership.
- Data-source architecture, synchronization, and caching.
- Airtable base/table inventory.
- Airtable-to-database field mapping and data relationships.

## 2. Project Overview
HWP Portal is a role-based operations platform for Mehrkosten workflows, HWP partner execution, team assignment, weekly planning, and administrative governance.

Primary capabilities:
- Operational dashboard for KPIs and weekly order visibility.
- Airtable-backed order ingestion and filtering.
- Mehrkosten classification and supplement workflows.
- HWP-specific work views and detail access controls.
- Team membership and HWP assignment governance.
- Admin controls for users, permissions, and synchronization behavior.

## 3. User Roles
Defined roles:
- admin
- hwp
- tom
- kam
- tl

Core behavior:
- UI menu visibility is role-filtered in the dashboard layout.
- Backend routes enforce role checks with protected procedures and explicit role guards.
- Admin-only operations use dedicated middleware checks.

## 4. Sidebar Feature Catalog
Source of truth for sidebar options: client/src/components/DashboardLayout.tsx.

| Sidebar Option | Route | Audience | Primary Feature Scope | Main API Modules |
|---|---|---|---|---|
| Dashboard | /dashboard | all authenticated roles | KPI cards, status and HWP distribution, weekly activity, quick search, configurable widgets | dashboard.stats, dashboard.weeklyOrders, dashboard.search, dashboard.getWidgetConfig, dashboard.saveWidgetConfig |
| Auftraege | /auftraege | admin, tom, kam, tl | Search/sort/paginate orders, status and KW filtering, team/HWP filtering, klassi cache reads | mehrkosten.list, mehrkosten.getById, mehrkosten.getKlassifizierung, mehrkosten.getKlassifizierungBatch |
| Meine Auftraege | /hwp/auftraege | hwp | HWP-only order list by KW with linked MK invoices | hwp.meineAuftraege, hwp.verfuegbareKWs |
| Konditionen | /pauschalen | admin, tom, kam | Flat-rate table, search and sort, Airtable-backed pricing data | pauschalen.list |
| MK Klassifizierung | /mk/klassifizierung | admin, tom, kam | Customer selection from TBK/nTBK, pauschalen lookup, invoice creation and update | mkKlassifizierung.listKunden, mkKlassifizierung.getPauschalen, mkKlassifizierung.getRechnung, mkKlassifizierung.saveRechnung, mkKlassifizierung.listRechnungen |
| MK Antraege | /mk/nachtraege | admin, tom, kam, hwp | Nachtrag submission and review flow, status transitions, rechnung inspection | mkKlassifizierung.submitNachtrag, mkKlassifizierung.approveNachtrag, mkKlassifizierung.rejectNachtrag, mkKlassifizierung.listNachtraege, mkKlassifizierung.getRechnung |
| Wochenplanung | /wochenplanung | admin, tom, kam, tl | KW planning by HWP, enriched with classi metadata and links | wochenplanung.getByHwpAndKW |
| Teams | /teams | admin, tom, kam, tl | Team overview, membership visibility, HWP assignment mapping | teams.list, teams.get, teams.create, teams.update, teams.delete, teams.setMitglieder, teams.setHwpZuordnungen |
| Benutzerverwaltung | /admin/users | admin | User lifecycle, activation, roles, account links, assignments | users.list, users.create, users.update, users.delete, users.getById, users.getHwpAssignments, users.setHwpAssignments, users.listAirtableAccounts |
| Berechtigungen | /admin/permissions | admin | Permission matrix maintenance by role | permissions.list, permissions.update |
| Einstellungen | /admin/settings | admin | App settings, cache operations, sync control | settings.getAll, settings.set, settings.setMany, settings.cacheStats, settings.clearCache, settings.forceSync |

## 5. Route Inventory
Defined routes and major aliases:
- /, /login, /register
- /dashboard
- /auftraege, /auftraege/:id
- /mehrkosten and /mehrkosten/:id as redirect aliases to /auftraege
- /pauschalen
- /mk/klassifizierung, /mk/rechner/:orderNumber, /mk/nachtraege
- /hwp/auftraege, /hwp/auftraege/:id
- /teams
- /wochenplanung
- /admin/users, /admin/permissions, /admin/settings

Home redirect behavior:
- Unauthenticated users are redirected to /login.
- Authenticated HWP users are redirected to /hwp/auftraege.
- Other authenticated users are redirected to /dashboard.

## 6. Backend Capability Matrix
Top-level routers:
- system
- dashboard
- mkKlassifizierung
- hwp
- teams
- auth
- users
- permissions
- settings
- mehrkosten
- serviceRessourcen
- pauschalen
- wochenplanung

Authorization model:
- protectedProcedure: requires authenticated user context.
- adminProcedure: requires role admin.
- Additional role guards appear inside procedures where needed.

Examples:
- serviceRessourcen.list denies non-internal roles.
- wochenplanung.getByHwpAndKW enforces role and HWP assignment boundaries for kam, tom, tl.
- hwp.auftragDetail prevents HWP users from accessing unassigned records.

## 7. Data Source Architecture
Primary source systems:
- MySQL database via Drizzle ORM for application state, permissions, users, teams, invoices, and cache tables.
- Airtable as upstream operational data source for orders, pauschalen, service resources, and classi records.

Ingestion model:
- Airtable records are normalized into the auftraege table.
- Full and delta synchronization strategies update local storage.
- API responses prefer local cached DB data and only call Airtable when needed.

## 8. Airtable Base and Table Inventory

### 8.0 Metadata Verification (Exact Airtable Display Names)
To fetch exact Airtable table display names from metadata API, use:

1. Export API key in your shell:
	export AIRTABLE_API_KEY=your_key_here
2. Run script:
	./scripts/airtable-metadata-map.sh

Output format:
- BASE: <base_id>
- table_id\ttable_name

Status:
- Script implemented and ready.
- Verified successfully via metadata script in current workspace session.

### 8.1 Base: HI-ACH-Mehrkostenfreigabe
- Base ID: appjRcTYUcy6lmKx2
- Declared in server/airtable.ts.

| Table ID | Exact Airtable Name (Verified) | Main Usage |
|---|---|---|
| tbl7Ic2j1ozM0sTjF | Mehrkostenfreigabe | Primary order feed for auftraege sync |
| tblvBWCZgCWse4zjE | Craft Appointments | Referenced table constant |
| tblqIIGu6fRrsBHFj | Invoice Amount Differenz (MK und AP) | Referenced table constant |
| tblVuIY4TO1Odxew2 | Service-Ressourcen HI-HWP | serviceRessourcen.list and cache |
| tbl8nmGskjLmc30zn | Mehrkostenrechner Liste | Referenced table constant |
| tbl1Ins5mUccKZ0PU | Mehrkostenrechner Data | Referenced table constant |
| tblAWJS4XKLrv4Pd1 | Aktuelle Pauschalen | pauschalen.list and mk pauschalen lookup |
| tblWbywOhpJxAtgZf | Mehrkostenrechner Liste Calculation | Referenced table constant |
| tblcEoQ6UDR2AJcXo | Material Categories | Referenced table constant |

### 8.2 Base: Klassi
- Base ID: appSZqcdigG1dhdmu
- Declared in server/routers/mehrkosten.router.ts and server/routers.ts.

| Table ID | Exact Airtable Name (Verified) | Main Usage |
|---|---|---|
| tbl877Zz1PpT87y5Z | [HI] ACH TBK Klassifizierung | mkKlassifizierung.listKunden source |
| tblHta2AiEFzPW3LF | [HI] ACH nTBK Klassifizierung 2.0 | mkKlassifizierung.listKunden source |
| tblWaxS2rkZj1Vt5j | [HI] ACH Klassi Overview | mehrkosten.getKlassifizierung and wochenplanung enrichment |
| tblZqfGUWS7bKTCBn | Alle Rechnungen - ACH (Export) | Reporting/export table in Klassi base |
| tblHXVUGzFYRZyGRn | HI_TERMINE | Referenced operational table in Klassi base |
| tblq2GUi3Si8STuWi | HI HWP Pauschalen | HWP pauschalen table in Klassi base |
| tblMGcOZsnpKsuUf5 | KPI: Cost Raw | KPI/analytics table |
| tblxqL8EPdkmJP3li | Cost per Vendor | KPI/analytics table |
| tbls3vBuOQI8AJe06 | KPI: Per Order | KPI/analytics table |
| tblYeaCGvOeUujiIo | Appointments | Appointment-level reporting table |
| tbliYtjjEW5l7BMrm | Vendor: Average Deviation | Vendor KPI table |
| tbl2h24RszuidARub | Leistungsdaten | Performance data table |

## 9. Data Mapping

### 9.1 Airtable Mehrkostenfreigabe -> Database auftraege
Mapping function: recordToRow in server/airtable.ts.

| Airtable Field | Database Column | Notes |
|---|---|---|
| record.id | auftraege.airtableId | Primary key for upsert |
| Opportunity Name | auftraege.opportunityName | Nullable text |
| Appointment Number | auftraege.appointmentNumber | Nullable varchar |
| Order Number | auftraege.orderNumber | Join key to mk_rechnungen |
| Technician: Name | auftraege.technicianName | Nullable text |
| Technician: Account: Account Name | auftraege.technicianAccountName | HWP account display name |
| Technician: Account: Account ID | auftraege.technicianAccountId | Critical filter and assignment key |
| Status | auftraege.status | Operational state |
| Status - Freigabe | auftraege.statusFreigabe | Approval state |
| Mehrkosten | auftraege.mehrkosten | Stored as string text |
| Pauschale | auftraege.pauschale | Stored as string text |
| Created Date | auftraege.createdDate | Stored as string |
| Last Scheduled End | auftraege.lastScheduledEnd | Date-like string |
| Target End | auftraege.targetEnd | Date-like string |
| Zuletzt geaendert | auftraege.zuletzt_geaendert | Used by delta sync |
| record.createdTime | auftraege.airtableCreatedTime | Source create timestamp |
| full fields object | auftraege.fieldsJson | Complete JSON snapshot |

### 9.2 Classification and Kunden Mapping
TBK and NTBK tables are transformed into standardized customer items for the MK classification UI.

Output structure per customer:
- airtableId
- quelle (tbk or ntbk)
- opportunityName
- orderNumber
- caseNumber
- subject
- createdTime

Record-level enrichment:
- Existing mk_rechnungen are joined by orderNumber to expose current invoice status.

### 9.3 Wochenplanung and Klassi Overview Mapping
For each order in planning scope:
- Local order metadata comes from auftraege cache.
- Additional classi data is loaded from Klassi Overview table by Order Number.
- Result is normalized into risk, complexity, UV details, notes, and links.

### 9.4 Runtime Mapping Capability Status
Current implementation status:
- Field mapping is code-defined, not admin-configurable at runtime.
- Table and base IDs are constant-driven in service/router code.
- Runtime settings currently control sync cadence and cache behavior, not field-schema mapping.

## 10. Application Data Model and Key Relationships
Important schema entities:
- users, role_permissions, app_settings
- airtable_cache, auftraege
- mk_rechnungen, mk_positionen, mk_nachtraege
- teams, team_mitglieder, team_hwp_zuordnungen
- user_hwp_assignments

Critical relationship patterns:
- auftraege.orderNumber <-> mk_rechnungen.orderNumber
- users.airtableAccountId <-> auftraege.technicianAccountId
- team_hwp_zuordnungen.hwpAccountId filters operational visibility
- user_hwp_assignments constrain kam, tom, tl scopes

## 11. Caching and Synchronization
Cache storage:
- Table: airtable_cache
- Serialization: JSON payload in mediumtext
- Expiration: configurable TTL from app_settings

Settings keys:
- airtable_sync_interval_minutes
- airtable_last_sync
- app_name
- items_per_page
- enable_notifications
- maintenance_mode

Synchronization modes:
- fullSync: complete paging load from Airtable source into auftraege with upsert.
- deltaSync: incremental load based on Zuletzt geaendert with overlap buffer.
- auto bootstrap: if no previous sync timestamp exists, start fullSync.
- scheduler: periodic sync cycle plus daily 18:00 prefetch deltaSync.
- admin manual trigger: settings.forceSync with full or delta behavior.

## 12. Operational and Security Notes
Operational requirements:
- AIRTABLE_API_KEY must be set for Airtable integrations.
- DATABASE_URL must be set for MySQL access.

Authorization posture:
- UI role filtering is a convenience layer.
- Backend role checks are the enforcement layer.
- Admin-only operations are centrally protected.

## 13. Known Gaps and Enhancement Opportunities
Current gaps:
- No runtime UI for custom field mapping between Airtable and DB schema.
- Source mapping changes require code updates and deployment.

Enhancement candidates:
- Introduce mapping profiles in app_settings as JSON schema.
- Add validation and fallback strategy for mapping mismatches.
- Add mapping diagnostics screen for admin users.

## 14. Source File Index
Primary files used for this documentation:
- client/src/components/DashboardLayout.tsx
- client/src/App.tsx
- client/src/pages/AdminSettings.tsx
- client/src/pages/AdminUsers.tsx
- client/src/pages/AdminPermissions.tsx
- client/src/pages/Teams.tsx
- client/src/pages/Wochenplanung.tsx
- client/src/pages/MkKlassifizierung.tsx
- client/src/pages/MkNachtraege.tsx
- client/src/pages/HwpDashboard.tsx
- server/routers.ts
- server/routers/dashboard.router.ts
- server/routers/hwp.router.ts
- server/routers/mehrkosten.router.ts
- server/routers/teams.router.ts
- server/airtable.ts
- server/cache.ts
- server/_core/index.ts
- server/_core/trpc.ts
- drizzle/schema.ts

## 15. Render Deployment Runbook
Render service model:
- Runtime: Node 25
- Build command: `corepack enable && corepack prepare pnpm@10.4.1 --activate && pnpm install --frozen-lockfile && pnpm predeploy:render && pnpm build && pnpm db:migrate`
- Start command: `pnpm start`
- Health check endpoint: `/api/ready`

Required Render environment variables:
- DATABASE_URL (secret)
- JWT_SECRET (secret)
- AIRTABLE_API_KEY (secret)
- BUILT_IN_FORGE_API_URL (secret)
- BUILT_IN_FORGE_API_KEY (secret)
- AIRTABLE_BASE_ID
- AIRTABLE_USERS_TABLE_ID
- AIRTABLE_TEAMS_TABLE_ID
- USE_AIRTABLE_USERS (true/false)
- USE_AIRTABLE_TEAMS (true/false)

Configured non-secret environment variables:
- NODE_ENV=production
- PORT=3000
- AIRTABLE_BASE_ID=appjRcTYUcy6lmKx2
- AIRTABLE_USERS_TABLE_ID=tblLPxFTDRr0EocHR
- AIRTABLE_TEAMS_TABLE_ID=tbl9bnTlbptVYxC59
- USE_AIRTABLE_USERS=true
- USE_AIRTABLE_TEAMS=true

Release behavior:
- Database migrations are executed during build via `pnpm db:migrate`.
- Preflight validation runs before build via `pnpm predeploy:render` and verifies required env vars, Airtable flags, and database connectivity.
- Preflight validation runs before build via `pnpm predeploy:render` and verifies required env vars, Airtable flags, database connectivity, Airtable table access, and Forge storage API access.
- Build artifact verification runs at the end of `pnpm build` via `scripts/verify-build.mjs`.
- Production static assets are served from `dist/public`.
- Server bundle is started from `dist/index.js` through `pnpm start`.
- Production startup fails fast when required environment variables are missing.

Post-deploy smoke tests:
- Open `/api/health` and verify HTTP 200 with `ok: true` (liveness).
- Open `/api/ready` and verify HTTP 200 with `ok: true` (readiness).
- Verify `checks.databaseReachable` is true on `/api/ready`.
- Verify `checks.airtableReachable` is true on `/api/ready`.
- Verify `checks.forgeReachable` is true on `/api/ready`.
- Validate login flow and protected route access.
- Create a user from Admin UI and confirm it appears in Airtable Users table.
- Verify browser network requests for app assets under `/assets/*` return 200.

Rollback checklist:
- Roll back to the previous successful Render deploy if health check fails.
- Validate secrets are set correctly in Render dashboard.
- Validate `DATABASE_URL` connectivity and migration logs.
- Validate static files exist in build output (`dist/public/index.html`).
