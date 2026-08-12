# DockDo

Selbstgehostete Todo-/Projektverwaltung mit eigenem Admin-Portal. DockDo besteht aus zwei
Servern (Benutzer-App und Admin-Backend), die sich eine gemeinsame Datenbank (SQLite oder
MariaDB) teilen, einem React-Frontend mit Live-Synchronisation über WebSockets und einem
modularen Theme-System.

## Funktionen

- **Listen & Aufgaben**: Listen mit Farben/Icons, Aufgaben mit Priorität, Fälligkeitsdatum,
  Wiederholung, Teilaufgaben, Kommentaren, Suche (mit schneller Index-Suche über
  Sync-Events), Drag-and-Drop-Sortierung
- **Echtzeit**: WebSocket-Hub mit Room-Subscription, Präsenz, Broadcasts und
  Offline-Sync-Events (per Polling-Schutz für Last-Minute-Änderungen)
- **Benutzer & Sicherheit**: Registrierung per Einladung, Passwortregeln (argon2), TOTP-2FA,
  Login-Lockout, Sessions-Verwaltung, CSRF-Schutz, Helmet, Rate-Limit
- **Themes**: mehrere Themes, live umschaltbar (CSS-Variablen), Editor im Admin-Portal mit
  Vorschau, Export/Import/Duplikat
- **Admin-Portal** (`/admin`): Dashboard (Benutzer, Listen, Aufgaben, Sessions, Heartbeat),
  Benutzer- & Einladungsverwaltung, Listen-Moderation, Themes, Backups (lokal / S3 / SMB)
  mit Cron-Jobs und Retention, Audit-Log und Fehlerprotokoll, Auth-Konfiguration
  (Lokal / OIDC mit Keycloak oder Authentik, Rollemmapping), SMTP-Einstellungen
- **Benachrichtigungen**: Fälligkeits-Erinnerungen (Web-Push, optional E-Mail), E-Mail-Transport
  über SMTP

## Architektur

```
├── shared/    TypeScript-Bibliothek: DB (drizzle), Schema, Migrationen, Auth, Settings
├── app/       Fastify-Server (Port 3000) + React-Web-App (Vite) + WebSocket-Hub
└── admin/     Fastify-Server (Port 3001) + React-Admin (Vite) + Backup/Jobs/Audit
```

`app` und `admin` lesen dieselben Umgebungsvariablen und teilen sich das Datenverzeichnis
(`DATA_DIR`) inklusive der SQLite-Datei bzw. der MariaDB-Verbindung. Migrationen laufen beim
Start automatisch.

## Voraussetzungen

- Node.js ≥ 22 (getestet mit v25, benötigt für `better-sqlite3` ≥ 13)
- npm ≥ 10 (Workspaces)
- Für MariaDB: MariaDB-Server (empfohlen: `docker compose up -d`, Service läuft immer mit)
- Für SMB-Backups: `smbclient` im System

## Installation & Start

### Docker (empfohlen)

```bash
cp .env.example .env   # COOKIE_SECRET setzen (openssl rand -hex 32)
docker compose up -d --build
```

Danach **App** unter `https://<host>:3000` und **Admin** unter `https://<host>:3001` öffnen.
Bei `DB_MODE=sqlite` (Standard) kann der MariaDB-Service weggelassen werden, wenn er nicht
benötigt wird — er schadet aber nicht, wenn er mitläuft.

### Lokal (npm)

```bash
npm install
```

Konfiguration: `.env` in `app/` **und** `admin/` anlegen (Vorlagen: `app/.env.example`,
`admin/.env.example`). Beide müssen identische Werte enthalten — insbesondere `DATA_DIR`
(setzt du ihn nicht, wird standardmäßig `<Projektordner>/data` verwendet).

Entwicklung:

```bash
npm run dev:server -w @dockdo/app   # API auf :3000
npm run dev:web -w @dockdo/app      # Vite-Dev-Server der App
npm run dev:server -w @dockdo/admin # Admin-API auf :3001
npm run dev:web -w @dockdo/admin    # Vite-Dev-Server des Admin
```

