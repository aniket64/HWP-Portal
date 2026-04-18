# HWP Portal
## Professional Project Document

Version: 1.0  
Date: 2026-03-28  
Audience: Business and Technical Stakeholders

## Executive Summary
HWP Portal is a role-driven operations system for managing order visibility, Mehrkosten workflows, HWP partner collaboration, team governance, and administrative controls. The platform combines a React frontend, tRPC backend services, MySQL persistence, and Airtable source integrations.

The application is designed to support different operational personas:
- Administrative users who manage platform governance.
- Internal delivery roles (TOM, KAM, TL) who execute planning and approval flows.
- External HWP users who access only their own work scope.

A key architectural principle is source decoupling through local cache and database normalization. Airtable remains the upstream source, while the product operates primarily on synchronized local data for performance and control.

## Product Scope and Business Value
The platform delivers four major value streams:
- Operational transparency through KPI and weekly activity views.
- Controlled Mehrkosten and Nachtrag lifecycle management.
- Structured collaboration through teams and assignment logic.
- Administrative governance for users, permissions, settings, and synchronization.

## Role Model
The system supports five roles:
- admin
- tom
- kam
- tl
- hwp

Role behavior follows a two-layer security model:
- Frontend layer: menu visibility and UX-level guidance.
- Backend layer: hard enforcement through authenticated procedures and role checks.

## Sidebar Feature Narrative
The sidebar is the primary navigation structure and is role-filtered.

### Dashboard
Available to all authenticated users. Provides core KPIs, status distribution, top HWP metrics, weekly records, search, and widget configuration.

### Auftraege
Available to admin, tom, kam, tl. Provides centralized order discovery with search, pagination, status filtering, team filtering, and KW/year filtering.

### Meine Auftraege
Available to hwp. Provides personal order visibility by week, with linked Mehrkosten invoice context when available.

### Konditionen
Available to admin, tom, kam. Provides pricing and pauschalen visibility, including searchable and sortable views.

### MK Klassifizierung
Available to admin, tom, kam. Supports customer intake from TBK and nTBK sources, pauschalen lookup, and structured invoice authoring.

### MK Antraege
Available to admin, tom, kam, hwp. Supports supplement submission, review, and status transitions across the Nachtrag flow.

### Wochenplanung
Available to admin, tom, kam, tl. Provides week-based execution planning by HWP with classi context and operational links.

### Teams
Available to admin, tom, kam, tl. Supports team-level visibility and assignment governance. Full CRUD is limited to admin.

### Benutzerverwaltung
Admin only. Supports full user lifecycle operations, role assignment, activation management, and Airtable account linkage.

### Berechtigungen
Admin only. Supports role permission matrix administration.

### Einstellungen
Admin only. Supports settings governance, cache insights, cache clearing, and manual synchronization controls.

## API Ownership by Business Capability
Business capabilities map to backend modules as follows:
- Dashboard analytics and widget state: dashboard router.
- MK classification, invoice and supplement lifecycle: mkKlassifizierung router.
- HWP scoped order retrieval: hwp router.
- Team structures and assignment lifecycle: teams router.
- Administrative governance: users, permissions, settings routers.
- Order listing and classi enrichment: mehrkosten router.
- Pauschalen and service resources: pauschalen and serviceRessourcen routers.
- Weekly planning orchestration: wochenplanung router.

## Data Architecture
The platform uses a hybrid source model.

### Source-of-Record Systems
- Airtable for upstream operational datasets.
- MySQL for normalized application state and performance-oriented cache access.

### Processing Model
- Airtable records are transformed and persisted into local tables.
- Core UI workflows query local DB/cache first.
- Selective fallback calls to Airtable are used when required.

## Airtable Landscape
Two Airtable bases are integrated.

### Metadata Verification for Exact Table Display Names
The repository now includes a helper script that resolves exact table names directly from Airtable metadata API.

Execution steps:
1. Export credentials in terminal: export AIRTABLE_API_KEY=your_key_here
2. Run: ./scripts/airtable-metadata-map.sh

Expected output:
- Base ID section headers
- table_id and table_name pairs for each base

Note:
- Live verification was completed successfully using metadata API in this workspace session.

### Base 1: HI-ACH-Mehrkostenfreigabe
Base ID: appjRcTYUcy6lmKx2

