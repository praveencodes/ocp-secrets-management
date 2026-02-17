import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  Label,
  LabelProps,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  MenuToggleElement,
  Modal,
  ModalVariant,
  Button,
  Alert,
  AlertVariant,
} from '@patternfly/react-core';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  TimesCircleIcon,
  SyncAltIcon,
  EllipsisVIcon,
} from '@patternfly/react-icons';
import { ResourceTable } from './ResourceTable';
import { useK8sWatchResource, consoleFetch } from '@openshift-console/dynamic-plugin-sdk';
import {
  ExternalSecretModel,
  ClusterExternalSecretModel,
  ExternalSecret,
  ClusterExternalSecret,
  ExternalSecretResource,
  isClusterExternalSecret,
} from './crds';

/** Parse Kubernetes/Go duration string (e.g. "1h", "30m", "1h30m") to milliseconds */
function parseDurationMs(duration: string): number {
  if (!duration || typeof duration !== 'string') return 0;
  let ms = 0;
  const re = /(\d+)(h|m|s|ms)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(duration)) !== null) {
    const val = parseInt(m[1], 10);
    switch (m[2].toLowerCase()) {
      case 'h':
        ms += val * 60 * 60 * 1000;
        break;
      case 'm':
        ms += val * 60 * 1000;
        break;
      case 's':
        ms += val * 1000;
        break;
      case 'ms':
        ms += val;
        break;
    }
  }
  return ms;
}

/** Format next refresh from status.refreshTime + refreshInterval, with remaining hours in parentheses */
function getNextRefreshDisplay(
  refreshTime: string | undefined,
  refreshIntervalStr: string,
  t: (key: string, opts?: object) => string,
): string {
  if (!refreshTime) return '-';
  const lastRefresh = new Date(refreshTime).getTime();
  const intervalMs = parseDurationMs(refreshIntervalStr);
  if (intervalMs <= 0) return new Date(refreshTime).toLocaleString();
  const nextRefresh = lastRefresh + intervalMs;
  const now = Date.now();
  const remainingMs = nextRefresh - now;
  const remainingHours = remainingMs / (1000 * 60 * 60);
  const formattedTime = new Date(nextRefresh).toLocaleString();
  if (remainingHours > 0) {
    const hours = Math.round(remainingHours * 10) / 10;
    return `${formattedTime} (${t('{{count}} hours remaining', { count: hours })})`;
  }
  if (remainingHours > -1 / 60) return `${formattedTime} (${t('Due now')})`;
  const hoursAgo = Math.round(-remainingHours * 10) / 10;
  return `${formattedTime} (${t('{{count}} hours ago', { count: hoursAgo })})`;
}

const getConditionStatus = (externalSecret: ExternalSecretResource) => {
  const readyCondition = externalSecret.status?.conditions?.find(
    (condition) => condition.type === 'Ready',
  );

  if (!readyCondition) {
    return { status: 'Unknown', icon: <ExclamationCircleIcon />, color: 'orange' };
  }

  if (readyCondition.status === 'True') {
    return { status: 'Synced', icon: <CheckCircleIcon />, color: 'green' };
  }

  const syncCondition = externalSecret.status?.conditions?.find(
    (condition) => (condition.type as string) === 'SecretSynced',
  );

  if (syncCondition?.status === 'False') {
    return { status: 'Sync Failed', icon: <TimesCircleIcon />, color: 'red' };
  }

  return { status: 'Syncing', icon: <SyncAltIcon />, color: 'blue' };
};

interface ExternalSecretsTableProps {
  selectedProject: string;
}

