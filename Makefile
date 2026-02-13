# Makefile for OCP Secrets Management Plugin
# All CRD-related operations run in containers - no local Node.js required

.PHONY: all
all: plugin-build ## Build plugin (default target)

.PHONY: test
test: ## Run tests (operator unit tests)
	$(MAKE) -C operator test

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Container runtime detection
CONTAINER_RUNTIME ?= $(shell command -v podman 2>/dev/null || command -v docker 2>/dev/null)
ifeq ($(CONTAINER_RUNTIME),)
$(error No container runtime found. Please install podman or docker)
endif

# Image name for scripts
SCRIPTS_IMAGE := ocp-secrets-management-scripts

# Plugin image (override when building for your registry, e.g. make plugin-image PLUGIN_IMG=quay.io/<my-org>/ocp-secrets-management:v1.0)
PLUGIN_IMG ?= openshift.io/ocp-secrets-management:latest

##@ CRD Management (Containerized)

.PHONY: scripts-image
scripts-image: ## Build the container image for running scripts
	$(CONTAINER_RUNTIME) build -t $(SCRIPTS_IMAGE) -f scripts/Dockerfile .

.PHONY: fetch-crds
fetch-crds: scripts-image ## Fetch CRDs from upstream repositories (containerized)
	$(CONTAINER_RUNTIME) run --rm \
		-v $(CURDIR)/crds:/app/crds:z \
		-v $(CURDIR)/crd-sources.json:/app/crd-sources.json:ro,z \
		$(SCRIPTS_IMAGE) \
		ts-node scripts/fetch-crds.ts

.PHONY: generate-types
generate-types: scripts-image ## Generate TypeScript interfaces from CRDs (containerized)
	$(CONTAINER_RUNTIME) run --rm \
		-v $(CURDIR)/crds:/app/crds:ro,z \
		-v $(CURDIR)/src/generated/crds:/app/src/generated/crds:z \
		$(SCRIPTS_IMAGE) \
		ts-node scripts/generate-types.ts

.PHONY: update-types
update-types: fetch-crds generate-types ## Fetch CRDs and generate TypeScript (containerized)
	@echo "✅ Types updated successfully"

##@ Plugin checks (TypeScript typecheck + lint; containerized, no local Node required)

.PHONY: plugin-typecheck
plugin-typecheck: ## Run TypeScript type-check (catches unused vars, type errors).
	$(CONTAINER_RUNTIME) run --rm \
		-v $(CURDIR):/app:z \
		-w /app \
		node:20-alpine \
		sh -c "yarn install && yarn typecheck"

.PHONY: plugin-lint
plugin-lint: ## Run ESLint and stylelint on plugin source.
	$(CONTAINER_RUNTIME) run --rm \
		-v $(CURDIR):/app:z \
		-w /app \
		node:20-alpine \
		sh -c "yarn install && yarn lint"

.PHONY: plugin-check
plugin-check: plugin-typecheck plugin-lint ## Run typecheck + lint (use before plugin-image to fail fast).

##@ Plugin Build (Containerized)

.PHONY: plugin-build
plugin-build: plugin-typecheck ## Build the console plugin (containerized); runs plugin-typecheck first.
	$(CONTAINER_RUNTIME) run --rm \
		-v $(CURDIR):/app:z \
		-w /app \
		node:20-alpine \
		sh -c "yarn install && yarn build"

.PHONY: plugin-image
plugin-image: plugin-typecheck ## Build the plugin container image; runs plugin-typecheck first.
	$(CONTAINER_RUNTIME) build -t $(PLUGIN_IMG) -f Dockerfile .

.PHONY: plugin-push
plugin-push: ## Push the plugin container image (override: make plugin-push PLUGIN_IMG=quay.io/<my-org>/ocp-secrets-management:tag)
	$(CONTAINER_RUNTIME) push $(PLUGIN_IMG)

##@ Development

.PHONY: shell
shell: scripts-image ## Open a shell in the scripts container
	$(CONTAINER_RUNTIME) run --rm -it \
		-v $(CURDIR):/app:z \
		-w /app \
		$(SCRIPTS_IMAGE) \
		sh

.PHONY: clean
clean: ## Clean generated files
	rm -rf crds/ src/generated/crds/ dist/

.PHONY: clean-images
clean-images: ## Remove built container images
	$(CONTAINER_RUNTIME) rmi $(SCRIPTS_IMAGE) 2>/dev/null || true

##@ Operator

.PHONY: operator-build
operator-build: ## Build the operator (in operator/ directory)
	cd operator && make build

.PHONY: operator-test
operator-test: ## Run operator tests
	cd operator && make test

.PHONY: operator-bundle
operator-bundle: ## Generate operator bundle
	cd operator && make bundle