Principal tables:
- tbl7Ic2j1ozM0sTjF (Mehrkostenfreigabe order feed)
- tblVuIY4TO1Odxew2 (Service Ressourcen)
- tblAWJS4XKLrv4Pd1 (Aktuelle Pauschalen)

Additional referenced table constants:
- tblvBWCZgCWse4zjE (Craft Appointments)
- tblqIIGu6fRrsBHFj (Invoice Amount Differenz (MK und AP))
- tbl8nmGskjLmc30zn (Mehrkostenrechner Liste)
- tbl1Ins5mUccKZ0PU (Mehrkostenrechner Data)
- tblWbywOhpJxAtgZf (Mehrkostenrechner Liste Calculation)
- tblcEoQ6UDR2AJcXo (Material Categories)

### Base 2: Klassi
Base ID: appSZqcdigG1dhdmu

Principal tables:
- tbl877Zz1PpT87y5Z ([HI] ACH TBK Klassifizierung)
- tblHta2AiEFzPW3LF ([HI] ACH nTBK Klassifizierung 2.0)
- tblWaxS2rkZj1Vt5j ([HI] ACH Klassi Overview)
- tblZqfGUWS7bKTCBn (Alle Rechnungen - ACH (Export))
- tblHXVUGzFYRZyGRn (HI_TERMINE)
- tblq2GUi3Si8STuWi (HI HWP Pauschalen)
- tblMGcOZsnpKsuUf5 (KPI: Cost Raw)
- tblxqL8EPdkmJP3li (Cost per Vendor)
- tbls3vBuOQI8AJe06 (KPI: Per Order)
- tblYeaCGvOeUujiIo (Appointments)
- tbliYtjjEW5l7BMrm (Vendor: Average Deviation)
- tbl2h24RszuidARub (Leistungsdaten)

## Data Mapping Overview
The most critical mapping is from Airtable Mehrkostenfreigabe records into the local auftraege table.

Mapped examples:
- Opportunity Name -> opportunityName
- Appointment Number -> appointmentNumber
- Order Number -> orderNumber
- Technician Account ID -> technicianAccountId
- Status -> status
- Status Freigabe -> statusFreigabe
- Target End and Last Scheduled End -> schedule fields
- Full source object -> fieldsJson

Business impact of mapping:
- Enables fast local query performance.
- Supports role and assignment filters without upstream latency.
- Provides stable join keys for invoice and planning workflows.

## Synchronization and Cache Operations
Synchronization strategy includes:
- Full synchronization for baseline data hydration.
- Delta synchronization using change timestamp logic.
- Timed automatic sync cycles based on configurable interval.
- Daily evening prefetch to support next-day planning readiness.
- Admin-driven manual sync trigger.

Cache strategy includes:
- DB-backed key/value cache table with expiration.
- TTL controlled by settings.
- Stats and resource cache entries for high-use datasets.

## Settings and Governance
Governed settings include:
- airtable_sync_interval_minutes
- airtable_last_sync
- app_name
- items_per_page
- enable_notifications
- maintenance_mode

These settings are persisted in app_settings and controlled through admin APIs/UI.

## Security and Access Control
Security controls include:
- Cookie/JWT authenticated sessions.
- Procedure-level protected route enforcement.
- Admin middleware for sensitive actions.
- Additional in-procedure role and assignment checks for operational isolation.

## Current Limitation: Runtime Source Mapping
Current architecture provides strong synchronization controls but does not yet provide runtime-configurable field mapping from Airtable to local schema.

Practical meaning:
- Field mapping is code-defined.
- Table/base definitions are constant-driven.
- Mapping changes require implementation and deployment.

## Recommended Next Phase
A strong next phase would introduce configurable mapping profiles in settings, plus validation and diagnostics.

Expected outcomes:
- Faster adaptation to Airtable schema drift.
- Lower engineering dependency for non-breaking mapping changes.
- Improved operability for administrators.

## Appendix: Canonical Source Files
- client/src/components/DashboardLayout.tsx
- client/src/App.tsx
- server/routers.ts
- server/routers/dashboard.router.ts
- server/routers/hwp.router.ts
- server/routers/mehrkosten.router.ts
- server/routers/teams.router.ts
- server/airtable.ts
- server/cache.ts
- server/_core/index.ts
- drizzle/schema.ts
