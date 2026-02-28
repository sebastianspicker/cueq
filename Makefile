# cueq — Standard Commands
# ==========================
# Run `make help` for a list of all targets.
# See AGENTS.md §3 for command documentation.

.DEFAULT_GOAL := help
SHELL := /bin/bash
SCRIPTS := ./scripts

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

.PHONY: setup
setup: ## Install dependencies, start Docker, generate Prisma client
	$(SCRIPTS)/setup.sh

# ---------------------------------------------------------------------------
# Development
# ---------------------------------------------------------------------------

.PHONY: dev
dev: ## Start development servers (API + Web) with hot reload
	$(SCRIPTS)/pnpm.sh dev

# ---------------------------------------------------------------------------
# Quality Checks
# ---------------------------------------------------------------------------

.PHONY: check
check: ## Full validation: lint + format + typecheck + schemas + tests + openapi-check
	$(SCRIPTS)/check.sh

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

.PHONY: format
format: ## Check code formatting
	$(SCRIPTS)/pnpm.sh format

.PHONY: format-fix
format-fix: ## Auto-fix formatting
	$(SCRIPTS)/pnpm.sh format:fix

.PHONY: schemas
schemas: ## Validate JSON Schemas and fixture contracts
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
test: ## Run all tests
	$(SCRIPTS)/pnpm.sh test

.PHONY: test-unit
test-unit: ## Run unit tests only (fast, <10s target)
	$(SCRIPTS)/pnpm.sh test:unit

.PHONY: test-integration
test-integration: ## Run integration tests (requires Docker)
	$(SCRIPTS)/pnpm.sh test:integration

.PHONY: test-acceptance
test-acceptance: ## Run acceptance tests (full stack)
	$(SCRIPTS)/pnpm.sh test:acceptance

.PHONY: test-compliance
test-compliance: ## Run GDPR/audit compliance tests
	$(SCRIPTS)/pnpm.sh test:compliance

.PHONY: test-all
test-all: ## Run all test suites
	$(SCRIPTS)/pnpm.sh test:all

.PHONY: test-backup-restore
test-backup-restore: ## Run backup/restore verification (AT-08)
	node ./scripts/backup-restore-verify.mjs

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
