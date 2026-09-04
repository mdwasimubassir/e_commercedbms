# E-Commerce Frontend

A React + Vite frontend for your `e_commercedbms` backend. Plain JavaScript (no TypeScript build step to fight with), React Context for state, and a tiny built-in router — no extra routing library to install.

This talks to the Express/PostgreSQL backend in `backend/`. It does **not** invent any endpoints — every screen is wired to a route that actually exists in your `routes/` and `controllers/` folders.

---

## 1. Folder structure (what lives where)

```
Frontend/
├── index.html                  # HTML shell Vite mounts React into
├── package.json                # dependencies + npm scripts
├── vite.config.js              # dev server + proxy to backend
├── .env.example                # copy to .env.local
└── src/
    ├── main.jsx                 # React entry point
    ├── App.jsx                  # route table + top-level providers
    ├── styles.css                # all styling (plain CSS, no Tailwind)
    │
    ├── context/                  # app-wide state, via React Context
    │   ├── AuthContext.jsx        # who's logged in + login/register/logout
    │   ├── CartContext.jsx        # cart item count for the header badge
    │   └── ToastContext.jsx       # little popup messages ("Added to cart")
    │
    ├── services/                  # all backend API calls live here
    │   ├── api.js                  # shared fetch() wrapper, attaches your JWT
    │   ├── authStorage.js           # reads/writes token+user in localStorage
    │   ├── authService.js
    │   ├── productService.js
    │   ├── cartService.js
    │   ├── orderService.js
    │   ├── sellerService.js
    │   ├── reviewService.js
    │   ├── notificationService.js
    │   └── wishlistStorage.js       # client-only wishlist (see note below)
    │
    ├── hooks/
    │   └── useDebounce.js           # delays the search box so it doesn't refilter every keystroke
    │
    ├── utils/
    │   └── router.js                # tiny "which page am I on" helper (no react-router)
    │
    ├── components/                  # small reusable UI pieces
    │   ├── Header.jsx                # top nav, role-aware links, cart badge
    │   ├── ProtectedRoute.jsx        # blocks a page unless role matches
    │   ├── ProductCard.jsx / ProductImage.jsx / RoleSelector.jsx
    │   ├── Spinner.jsx / EmptyState.jsx / ErrorState.jsx
    │   ├── StatusBadge.jsx / StarRating.jsx
    │
    └── pages/                       # one file per screen
        ├── Products.jsx              # catalogue (home page)
        ├── ProductDetails.jsx        # single product + reviews
        ├── Login.jsx / Register.jsx
        ├── Cart.jsx / Checkout.jsx
        ├── Orders.jsx / OrderDetail.jsx
        ├── Wishlist.jsx
        ├── Notifications.jsx
        └── seller/
            ├── SellerDashboard.jsx
            ├── SellerProducts.jsx
            ├── SellerProductForm.jsx    # used for both "new" and "edit"
            └── SellerOrders.jsx
```

**Rule of thumb for adding your own stuff later:**
- New backend call → add a function to the matching file in `services/`
- New screen → add a file in `pages/`, then register its URL in the `ROUTES` array at the top of `App.jsx`
- New small reusable widget (a button, a card, a badge) → `components/`

---

## 2. Running it locally (step by step)

You need **three things running at once**: PostgreSQL, the backend, and this frontend.

### Step 1 — Start PostgreSQL and create the database
If you already had this working before (since your backend already exists), skip to Step 2. Otherwise:
```bash
# create the database (name must match DB_NAME in your backend .env)
createdb your_database_name

# load the schema
psql -d your_database_name -f database/schema.sql
```

### Step 2 — Start the backend
```bash
cd backend
cp .env.example .env
# open .env and fill in: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, JWT_SECRET
npm install
npm start          # or: node server.js
```
You should see `Server running on http://localhost:3000`. Test it by opening `http://localhost:3000/api/test-db` in your browser — it should say the PostgreSQL connection is successful.

