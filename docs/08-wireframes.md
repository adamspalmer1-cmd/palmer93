# 8. UI Wireframes

Visual language: **Bloomberg Terminal meets Linear** — dense, data-forward,
dark-mode-first, monospace numerals for prices/volume, generous use of
subtle borders/dividers instead of heavy shadows, fast keyboard-friendly
search, and a restrained accent color (signal green/red only for price
direction, a single brand accent elsewhere).

## Landing page (`/`)

```
┌────────────────────────────────────────────────────────────────┐
│ MarketSignal                              Sign in   [Get Started]│
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│        Find mispriced markets before the crowd does.            │
│   AI-powered research on every Polymarket prediction market.     │
│                                                                  │
│              [ Explore Markets ]   [ See how it works ]         │
│                                                                  │
│   ┌────────────┐ ┌────────────┐ ┌────────────┐                  │
│   │ Live market │ │ AI signal  │ │ Historical  │  <- feature     │
│   │ data feed   │ │ reasoning  │ │ price charts│     cards       │
│   └────────────┘ └────────────┘ └────────────┘                  │
│                                                                  │
│   ── Trending markets right now ──────────────────────────      │
│   [ MarketCard ] [ MarketCard ] [ MarketCard ] [ MarketCard ]    │
│                                                                  │
├────────────────────────────────────────────────────────────────┤
│ Footer: Product · Docs · Disclaimer (not financial advice) ·©    │
└────────────────────────────────────────────────────────────────┘
```

## Dashboard shell (all `(dashboard)` routes)

```
┌───────────┬──────────────────────────────────────────────────────┐
│ MS        │  [ Search markets...  ⌘K ]           🔔   [Avatar ▾]  │
│           ├──────────────────────────────────────────────────────┤
│ Dashboard │                                                       │
│ Markets   │   <page content>                                     │
│ Politics  │                                                       │
│ Crypto    │                                                       │
│ Sports    │                                                       │
│ Economy   │                                                       │
│ Watchlist │                                                       │
│           │                                                       │
│ ──────    │                                                       │
│ Settings  │                                                       │
└───────────┴──────────────────────────────────────────────────────┘
  ^ collapsible sidebar (icon-only on mobile / bottom nav on small screens)
```

## Market list (`/markets`, `/categories/[tag]`)

```
┌──────────────────────────────────────────────────────────────────┐
│  Active Markets                                    1,204 markets  │
│  [ Search... ]  [Category ▾] [Sort: Volume 24h ▾] [Status: Active▾]│
├──────────────────────────────────────────────────────────────────┤
│  ▣ Will X happen by 2027?          Politics   62%▲  $2.1M  ⏱ 45d  │
│  ▣ Will Y exceed $Z?               Crypto     18%▼  $840K  ⏱ 12d  │
│  ▣ Team A wins championship        Sports     71%▲  $5.4M  ⏱ 3d   │
│  ...                                                    [load more]│
└──────────────────────────────────────────────────────────────────┘
```
Each row: outcome probability (color-coded), 24h change arrow, volume,
liquidity, time-to-resolution — the "Bloomberg ticker row" pattern. Grid
view (card-based) as a toggle for a more visual browse mode.

## Market detail (`/markets/[slug]`)

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Back      Politics › 2028 Election                               │
│                                                                    │
│ Will Candidate X win the 2028 election?                            │
│ 62% chance                    ▲ +3.2% (24h)      Vol $2.1M  Liq $410K│
│                                                                    │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │                                                              │   │
│ │             [ Historical price chart, 1D/1W/1M/ALL ]         │   │
│ │                                                              │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│ ┌───────────────────────┐  ┌─────────────────────────────────┐   │
│ │ Market details          │  │  AI Signal  [Run analysis]      │   │
│ │ Resolution date: ...    │  │  "Price appears rich relative    │   │
│ │ Outcomes: Yes / No      │  │   to recent polling momentum..." │   │
│ │ Rules: ...              │  │  Confidence: 0.62   Not advice.  │   │
│ └───────────────────────┘  └─────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

## Category page (`/categories/[tag]`)

Same list layout as `/markets`, pre-filtered by tag, with a header banner
showing category name + aggregate stats (open interest, market count).

## Responsive behavior

- ≥1024px: persistent left sidebar, two-column market detail layout.
- 640–1023px: collapsible sidebar (hamburger), single-column detail layout,
  AI panel moves below chart.
- <640px: bottom tab bar (Dashboard / Markets / Categories / Search),
  market rows collapse to stacked cards.
