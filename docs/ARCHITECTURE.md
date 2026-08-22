# Project Architecture

## Active Runtime

The deployed application uses the root CommonJS Express runtime:

- `server.js` is the Render entry point.
- `config/`, `controllers/`, `middleware/`, and `routes/` are the active backend modules.
- `database/` contains schema, seed, procedure, and migration SQL.
- `frontend/` is the active static HTML, CSS, and JavaScript frontend served by Express.
- `uploads/` and `reports/` remain outside application source because runtime code writes and serves files from these locations.
- `scripts/` contains database and maintenance utilities.

### Frontend Grouping

- `frontend/pages/` groups public, authentication, student, teacher, and admin portal pages.
- `frontend/pages/admin/` separates super-admin, finance-admin, academics-admin, and ICT-admin pages.
- `frontend/styles/` and `frontend/scripts/` use matching shared, auth, student, teacher, admin, finance, academics, and ICT groups.
- `frontend/assets/` contains images, logos, and icons.
- `frontend/index.html` remains at the frontend root because it is the Express root page and Vite entrypoint.

## React/Vite Source

`frontend/src/` and the frontend package files are a separate React/Vite implementation area. The active Express server does not serve the React build, so this area remains inside `frontend/` without replacing the static portal.

## Archived Material

- `archive/generated/` contains generated snapshots, served copies, logs, and verification output.
- `archive/legacy-backend/` contains an unused backend scaffold that uses different database and route contracts. It is retained for reference and is not imported by `server.js`.

## Organization Rule

Keep active runtime paths stable unless all server imports, static paths, browser URLs, deployment settings, and tests are updated together. This preserves the existing API, authentication, database, uploads, email, and portal behavior.
