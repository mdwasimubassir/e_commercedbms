# E-Commerce DBMS — roles and seller approval

The application has three roles:

- **Customer**: shops, manages carts, orders, reviews, and customer notifications.
- **Seller**: registers publicly but starts with `approval_status = pending`. Only an approved seller can use `/api/seller/*` or seller screens.
- **Admin**: is created only by the controlled seed command; public registration never accepts this role.

## Seller approval flow

Seller registers → account is `pending` → admin signs in and opens `/admin` → admin approves or rejects → the decision and a seller notification are written in one database transaction. The notification is persistent and appears in the existing Notifications screen; no separate seller approval page or realtime system is used.

## Database setup

Start the PostgreSQL service and create the database named by `DB_NAME` in `backend/.env`. For a new database, load the base schema from the repository root:

```powershell
psql -d your_database_name -f database/schema.sql
```

Replace `your_database_name` with the value of `DB_NAME`.

Set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `JWT_SECRET` in `backend/.env` (see `backend/.env.example`). From `backend`, apply every migration not already recorded in `schema_migrations`:

```powershell
npm install
npm run migrate
```

This applies the later compatibility changes needed by current APIs, including product status, suspension fields, and cross-role email uniqueness. Existing user and product records are preserved.

## Create the first admin

Set `ADMIN_EMAIL`, `ADMIN_PASSWORD` (8–72 bytes), and optionally `ADMIN_NAME` in `backend/.env`. Do not commit this file. Then run:

```powershell
cd backend
npm run seed:admin
npm run seed:delivery-demo
```

The seed hashes the password with bcrypt and does nothing if the email is already an admin.

## Admin API

All endpoints require an authenticated JWT whose role is `admin`:

- `GET /api/admin/sellers/pending`
- `GET /api/admin/sellers`
- `PATCH /api/admin/sellers/:sellerId/approve`
- `PATCH /api/admin/sellers/:sellerId/reject`

## Run locally

```powershell
cd "C:\path\to\e_commercedbms\backend"
node server.js

# in another terminal
cd "C:\path\to\e_commercedbms\Frontend"
npm install
npm run dev
```

Open the Vite URL shown in the frontend terminal (normally `http://localhost:5173`). The frontend's `VITE_API_URL=http://localhost:3000` setting uses the Vite `/api` proxy during local development.
Manual flow: register a seller, sign in as the seeded admin, approve/reject in `/admin`, then log in as that seller and open Notifications. Approved sellers can access seller screens; pending/rejected sellers receive a backend `403` for every `/api/seller/*` request.
<<<<<<< Updated upstream
//last//
=======
//last
>>>>>>> Stashed changes
