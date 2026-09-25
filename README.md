# E-Commerce DBMS — roles and seller approval

The application has three roles:

- **Customer**: shops, manages carts, orders, reviews, and customer notifications.
- **Seller**: registers publicly but starts with `approval_status = pending`. Only an approved seller can use `/api/seller/*` or seller screens.
- **Admin**: is created only by the controlled seed command; public registration never accepts this role.

## Seller approval flow

Seller registers → account is `pending` → admin signs in and opens `/admin` → admin approves or rejects → the decision and a seller notification are written in one database transaction. The notification is persistent and appears in the existing Notifications screen; no separate seller approval page or realtime system is used.

## Database setup

For a new database, load `database/schema.sql`.

For an existing development database, run the compatibility migration once (existing sellers are kept and treated as approved):

```powershell
psql -d your_database_name -f database/migrations/001_admin_and_seller_approval.sql
psql -d your_database_name -f database/migrations/002_order_delivery_location.sql
psql -d your_database_name -f database/migrations/003_deliveryman_system.sql
psql -d your_database_name -f database/migrations/004_delivery_requests.sql
```

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

## Run and check

```powershell
cd backend
npm install
node server.js

# in another terminal
cd Frontend
npm install
npm run build
```
OR/

Terminal 1 — Backend
cd "C:\2-1 code\e_commercedbms_RECOVERED\backend"
npm install
node server.js

Terminal 2 — Frontend
cd "C:\2-1 code\e_commercedbms_RECOVERED\Frontend"
npm install
npm run dev
Manual flow: register a seller, sign in as the seeded admin, approve/reject in `/admin`, then log in as that seller and open Notifications. Approved sellers can access seller screens; pending/rejected sellers receive a backend `403` for every `/api/seller/*` request.
//last//