export const ExternalSecretsTable: React.FC<ExternalSecretsTableProps> = ({ selectedProject }) => {
  const { t } = useTranslation('plugin__ocp-secrets-management');
  const [openDropdowns, setOpenDropdowns] = React.useState<Record<string, boolean>>({});
  const [deleteModal, setDeleteModal] = React.useState<{
    isOpen: boolean;
    externalSecret: ExternalSecretResource | null;
    isDeleting: boolean;
    error: string | null;
  }>({
    isOpen: false,
    externalSecret: null,
    isDeleting: false,
    error: null,
  });

  const toggleDropdown = (secretId: string) => {
    setOpenDropdowns((prev) => ({
      ...prev,
      [secretId]: !prev[secretId],
    }));
  };

  const handleInspect = (externalSecret: ExternalSecretResource) => {
    const isCluster = isClusterExternalSecret(externalSecret);
    const name = externalSecret.metadata.name;
    const resourceType = isCluster ? 'clusterexternalsecrets' : 'externalsecrets';
    if (isCluster) {
      // Cluster-scoped resources don't have a namespace
      window.location.href = `/secrets-management/inspect/${resourceType}/${name}`;
    } else {
      const namespace = externalSecret.metadata.namespace || 'default';
      window.location.href = `/secrets-management/inspect/${resourceType}/${namespace}/${name}`;
    }
  };

  const handleDelete = (externalSecret: ExternalSecretResource) => {
    setDeleteModal({
      isOpen: true,
      externalSecret,
      isDeleting: false,
      error: null,
    });
  };

  const confirmDelete = async () => {
    if (!deleteModal.externalSecret) return;

    setDeleteModal((prev) => ({ ...prev, isDeleting: true, error: null }));

    try {
      const resourceName = deleteModal.externalSecret?.metadata?.name;
      const resourceNamespace = deleteModal.externalSecret?.metadata?.namespace;
      const isCluster = isClusterExternalSecret(deleteModal.externalSecret);

      // Build API path from model (same version as watch)
      const model = isCluster ? ClusterExternalSecretModel : ExternalSecretModel;
      const apiPath = isCluster
        ? `/api/kubernetes/apis/${model.group}/${model.version}/clusterexternalsecrets/${resourceName}`
        : `/api/kubernetes/apis/${model.group}/${model.version}/namespaces/${resourceNamespace}/externalsecrets/${resourceName}`;

      const response = await consoleFetch(apiPath, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Delete failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      // Close modal on success
      setDeleteModal({
        isOpen: false,
        externalSecret: null,
        isDeleting: false,
        error: null,
      });
    } catch (error: unknown) {
      setDeleteModal((prev) => ({
        ...prev,
        isDeleting: false,
        error: error instanceof Error ? error.message : 'Failed to delete external secret',
      }));
    }
  };

  const cancelDelete = () => {
    setDeleteModal({
      isOpen: false,
      externalSecret: null,
      isDeleting: false,
      error: null,
    });
  };

  // Watch ExternalSecrets (namespaced)
  const [externalSecrets, externalSecretsLoaded, externalSecretsError] = useK8sWatchResource<
    ExternalSecret[]
  >({
    groupVersionKind: ExternalSecretModel,
    namespace: selectedProject === 'all' ? undefined : selectedProject,
    isList: true,
  });

  // Watch ClusterExternalSecrets (cluster-scoped)
  const [clusterExternalSecrets, clusterExternalSecretsLoaded, clusterExternalSecretsError] =
    useK8sWatchResource<ClusterExternalSecret[]>({
      groupVersionKind: ClusterExternalSecretModel,
      isList: true,
    });

  // Combine both resource types
  const allSecrets = React.useMemo(() => {
    const combined: ExternalSecretResource[] = [...(externalSecrets || [])];
    if (clusterExternalSecrets) {
      combined.push(...clusterExternalSecrets);
    }
    return combined;
  }, [externalSecrets, clusterExternalSecrets]);

  const loaded = externalSecretsLoaded && clusterExternalSecretsLoaded;
  const loadError = externalSecretsError || clusterExternalSecretsError;

  const columns = [
    { title: t('Name'), width: 14 },
    { title: t('Type'), width: 12 },
    { title: t('Namespace'), width: 11 },
    { title: t('Target Secret'), width: 13 },
    { title: t('Secret Store'), width: 18 },
    { title: t('Refresh Interval'), width: 11 },
    { title: t('Next Refresh'), width: 22 },
    { title: t('Status'), width: 9 },
    { title: '', width: 10 }, // Actions column
  ];

  const rows = React.useMemo(() => {
    if (!loaded || !allSecrets) return [];

    return allSecrets.map((resource) => {
      const isCluster = isClusterExternalSecret(resource);
      const conditionStatus = getConditionStatus(resource);

      // Extract data based on resource type
      let targetSecret = '';
      let secretStore = '';
      let refreshInterval = '';

      if (isCluster) {
        const clusterSpec = resource.spec.externalSecretSpec;
        targetSecret = clusterSpec?.target?.name || 'N/A';
        secretStore = clusterSpec?.secretStoreRef
          ? `${clusterSpec.secretStoreRef.name} (${clusterSpec.secretStoreRef.kind})`
          : 'N/A';
        refreshInterval = clusterSpec?.refreshInterval || 'Not set';
      } else {
        targetSecret = resource.spec.target?.name || 'N/A';
        secretStore = resource.spec.secretStoreRef
          ? `${resource.spec.secretStoreRef.name} (${resource.spec.secretStoreRef.kind})`
          : 'N/A';
        refreshInterval = resource.spec.refreshInterval || 'Not set';
      }

      const secretId = `${isCluster ? 'cluster' : resource.metadata.namespace}-${
        resource.metadata.name
      }`;
      const resourceType = isCluster ? 'ClusterExternalSecret' : 'ExternalSecret';
      const namespace = isCluster ? 'Cluster-wide' : resource.metadata.namespace;
      // refreshTime exists on ExternalSecretStatus; ClusterExternalSecretStatus does not have it
      const refreshTime = !isCluster ? (resource as ExternalSecret).status?.refreshTime : undefined;
      const nextRefresh = getNextRefreshDisplay(refreshTime, refreshInterval || '', t);

      return {
        cells: [
          resource.metadata.name,
          resourceType,
          namespace,
          targetSecret,
          secretStore,
          refreshInterval,
          nextRefresh,
          <Label
            key={`${secretId}-status`}
            color={conditionStatus.color as LabelProps['color']}
            icon={conditionStatus.icon}
          >
            {conditionStatus.status}
          </Label>,
          <Dropdown
            key={`${secretId}-actions`}
            isOpen={openDropdowns[secretId] || false}
            onSelect={() => setOpenDropdowns((prev) => ({ ...prev, [secretId]: false }))}
            toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
              <MenuToggle
                ref={toggleRef}
                aria-label="kebab dropdown toggle"
                variant="plain"
                onClick={() => toggleDropdown(secretId)}
                isExpanded={openDropdowns[secretId] || false}
              >
                <EllipsisVIcon />
              </MenuToggle>
            )}
            shouldFocusToggleOnSelect
          >
            <DropdownList>
              <DropdownItem key="inspect" onClick={() => handleInspect(resource)}>
                {t('Inspect')}
              </DropdownItem>
              <DropdownItem key="delete" onClick={() => handleDelete(resource)}>
                {t('Delete')}
              </DropdownItem>
            </DropdownList>
          </Dropdown>,
        ],
      };
    });
  }, [allSecrets, loaded, openDropdowns, t]);

  return (
    <>
      <ResourceTable
        columns={columns}
        rows={rows}
        loading={!loaded}
        error={loadError?.message}
        emptyStateTitle={t('No external secrets found')}
        emptyStateBody={
          selectedProject === 'all'
            ? t('No ExternalSecrets are currently available in all projects.')
            : t('No ExternalSecrets are currently available in the project {{project}}.', {
                project: selectedProject,
              })
        }
        selectedProject={selectedProject}
        data-test="external-secrets-table"
      />

      <Modal
        variant={ModalVariant.small}
        title={`${t('Delete')} ${
          deleteModal.externalSecret && isClusterExternalSecret(deleteModal.externalSecret)
            ? t('ClusterExternalSecret')
            : t('ExternalSecret')
        }`}
        isOpen={deleteModal.isOpen}
        onClose={cancelDelete}
      >
        <div style={{ padding: '1.5rem' }}>
          {deleteModal.error && (
            <Alert
              variant={AlertVariant.danger}
              title={t('Delete failed')}
              isInline
              style={{ marginBottom: '1.5rem' }}
            >
              {deleteModal.error}
            </Alert>
          )}
          <div style={{ marginBottom: '1.5rem' }}>
            <p style={{ marginBottom: '1rem', fontSize: '1rem', lineHeight: '1.5' }}>
              {`Are you sure you want to delete the ${
                deleteModal.externalSecret && isClusterExternalSecret(deleteModal.externalSecret)
                  ? t('ClusterExternalSecret')
                  : t('ExternalSecret')
              } "${deleteModal.externalSecret?.metadata?.name || ''}"?`}
            </p>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#6a737d' }}>
              <strong>{t('This action cannot be undone.')}</strong>
            </p>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              paddingTop: '1rem',
              borderTop: '1px solid #e1e5e9',
            }}
          >
            <Button key="cancel" variant="link" onClick={cancelDelete}>
              {t('Cancel')}
            </Button>
            <Button
              key="confirm"
              variant="danger"
              onClick={confirmDelete}
              isDisabled={deleteModal.isDeleting}
              isLoading={deleteModal.isDeleting}
              spinnerAriaValueText={deleteModal.isDeleting ? t('Deleting...') : undefined}
            >
              {deleteModal.isDeleting ? t('Deleting...') : t('Delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
