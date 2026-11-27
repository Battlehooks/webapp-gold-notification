# Repository Guidelines

## Project Structure

- `frontend/` contains the React, TypeScript, and Vite dashboard. Put pages in `src/pages/`, reusable UI in `src/components/`, and bundled assets in `src/assets/`. The browser push service worker lives at `public/sw.js`.
- `services/market-data/` handles price ingestion and rule-based signals. `services/insight/` handles news, LLM narration, and market chat. Both are Python FastAPI services with code under `app/`.
- `services/notification/src/` contains the Express push API and scheduler. `services/agent/app/` contains the owner-only operations agent, which runs separately on the host.
- `scripts/` contains database migration and price history import tools. `deploy/Caddyfile` configures the VPS reverse proxy.

## Local Development and Checks

- Copy `.env.example` to `.env`, then run `docker compose up --build` from the root. Open the dashboard at `http://localhost:5173`. The agent has separate setup instructions in its README.
- In `frontend/`, run `npm ci` followed by `npm run dev` for Vite, `npm run lint` for Oxlint, or `npm run build` for TypeScript checks and a production bundle.
- In `services/notification/`, run `npm ci` followed by `npm run dev` for watch mode or `npm run build` to compile the service.
- In `services/market-data/`, install `requirements.txt` in a virtual environment, then run `python -m unittest discover -s tests -v`. Follow the existing `test_*.py` and `test_*` method naming. Use in-memory data for signal and gold-versus-rupiah regression cases.

## Coding and Configuration

Use four-space indentation and `snake_case` in Python. Follow the surrounding two-space TypeScript style, with `PascalCase` React components and `useSomething` hooks. Keep service-to-service calls on HTTP and database access within each service's own SQLite database or Postgres schema. Keep credentials in the ignored repository-root `.env` file.

## Commits and Pull Requests

Use short, imperative commit subjects, as in "Narrate and alert on the fx group." In PRs, describe the affected service and behavior, report the checks you ran, and link any relevant issue. Include screenshots for visible dashboard changes.