Produktion:

```bash
npm run build -w @dockdo/shared
npm run build:server, build:web -w @dockdo/app      # bzw. einzeln
npm run build:server, build:web -w @dockdo/admin
npm start -w @dockdo/app
npm start -w @dockdo/admin
```

Danach **App** unter `https://localhost:3000` und **Admin** unter `https://localhost:3001`
öffnen. Beim ersten Start erscheint der Setup-Assistent (Admin-Konto anlegen; optional
SQLite/MariaDB wählen). Das Admin-Portal nutzt dasselbe Admin-Konto erfolgreicher
Anmeldungen am App-Server.

## Umgebungsvariablen

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `APP_PORT` / `ADMIN_PORT` | `3000` / `3001` | Ports beider Server |
| `HOST` | `0.0.0.0` | Bind-Adresse |
| `DATA_DIR` | `<projekt>/data` | Gemeinsames Datenverzeichnis |
| `DB_MODE` | `sqlite` | `sqlite` oder `mariadb` (nach Setup in `db-mode.json` eingefroren) |
| `MARIADB_*` | – | Host, Port, Datenbank, User, Passwort |
| `COOKIE_SECRET` | dev-Default | **Unbedingt ändern!** Signierung von Sitzungs-/CSRF-Cookies |
| `SESSION_TTL_DAYS` | `30` | Sitzungsdauer |
| `PUBLIC_APP_URL` / `PUBLIC_ADMIN_URL` | `https://localhost:3000` / `:3001` | Öffentlich erreichbare URLs (Cookies, OIDC-Redirects, Push) |

## HTTPS & Zertifikate

- Beide Server laufen **ausschließlich über HTTPS**. Beim ersten Start wird automatisch ein
  **selbstsigniertes Zertifikat** erzeugt und unter `DATA_DIR/certs/` (`key.pem`, `cert.pem`)
  abgelegt — danach wird es wiederverwendet. Das funktioniert bei jeder Installation
  (Docker und npm) ohne zusätzliche Schritte.
- Der Browser zeigt beim Selbstsigniert-Zertifikat eine Warnung — das ist normal und wird
  einmalig bestätigt. Für eine saubere Lösung können eigene Zertifikate (z. B. Let's
  Encrypt) einfach unter `DATA_DIR/certs/` als `key.pem`/`cert.pem` abgelegt werden.

## Backup & Wiederherstellung

- Backups werden im Admin-Portal definiert (Ziele: lokaler Ordner, S3-kompatibler Speicher,
  SMB-Freigabe) und können per Cron-Job (5-Felder-Expression) automatisiert werden.
- SQLite-Backups sind konsistente Online-Kopien (`VACUUM-INTO`-Verfahren).
- **Wiederherstellung**: bitte vorher **beide** Server stoppen – die Datenbank-Dateien müssen
  geschlossen sein, sonst wird der Restore mit einer klaren Fehlermeldung abgebrochen. Mit
  `RESTORE` als Bestätigung wird der aktuelle Stand gesichert (`pre-restore-*.db`) und die
  Datenbank ersetzt.

## Sicherheits-Hinweise

- Hinter einem Reverse-Proxy `trustProxy` aktiviert lassen und `PUBLIC_*_URL` korrekt setzen.
- OIDC in „auth-configuration": Keycloak-Client oder Authentik-Provider (OpenID-Connect),
  Rollen-Mapping `owner` → `admin`, `member` → `user`, optional `moderator`.
- Push-Benachrichtigungen benötigen zuvor generierte VAPID-Schlüssel (Admin-Portal,
  Auth-Konfiguration).

## Skripte

| Befehl | Zweck |
| --- | --- |
| `npm run typecheck -w @dockdo/app` | TypeScript-Prüfung App-Server |
| `npm run build:* -w …` | Server- bzw. Web-Build |
| `npm start -w …` | Produktionsstart |
| `npm run dev:* -w …` | Entwicklung |