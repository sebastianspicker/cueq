# cueq: Standard Commands
# ==========================
# Run `make help` for a list of all targets.

.DEFAULT_GOAL := help
SHELL := /bin/bash
SCRIPTS := ./scripts

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

.PHONY: setup
setup: ## Install dependencies, attempt Docker startup, generate Prisma, apply migrations
	$(SCRIPTS)/setup.sh

# ---------------------------------------------------------------------------
# Development
# ---------------------------------------------------------------------------

.PHONY: dev
dev: ## Start development servers (API + Web) with hot reload
	$(SCRIPTS)/dev.sh

# ---------------------------------------------------------------------------
# Quality Checks
# ---------------------------------------------------------------------------

.PHONY: check
check: ## Full validation: hygiene + lint + format + typecheck + schemas + tests + openapi-check
	$(SCRIPTS)/check.sh

.PHONY: quick
quick: ## Fast local validation: lint + typecheck + direct contract tests
	$(SCRIPTS)/pnpm.sh lint
	$(SCRIPTS)/pnpm.sh typecheck
	$(SCRIPTS)/pnpm.sh test

.PHONY: docs-check
docs-check: ## Validate internal markdown links
	$(SCRIPTS)/pnpm.sh docs:links

.PHONY: hygiene-check
hygiene-check: ## Reject private, local-only, and generated artifacts tracked by Git
	$(SCRIPTS)/check-repo-hygiene.sh

.PHONY: lint
lint: ## Run linters in check mode (no auto-fix)
	$(SCRIPTS)/pnpm.sh lint

.PHONY: lint-fix
lint-fix: ## Auto-fix lint + formatting issues
	$(SCRIPTS)/pnpm.sh lint:fix
	$(SCRIPTS)/pnpm.sh format:fix

.PHONY: typecheck
typecheck: ## TypeScript type checking (no emit)
	$(SCRIPTS)/pnpm.sh typecheck

.PHONY: knip
knip: ## Find unused files, exports, dependencies, and binaries
	$(SCRIPTS)/pnpm.sh hygiene:code

.PHONY: format
format: ## Check code formatting
	$(SCRIPTS)/pnpm.sh format

.PHONY: format-fix
format-fix: ## Auto-fix formatting
	$(SCRIPTS)/pnpm.sh format:fix

.PHONY: schemas
schemas: ## Validate JSON Schemas
	$(SCRIPTS)/schemas.sh

.PHONY: generate
generate: ## Generate Prisma client, OpenAPI snapshot, and generated docs
	$(SCRIPTS)/generate.sh

.PHONY: openapi-check
openapi-check: ## Validate committed OpenAPI snapshot against generated document
	$(SCRIPTS)/openapi-check.sh

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

.PHONY: test
test: ## Run each workspace's default test script
	$(SCRIPTS)/pnpm.sh test

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

.PHONY: db-generate
db-generate: ## Generate Prisma client from schema
	$(SCRIPTS)/pnpm.sh db:generate

.PHONY: db-push
db-push: ## Push schema to database (development)
	$(SCRIPTS)/pnpm.sh db:push

.PHONY: db-migrate
db-migrate: ## Run database migrations
	$(SCRIPTS)/pnpm.sh db:migrate

.PHONY: webhook-secrets-check
webhook-secrets-check: ## Inventory and validate webhook secret storage without changing rows
	$(SCRIPTS)/pnpm.sh migrate:webhook-envelopes --dry-run

.PHONY: webhook-secrets-migrate
webhook-secrets-migrate: ## Encrypt validated legacy webhook secrets in one transaction
	@test "$(WEBHOOK_SECRET_MAINTENANCE_CONFIRMED)" = "1" || { echo "Refusing webhook secret migration: stop every old API/dispatcher, then rerun with WEBHOOK_SECRET_MAINTENANCE_CONFIRMED=1." >&2; exit 1; }
	$(SCRIPTS)/pnpm.sh migrate:webhook-envelopes --apply --maintenance-window-confirmed

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

.PHONY: build
build: ## Build all packages and apps
	$(SCRIPTS)/pnpm.sh build

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

.PHONY: clean
clean: ## Remove build artifacts, stop Docker, prune volumes
	$(SCRIPTS)/pnpm.sh clean
	$(if $(shell command -v docker-compose 2>/dev/null),docker-compose,docker compose) down -v
	rm -rf node_modules .turbo

# ---------------------------------------------------------------------------
# Help
# ---------------------------------------------------------------------------

.PHONY: help
help: ## Show this help message
	@echo "cueq: Available commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""
