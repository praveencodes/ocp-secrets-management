# Container engine: podman by default (override with CONTAINER_ENGINE=docker if needed)
CONTAINER_ENGINE ?= podman
# Set BUILD_OPTS=--no-cache to force a full rebuild (avoids stale "Created" date when cache is reused)
BUILD_OPTS ?=

# Image settings (override when building for your registry, e.g. make image-build IMG=quay.io/<my-org>/ocp-secrets-management-operator:tag)
IMG ?= openshift.io/ocp-secrets-management-operator:latest
PLUGIN_IMG ?= openshift.io/ocp-secrets-management:latest
BUNDLE_IMG ?= openshift.io/ocp-secrets-management-operator-bundle:v0.1.0
CATALOG_IMG ?= openshift.io/ocp-secrets-management-operator-catalog:v0.1.0

# Version
VERSION ?= 0.1.0

# Tool versions
CONTROLLER_GEN_VERSION ?= v0.14.0
KUSTOMIZE_VERSION ?= v5.3.0
OPERATOR_SDK_VERSION ?= v1.34.0

# Get the currently used golang install path (in GOPATH/bin, unless GOBIN is set)
ifeq (,$(shell go env GOBIN))
GOBIN=$(shell go env GOPATH)/bin
else
GOBIN=$(shell go env GOBIN)
endif

# Setting SHELL to bash allows bash commands to be executed by recipes.
SHELL = /usr/bin/env bash -o pipefail
.SHELLFLAGS = -ec

.PHONY: all
all: build

##@ General

.PHONY: help
help: ## Display this help.
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Development

.PHONY: manifests
manifests: controller-gen ## Generate CRD and RBAC manifests from kubebuilder markers.
	$(CONTROLLER_GEN) crd paths="./pkg/apis/..." output:crd:artifacts:config=config/crd
	$(CONTROLLER_GEN) rbac:roleName=secrets-management-operator paths="./pkg/controller/..." output:dir=config/rbac

.PHONY: generate
generate: controller-gen ## Generate code containing DeepCopy, DeepCopyInto, and DeepCopyObject method implementations.
	$(CONTROLLER_GEN) object:headerFile="hack/boilerplate.go.txt" paths="./pkg/apis/..."

.PHONY: clean
clean: ## Remove build artifacts.
	rm -rf bin/ cover.out

.PHONY: fmt
fmt: ## Run go fmt against code.
	go fmt ./...

.PHONY: vet
vet: ## Run go vet against code.
	go vet ./...

.PHONY: test
test: manifests generate fmt vet ## Run tests.
	go test ./... -coverprofile cover.out

.PHONY: lint
lint: ## Run golangci-lint against code.
	golangci-lint run

##@ Build

.PHONY: build
build: manifests generate fmt vet ## Build manager binary.
	go build -o bin/manager cmd/manager/main.go

.PHONY: run
run: manifests generate fmt vet ## Run a controller from your host.
	go run ./cmd/manager/main.go

.PHONY: image-build
image-build: ## Build container image with the manager (default: podman).
	$(CONTAINER_ENGINE) build $(BUILD_OPTS) -t ${IMG} -f Dockerfile .

.PHONY: image-push
image-push: ## Push container image (default: podman).
	$(CONTAINER_ENGINE) push ${IMG}

.PHONY: docker-build
docker-build: ## Build image using docker.
	$(MAKE) image-build CONTAINER_ENGINE=docker

.PHONY: docker-push
docker-push: ## Push image using docker.
	$(MAKE) image-push CONTAINER_ENGINE=docker

.PHONY: podman-build
podman-build: ## Build image using podman (default).
	$(MAKE) image-build CONTAINER_ENGINE=podman

.PHONY: podman-push
podman-push: ## Push image using podman (default).
	$(MAKE) image-push CONTAINER_ENGINE=podman

##@ Deployment

.PHONY: install
install: manifests ## Install CRDs into the K8s cluster specified in ~/.kube/config.
	kubectl apply -f config/crd/

