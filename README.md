# IT Systems Project

A full-stack TypeScript application with Express backend and React frontend.

## Project Structure

```
├── backend/          # Express server with PostgreSQL
├── frontend/         # React application with Vite
├── shared/          # Shared types and utilities
└── package.json     # Root workspace configuration
```

## Setup

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
npm install
```
This installs dependencies for both backend and frontend using npm workspaces.
Create .env file in the backend folder
```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=12345
DB_MAINTENANCE_DB=postgres
DB_NAME=your_db
AUTO_SEED_RECIPES=true
NODE_ENV=development

```
- Disable auto seed after the first run or if you dont want dummy data

## Development

### Run all dev servers

```bash
npm run dev
```

### Run specific server

```bash
npm run dev:backend   # Run Express server on http://localhost:3000
npm run dev:frontend  # Run Vite dev server on http://localhost:5173
```

### Build

```bash
npm run build         # Build both packages
npm run build:backend # Build backend only
npm run build:frontend # Build frontend only
```

### Type checking

```bash
npm run type-check    # Check types in all packages
```

### Linting

```bash
npm run lint          # Lint all packages
```

## Backend

- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: pg (native driver)
- **Runtime**: Node.js with TypeScript

See [backend/README.md](backend/README.md) for backend-specific setup.

## Frontend

- **Framework**: React 19
- **Build Tool**: Vite
- **Styling**: CSS

See [frontend/README.md](frontend/README.md) for frontend-specific setup.

## Shared Types

The `shared/types` directory contains TypeScript interfaces shared between frontend and backend for type-safe API communication.

## Environment Variables

Create `.env.local` files in each package directory:

### Backend (.env.local)
```
DATABASE_URL=postgresql://user:password@localhost/dbname
NODE_ENV=development
PORT=3000
```

### Frontend (.env.local)
```
VITE_API_URL=http://localhost:3000
```

## XML Cookbook

Open `http://localhost:3000/cookbook.xml` to view the printable cookbook generated from public recipes.
The XML is transformed in the browser using XSLT from `backend/public/cookbook.xsl`, with print styling in `backend/public/cookbook.css`.
Use `http://localhost:3000/cookbook.xml?limit=10` to render a smaller cookbook while testing.

## License

ISC
