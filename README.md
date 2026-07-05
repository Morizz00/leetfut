# LeetFut    

 leetfut-eta.vercel.app


**your LeetCode, rated out of 99** ⚽

Turn any LeetCode profile into a FIFA-style player card — scored live from real
contest ratings, solve counts, topic breadth, and site ranking. No surveys, no
self-reporting. Just the submissions.

## How the scouting works

Real signals pulled from LeetCode's own API, each mapped to a football stat:

| | Stat | Scouted from |
|:--:|:--|:--|
| **PAC** | Pace | Problems solved in the last year |
| **SHO** | Shooting | Hard + Medium problems solved |
| **PAS** | Passing | Contest rating, contests attended, reputation |
| **DRI** | Dribbling | Topic breadth (weighted toward Hard-tier topics), language diversity |
| **DEF** | Defending | Acceptance rate, contest rating |
| **PHY** | Physical | Total problems solved, submission volume, active days, overall site rank |

Raw stats cap at **88** — the 90s are a legacy gate, earned through proven
volume, sustained contest history, and elite site/contest ranking, so no
single stat can buy the top tier alone. Position and archetype are read from
the resulting stat shape.

Every card walks out in a tier: **Bronze → Silver → Gold → Red → Chrome →
Icon**, with an **In-Form** overlay for a detected recent solving spike.

## Architecture

Two independent services, deliberately separated:

- **`backend/`** — Rust (Axum). Owns everything stateful: fetching from
  LeetCode's unofficial GraphQL endpoint, the scoring engine, and Redis
  caching. Exposes one endpoint, `GET /card/:username`.
- **`web/`** — Next.js. Pure UI. Calls the backend (via a same-origin API
  proxy route) and renders the card, scout report, and share flow. No
  business logic of its own.

## Credit

LeetFut's UI — the FUT-card look, the scout report layout, the reveal
animation, the whole visual language — is directly inspired by
**[GitFut](https://github.com/Younesfdj/gitfut)**, which does the same thing
for GitHub profiles. LeetFut ported and reskinned that UI for LeetCode; all
credit for the original design goes to the GitFut team.

## Running locally

### Backend

```bash
cd backend
cargo run              # defaults to PORT=8080
```

Env vars:
- `PORT` — defaults to `8080`
- `REDIS_URL` — optional; without it, the card cache is a no-op (every scout
  hits LeetCode live, still fully functional for local dev)

### Frontend

```bash
cd web
npm install
LEETFUT_API_URL=http://127.0.0.1:8080 npm run dev
```

Env vars:
- `LEETFUT_API_URL` — base URL of the running backend (defaults to
  `http://localhost:8080`)

### Docker (backend)

```bash
cd backend
docker build -t leetfut-backend .
docker run -p 8080:8080 -e REDIS_URL=redis://your-redis-host:6379 leetfut-backend
```

## Deployment

- **Backend** — Railway. `backend/railway.toml` + `backend/Dockerfile` are
  ready to go; set the service's root directory to `backend/` in the Railway
  dashboard and it picks up the Dockerfile automatically.
- **Frontend** — Vercel. Point it at `web/` as the project root, and set
  `LEETFUT_API_URL` to the deployed Railway backend's public URL.

## Tech stack

Rust · Axum · Next.js · TypeScript · Tailwind · Redis

## License

MIT