### Step 3 — Start the frontend
Open a **new terminal tab** (leave the backend running in the first one):
```bash
cd Frontend
cp .env.example .env.local
# .env.local just needs: VITE_API_URL=http://localhost:3000
npm install
npm run dev
```
Vite will print a local URL, usually `http://localhost:5173`. Open that in your browser.

> The dev server proxies `/api/*` requests straight to your backend (see `vite.config.js`), so you won't hit CORS issues in development.

### Step 4 — Try it out
1. Go to **Register**, create a **seller** account.
2. Log in as that seller → **Dashboard** → **My Products** → **Add product**. (You need at least one row in the `categories` table first — see the limitation below.)
3. Register a second account as a **customer** (use a different email).
4. Log in as the customer, browse the catalogue, add the product to your cart, check out.
5. Log back in as the seller → **Orders** → advance the order's status (Pending → Processing → Shipped → Delivered). Log back in as the customer to see the status update and the tracker move, and to leave a review once the item is purchased.

### Building for production
```bash
npm run build      # outputs static files into dist/
npm run preview    # serve that build locally to double check it
```

---

## 3. Known limitations (inherited from the backend, not the frontend's fault)

I want to be upfront about a few things I worked around rather than papered over:

1. **No "list categories" endpoint.** Your schema has a `categories` table, but no route reads it directly. The product form derives its category dropdown from whatever categories already exist on products returned by `GET /api/products`. **If you have zero products so far, the dropdown will be empty** — insert at least one row into `categories` manually (`INSERT INTO categories (category_name) VALUES ('Electronics');`) before creating your first product.
2. **No admin role in the database.** Your `schema.sql` only has `customers` and `sellers` — there's no `admins` table and no admin routes. I did not build fake admin screens; see the feature suggestions below if you want to add this.
3. **Checkout tax is a display-only estimate.** `orderController.js` stores `total_amount` as just the item subtotal — it doesn't add tax. The checkout/cart pages show a 15% "estimate" line so the UI looks complete, but the amount actually charged/stored is the subtotal. If you want tax to be real, add it in `orderController.js`'s `createOrder`.
4. **Wishlist is client-only.** There's no `wishlist` table in your schema, so hearted products are saved in the browser's `localStorage`, per account. They won't follow you to a different browser/device, and clearing browser data clears them.
5. **`updateSellerOrderStatus` warns that status is per-order, not per-seller-item.** If two different sellers' products end up in the same order, one seller updating the status affects the whole order. That's a backend design tradeoff, not something the frontend can fix.

---

## 4. Suggested features / next steps

Roughly ordered by effort vs. payoff for a university project:

**Small, high value:**
- **Add a `GET /api/categories` endpoint** (and maybe let sellers propose new categories). Removes limitation #1 above and is a quick backend win.
- **Product image upload** instead of pasting an image URL — even just accepting a file and storing it as base64 or on disk would feel more "real."
- **"Order confirmed" toast/redirect polish** — right now checkout redirects straight to the order detail page, which is good, but you could add a proper thank-you screen.
- **Pagination or infinite scroll on the catalogue** once you have more than ~30 products, since `GET /api/products` currently returns everything at once.

**Medium effort:**
- **Password reset / forgot password flow.**
- **Seller analytics chart** on the dashboard (you already have the order data — a simple bar chart of revenue by day/week with a library like `recharts` would look great in a viva/demo).
- **Admin role**: add an `admins` table, an `is_active`/`is_banned` column on sellers, and endpoints to approve new seller accounts or ban abusive ones. This matches the original "Admin routes" idea from your prompt but needs real backend + schema support first — I didn't fake this in the frontend since there's nothing behind it yet.
- **Real tax/shipping calculation** stored server-side instead of the frontend's display-only estimate.

**Nice-to-have polish:**
- Skeleton loading screens instead of the plain spinner.
- Dark mode toggle (the CSS uses a small set of colors near the top of `styles.css`, so this is mostly swapping those variables).
- Email notifications (in addition to the in-app `notifications` table) when an order status changes — useful talking point for a DBMS course since it'd involve a queue or a scheduled job.

If you tell me which of these you want, I can build it directly into this codebase next.
