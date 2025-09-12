# AGENTS.md - Development Guide for Coding Agents

## Build/Test/Lint Commands
- **Dev server**: `npm run dev` (runs on port 8080)
- **Build**: `npm run build` (production) or `npm run build:dev` (development mode)
- **Lint**: `npm run lint`
- **Preview**: `npm run preview`
- **No test runner configured** - add test framework if needed

## Architecture & Structure
- **Framework**: React 18 + TypeScript + Vite
- **UI**: shadcn/ui components with Radix UI primitives, Tailwind CSS
- **Database**: Supabase (PostgreSQL) client in `/src/lib/supabase.ts`
- **State**: React Query (@tanstack/react-query) + React Context
- **Routing**: React Router DOM
- **Key directories**: `/src/components/` (UI), `/src/pages/` (routes), `/src/lib/` (utilities), `/src/contexts/` (state)

## Code Style & Conventions
- **Imports**: Use `@/` alias for src imports (configured in vite.config.ts)
- **Components**: PascalCase files/exports, function components preferred
- **Types**: TypeScript with relaxed settings (noImplicitAny: false, strictNullChecks: false)
- **Styling**: Tailwind classes, shadcn/ui component patterns with `cn()` utility
- **Forms**: React Hook Form + Zod validation
- **Error handling**: Use React Query error boundaries and toast notifications (Sonner)
- **ESLint**: Standard React/TS rules, unused vars warnings disabled 
