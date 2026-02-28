# cueq — Standard Commands
# ==========================
# Run `make help` for a list of all targets.
# See AGENTS.md §3 for command documentation.

.DEFAULT_GOAL := help
SHELL := /bin/bash

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

.PHONY: setup
setup: ## Install dependencies, start Docker, generate Prisma client
	@echo "📦 Installing dependencies..."
	pnpm install
	@echo "🐳 Starting Docker services..."
	docker-compose up -d
	@echo "⏳ Waiting for PostgreSQL..."
	@sleep 3
	@echo "🔧 Generating Prisma client..."
	pnpm db:generate
	@echo "🗄️  Pushing schema to database..."
	pnpm db:push
	@echo "✅ Setup complete. Run 'make dev' to start development."

# ---------------------------------------------------------------------------
# Development
# ---------------------------------------------------------------------------

.PHONY: dev
dev: ## Start development servers (API + Web) with hot reload
	pnpm dev

# ---------------------------------------------------------------------------
# Quality Checks
# ---------------------------------------------------------------------------

.PHONY: check
check: lint typecheck test ## Full validation: lint + typecheck + tests

.PHONY: lint
lint: ## Run linters in check mode (no auto-fix)
	pnpm lint

.PHONY: lint-fix
lint-fix: ## Auto-fix lint + formatting issues
	pnpm lint:fix
	pnpm format:fix

.PHONY: typecheck
typecheck: ## TypeScript type checking (no emit)
	pnpm typecheck

.PHONY: format
format: ## Check code formatting
	pnpm format

.PHONY: format-fix
format-fix: ## Auto-fix formatting
	pnpm format:fix

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

.PHONY: test
test: ## Run all tests
	pnpm test

.PHONY: test-unit
test-unit: ## Run unit tests only (fast, <10s target)
	pnpm test:unit

.PHONY: test-integration
test-integration: ## Run integration tests (requires Docker)
	pnpm test:integration

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

.PHONY: db-generate
db-generate: ## Generate Prisma client from schema
	pnpm db:generate

.PHONY: db-push
db-push: ## Push schema to database (development)
	pnpm db:push

.PHONY: db-migrate
db-migrate: ## Run database migrations
	pnpm db:migrate

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

.PHONY: build
build: ## Build all packages and apps
	pnpm build

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

.PHONY: clean
clean: ## Remove build artifacts, stop Docker, prune volumes
	pnpm clean
	docker-compose down -v
	rm -rf node_modules .turbo

# ---------------------------------------------------------------------------
# Help
# ---------------------------------------------------------------------------

.PHONY: help
help: ## Show this help message
	@echo "cueq — Available commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""
