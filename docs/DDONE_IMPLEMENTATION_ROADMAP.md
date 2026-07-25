# DDone Open Design — Implementation Roadmap

## Obiettivo

Trasformare Open Design in una piattaforma Canva-like self-hosted, multiutente, multi-tenant e pronta per Coolify.

## Fase 1 — Fondazione production-ready

- Rimuovere l'incoerenza D1/SQLite dalla documentazione e dal runtime.
- Usare PostgreSQL come database principale.
- Aggiungere migrazioni versionate.
- Usare storage S3/MinIO per upload e asset.
- Aggiungere Dockerfile multi-stage.
- Aggiungere `docker-compose.yml` per sviluppo e Coolify.
- Aggiungere health check e avvio con migrazioni.
- Aggiungere `.env.example`.
- Documentare deployment, aggiornamenti e backup.

## Fase 2 — Utenti e multi-tenancy

- Registrazione, login, logout e recupero password.
- Organizzazioni/workspace.
- Membri e inviti.
- Ruoli `OWNER`, `ADMIN`, `EDITOR`, `VIEWER`.
- Controlli di autorizzazione lato API.
- Separazione completa dei dati per organizzazione.
- Clienti interni a ogni organizzazione.
- Progetti, template, asset e brand kit associati a organizzazione e cliente.

## Fase 3 — Collaborazione realtime

- Yjs per il documento collaborativo.
- WebSocket server.
- Presenza utenti e cursori.
- Selezioni remote.
- Autosave persistente.
- Gestione conflitti e riconnessione.
- Applicazione dei permessi `VIEWER` e `EDITOR` anche al realtime.

## Fase 4 — Libreria Elementi

- Ricerca unificata.
- Forme native.
- Icone tramite provider Iconify filtrato.
- Ornamenti.
- Cornici.
- Cibo.
- Cocktail.
- Sfondi.
- Loghi social.
- Preferiti ed elementi recenti.
- Categorie, tag e metadati licenza.
- Libreria DDone su S3/MinIO.
- Cambio colore degli SVG.

## Fase 5 — Canva-like e brand kit

- Brand kit per cliente.
- Palette, font e loghi.
- Template bloccabili.
- Formati social e stampa.
- Progetti multipagina.
- Esportazione PNG, JPG, SVG e PDF.
- Condivisione e approvazione cliente.

## Strategia Git

Il lavoro parte dal branch `feat/ddone-platform-foundation`. Ogni fase viene divisa in pull request verificabili, mantenendo `main` stabile.
