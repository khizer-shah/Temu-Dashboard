# Temu Product Analysis Dashboard

A high-performance, dark-minimalist dashboard for analyzing Temu product exports. Live
API access is unavailable, so the dashboard runs **entirely client-side** — drop an Excel
file (`.xlsx` / `.xls`) and it hydrates instantly. No data ever leaves the browser.

## Features

- **Upload hydration overlay** — dashed dropzone with drag-&-drop, browse, and a
  one-click sample dataset for exploring without a file.
- **KPI ribbon** — Total Revenue, Sales Units Sold, Profit Margin, and Low Stock Alerts.
- **Analytics grid** — revenue distribution by category, sales-velocity scatter
  (units vs. price, sized by revenue), and a profit-per-item trend across top SKUs.
- **Product data table** — searchable, fully sortable on every column, paginated, with
  one-click **CSV export** of the current (filtered + sorted) view.
- **Resilient Excel parsing** — heuristic column detection maps arbitrary headers
  (`SKU` / `Product ID`, `Selling Price` / `Unit Price`, `Qty Sold`, `Inventory`, …)
  and coerces messy cells like `"$12.99"` and `"42%"`.

## Stack

- **Vite + React + TypeScript**
- **Tailwind CSS** — pitch-black theme, single cyan accent (`#00f5d4`)
- **`xlsx` (SheetJS)** — client-side spreadsheet parsing
- **Recharts** — dark-themed charts
- **lucide-react** — icons

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

```bash
npm run build    # type-check + production build to dist/
npm run preview  # preview the production build
npm run lint     # type-check only (tsc --noEmit)
```

## Expected spreadsheet columns

The parser is forgiving — it matches on header synonyms, so exact names aren't required.
The first sheet is used. Recognized fields (with examples of accepted headers):

| Field        | Example headers                                  |
| ------------ | ------------------------------------------------ |
| SKU          | `SKU`, `Product ID`, `Item ID`                   |
| Name         | `Product Name`, `Title`, `Item`                  |
| Category     | `Category`, `Type`, `Department`                 |
| Price        | `Price`, `Selling Price`, `Unit Price`           |
| Cost         | `Cost`, `Unit Cost`, `COGS`                      |
| Units Sold   | `Units Sold`, `Qty Sold`, `Sales Volume`         |
| Stock        | `Stock`, `Inventory`, `Quantity`, `On Hand`      |
| Revenue\*    | `Revenue`, `Total Sales`, `GMV`                  |
| Rating       | `Rating`, `Stars`, `Review Score`                |

\* If a revenue column is absent, revenue is derived as `price × units sold`.

Derived metrics: `revenue`, `profit = (price − cost) × units`, `margin = profit / revenue`,
and a low-stock flag (stock ≤ 10). Anything the parser can't map is surfaced as a
non-blocking warning banner above the KPIs.
