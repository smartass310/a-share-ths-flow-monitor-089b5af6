# A-share Market Observer

## Research Workbench

The active frontend is `workbench.js` plus `market-core.js`, with Apache ECharts bundled locally. It adds index and stock candlestick charts, moving averages, volume, a full industry treemap, flow/price scatter, trading-day sector rotation, valuation filters, four-item comparisons, research notes, local observation-price thresholds, JSON watchlist backups, a headline/announcement feed, and a printable daily review.

Supplementary datasets are produced by `node scripts/research-data.mjs`. Tencent quote fields retain provider valuation definitions; they are not relabeled as TTM or used when their date differs from the selected flow snapshot. Index history is unadjusted, while on-demand stock history is forward-adjusted. Beijing index history may have only a current observation and is not substituted with another index.

Five- and twenty-day sums require every relevant trading day. The consecutive-inflow count is a confirmed lower bound and stops at missing data. News/announcement feeds have independent collection timestamps and show only titles with source links. Reports do not infer causation from news titles. Alerts are device-local checks against the selected snapshot, not real-time notifications.

`node scripts/check_workbench.mjs` checks source parsing, trading-day windows, stale-date handling, screen logic and server-rendered ECharts configurations. It is not a browser screenshot test.

The existing static GitHub Pages architecture is retained. No account or API key is needed to browse the site.

## Views

- Market overview: six major indices, sample breadth and turnover, industry inflow/outflow leaders, concept heatmap and archived net-flow history.
- Industry, concept and stock explorers: search, filters, sorting, pagination, CSV export and detail dialog.
- Watchlist: saved in this browser only.
- Daily review: factual summary plus explicitly bounded rule-based observations.
- Information and data: public-source links and a coverage table distinguishing integrated data from external sources.

## Data

`node scripts/refresh_market.mjs` refreshes Tencent index quotes and sequentially collects THS fund-flow pages after the close. The Shanghai index date must match the current date before a new fund snapshot is accepted. THS rows do not provide independent dates, so the site discloses this date inference. This check cannot prove that every THS record is current.

Null numeric fields remain null. Explicit money units take precedence over column defaults. Identical duplicate rows are collapsed; conflicting duplicates, missing pages or materially reduced coverage fail the update. The last successful snapshot and timestamp survive failed updates.

Successful snapshots are stored under `data/history/YYYY-MM-DD.json`. The archive index contains sample amount and net-flow aggregates. Historical coverage begins only with available snapshots; nothing is interpolated back to the requested 2024-09-24 start. Recovered snapshots retain the dates recorded by the old collector.

Industry/concept flow rate uses inflow plus outflow; stock flow rate uses turnover amount. These denominators differ. Concept flows must not be summed across overlapping themes. Sample breadth is not official exchange-wide breadth, and this site does not infer limit-up/down counts from a fixed percentage threshold.

## Operations

- `node scripts/check_site.mjs`: parser, data-integrity and view-logic checks; not a browser visual test.
- `node scripts/preview.mjs`: local HTTP preview on port 4173; set PORT to choose another port.
- `node scripts/recover_history.mjs`: recover available original repository snapshots.
- `node scripts/publish_github.mjs`: publish only an allowlist of site files to the original repository using an existing GitHub CLI login. The personal access token is never saved in the project or printed.

GitHub Actions attempts updates at 16:35 Asia/Shanghai on weekdays. Scheduling delays and public-source outages remain possible. Non-trading days retain the previous snapshot. The workflow persists error status even when collection fails.
