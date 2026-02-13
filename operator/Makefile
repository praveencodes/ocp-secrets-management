# Image settings (override when building for your registry, e.g. make podman-build IMG=quay.io/<my-org>/ocp-secrets-management-operator:tag)
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
manifests: controller-gen ## Generate CRD manifests.
	$(CONTROLLER_GEN) crd paths="./pkg/apis/..." output:crd:artifacts:config=config/crd

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

.PHONY: docker-build
docker-build: ## Build docker image with the manager.
	docker build -t ${IMG} -f Dockerfile .

.PHONY: docker-push
docker-push: ## Push docker image with the manager.
	docker push ${IMG}

.PHONY: podman-build
podman-build: ## Build podman image with the manager.
	podman build -t ${IMG} -f Dockerfile .

.PHONY: podman-push
podman-push: ## Push podman image with the manager.
	podman push ${IMG}

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
	kubectl apply -f config/rbac/
	sed -e 's|image: openshift.io/ocp-secrets-management-operator:latest|image: $(IMG)|' config/manager/manager.yaml | kubectl apply -f -

.PHONY: undeploy
undeploy: ## Undeploy controller from the K8s cluster specified in ~/.kube/config.
	kubectl delete -f config/manager/ --ignore-not-found
	kubectl delete -f config/rbac/ --ignore-not-found
	kubectl delete -f config/crd/ --ignore-not-found

# deploy-sample applies the SecretsManagementConfig with PLUGIN_IMG substituted so the plugin deployment uses your image.
.PHONY: deploy-sample
deploy-sample: ## Deploy sample SecretsManagementConfig CR. Uses PLUGIN_IMG for the plugin image.
	sed -e 's|image: openshift.io/ocp-secrets-management:latest|image: $(PLUGIN_IMG)|' config/samples/secrets-management_v1alpha1_secretsmanagementconfig.yaml | kubectl apply -f -

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
bundle-build: ## Build the bundle image.
	docker build -f bundle.Dockerfile -t $(BUNDLE_IMG) .

.PHONY: bundle-push
bundle-push: ## Push the bundle image.
	docker push $(BUNDLE_IMG)

.PHONY: bundle-validate
bundle-validate: ## Validate the bundle using operator-sdk.
	operator-sdk bundle validate ./bundle

.PHONY: catalog-build
catalog-build: ## Build a catalog image.
	opm index add --bundles $(BUNDLE_IMG) --tag $(CATALOG_IMG)

.PHONY: catalog-push
catalog-push: ## Push a catalog image.
	docker push $(CATALOG_IMG)