.PHONY: uninstall
uninstall: manifests ## Uninstall CRDs from the K8s cluster specified in ~/.kube/config.
	kubectl delete -f config/crd/

# Deploy substitutes IMG into config/manager/ and PLUGIN_IMG into the sample so that
# the applied manifests use the images you set (e.g. make deploy IMG=quay.io/<my-org>/ocp-secrets-management-operator:latest).
.PHONY: deploy
deploy: manifests ## Deploy controller to the K8s cluster specified in ~/.kube/config. Uses IMG for the operator image.
	kubectl apply -f config/crd/
	kubectl apply -f config/namespace.yaml
	kubectl apply -f config/rbac/
	sed -e 's|image: openshift.io/ocp-secrets-management-operator:latest|image: $(IMG)|' config/manager/manager.yaml | kubectl apply -f -

.PHONY: undeploy
undeploy: ## Undeploy controller from the K8s cluster specified in ~/.kube/config.
	kubectl delete -f config/manager/ --ignore-not-found
	kubectl delete -f config/rbac/ --ignore-not-found
	kubectl delete -f config/namespace.yaml --ignore-not-found
	kubectl delete -f config/crd/ --ignore-not-found

# deploy-sample applies the SecretsManagementConfig with PLUGIN_IMG substituted so the plugin deployment uses your image.
# Depends on deploy so the operator is running and can reconcile the sample (create plugin deployment, ConsolePlugin, etc.).
.PHONY: deploy-sample
deploy-sample: deploy ## Deploy sample SecretsManagementConfig CR. Uses PLUGIN_IMG for the plugin image.
	sed -e 's|image: openshift.io/ocp-secrets-management:latest|image: $(PLUGIN_IMG)|' config/samples/secrets-management_v1alpha1_secretsmanagementconfig.yaml | kubectl apply -f -

.PHONY: undeploy-sample
undeploy-sample: ## Remove the sample SecretsManagementConfig (operator will clean up plugin Deployment, Service, ConsolePlugin).
	kubectl delete -f config/samples/secrets-management_v1alpha1_secretsmanagementconfig.yaml --ignore-not-found

##@ Tool Dependencies

CONTROLLER_GEN = $(GOBIN)/controller-gen
.PHONY: controller-gen
controller-gen: ## Download controller-gen locally if necessary.
	@test -s $(CONTROLLER_GEN) || GOBIN=$(GOBIN) go install sigs.k8s.io/controller-tools/cmd/controller-gen@$(CONTROLLER_GEN_VERSION)

KUSTOMIZE = $(GOBIN)/kustomize
.PHONY: kustomize
kustomize: ## Download kustomize locally if necessary.
	@test -s $(KUSTOMIZE) || GOBIN=$(GOBIN) go install sigs.k8s.io/kustomize/kustomize/v5@$(KUSTOMIZE_VERSION)

##@ Bundle

.PHONY: bundle
bundle: manifests ## Generate bundle manifests and metadata.
	cp config/crd/secrets-management.openshift.io_secretsmanagementconfigs.yaml bundle/manifests/
	@echo "Bundle generated in bundle/"

.PHONY: bundle-build
bundle-build: ## Build the bundle image (default: podman).
	$(CONTAINER_ENGINE) build $(BUILD_OPTS) -f bundle.Dockerfile -t $(BUNDLE_IMG) .

.PHONY: bundle-push
bundle-push: ## Push the bundle image (default: podman).
	$(CONTAINER_ENGINE) push $(BUNDLE_IMG)

.PHONY: bundle-validate
bundle-validate: ## Validate the bundle using operator-sdk.
	operator-sdk bundle validate ./bundle

.PHONY: catalog-build
catalog-build: ## Build a catalog image.
	opm index add --bundles $(BUNDLE_IMG) --tag $(CATALOG_IMG)

.PHONY: catalog-push
catalog-push: ## Push a catalog image (default: podman).
	$(CONTAINER_ENGINE) push $(CATALOG_IMG)
