import * as React from 'react';
import Helmet from 'react-helmet';
import { useTranslation } from 'react-i18next';
import {
  Title,
  Card,
  CardBody,
  CardTitle,
  Grid,
  GridItem,
  Badge,
  Flex,
  FlexItem,
  Menu,
  MenuContent,
  MenuList,
  MenuItem,
  MenuContainer,
  MenuToggle,
  Spinner,
  Tooltip,
  Alert,
  Button,
} from '@patternfly/react-core';
import { KeyIcon } from '@patternfly/react-icons';
import { CertificatesTable } from './components/CertificatesTable';
import { IssuersTable } from './components/IssuersTable';
import { ExternalSecretsTable } from './components/ExternalSecretsTable';
import { SecretStoresTable } from './components/SecretStoresTable';
import { PushSecretsTable } from './components/PushSecretsTable';
import { SecretProviderClassTable } from './components/SecretProviderClassTable';
import { OperatorNotInstalled, NoOperatorsInstalled } from './components/OperatorNotInstalled';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { useOperatorDetection, type OperatorStatus } from './hooks/useOperatorDetection';

/** Badge for operator status: shows "Check failed" with tooltip on error, "Not Installed" when not installed, or nothing when installed. */
const OperatorStatusBadge: React.FC<{ status: OperatorStatus }> = ({ status }) => {
  const { t } = useTranslation('plugin__ocp-secrets-management');
  if (status.error) {
    return (
      <Tooltip content={status.error}>
        <Badge
          isRead
          style={{ marginLeft: '8px', backgroundColor: 'var(--pf-global--danger-color--100)' }}
        >
          {t('Check failed')}
        </Badge>
      </Tooltip>
    );
  }
  if (!status.installed) {
    return (
      <Badge
        isRead
        style={{ marginLeft: '8px', backgroundColor: 'var(--pf-global--warning-color--100)' }}
      >
        {t('Not Installed')}
      </Badge>
    );
  }
  return null;
};

type OperatorType = 'cert-manager' | 'external-secrets' | 'secrets-store-csi' | 'all';
type ResourceKind =
  | 'certificates'
  | 'issuers'
  | 'externalsecrets'
  | 'secretstores'
  | 'pushsecrets'
  | 'secretproviderclasses'
  | 'all';
type ProjectType = 'all' | string;

// Project/Namespace resource model
const ProjectModel = {
  group: '',
  version: 'v1',
  kind: 'Namespace',
};

interface Project {
  metadata: {
    name: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  status?: {
    phase: string;
  };
}

interface FilterState {
  operator: OperatorType;
  resourceKind: ResourceKind;
  project: ProjectType;
}

export default function SecretsManagement() {
  const { t } = useTranslation('plugin__ocp-secrets-management');
  const [filters, setFilters] = React.useState<FilterState>({
    operator: 'all',
    resourceKind: 'all',
    project: 'all',
  });
  const [projectMenuOpen, setProjectMenuOpen] = React.useState(false);
  const [operatorMenuOpen, setOperatorMenuOpen] = React.useState(false);
  const [resourceKindMenuOpen, setResourceKindMenuOpen] = React.useState(false);
  const projectMenuRef = React.useRef<HTMLDivElement>(null);
  const projectToggleRef = React.useRef<HTMLButtonElement>(null);
  const operatorMenuRef = React.useRef<HTMLDivElement>(null);
  const operatorToggleRef = React.useRef<HTMLButtonElement>(null);
  const resourceKindMenuRef = React.useRef<HTMLDivElement>(null);
  const resourceKindToggleRef = React.useRef<HTMLButtonElement>(null);

  // Detect installed operators
  const {
    certManager,
    externalSecrets,
    secretsStoreCSI,
    loading: operatorsLoading,
    refresh: checkOperators,
  } = useOperatorDetection();

  // Check if any operators are installed
  const anyOperatorInstalled =
    certManager.installed || externalSecrets.installed || secretsStoreCSI.installed;

  // Fetch all namespaces/projects dynamically
  const [projects, projectsLoaded, projectsError] = useK8sWatchResource<Project[]>({
    groupVersionKind: ProjectModel,
    isList: true,
  });

  const operatorOptions = [
    {
      value: 'all',
      label: t('All Operators'),
      description: t('Show resources from all operators'),
    },
    {
      value: 'cert-manager',
      label: 'cert-manager',
      description: t('Certificate lifecycle management'),
    },
    {
      value: 'external-secrets',
      label: 'External Secrets Operator',
      description: t('External secret synchronization'),
    },
    {
      value: 'secrets-store-csi',
      label: 'Secrets Store CSI Driver',
      description: t('Secret provider integration'),
    },
  ];

  // Generate dynamic project options from fetched namespaces
  const getProjectOptions = React.useMemo(() => {
    const baseOptions = [
      {
        value: 'all',
        label: t('All Projects'),
        description: t('Show resources from all projects'),
      },
    ];

    if (!projectsLoaded || projectsError || !projects) {
      return baseOptions;
    }

    // Filter and sort projects
    const sortedProjects = projects
      .filter((project) => {
        // Filter out system namespaces that are typically not user-relevant
        const name = project.metadata.name;
        const isSystemNamespace =
          name.startsWith('kube-') ||
          name.startsWith('openshift-') ||
          name === 'default' ||
          name === 'kube-node-lease' ||
          name === 'kube-public';

        // Include active projects only
        const isActive = !project.status || project.status.phase !== 'Terminating';

        return (
          isActive &&
          (!isSystemNamespace ||
            name === 'default' ||
            name === 'openshift-operators' ||
            name === 'openshift-monitoring')
        );
      })
      .sort((a, b) => {
        // Sort with common projects first, then alphabetically
        const commonProjects = ['default', 'openshift-operators', 'openshift-monitoring'];
        const aIsCommon = commonProjects.includes(a.metadata.name);
        const bIsCommon = commonProjects.includes(b.metadata.name);

        if (aIsCommon && !bIsCommon) return -1;
        if (!aIsCommon && bIsCommon) return 1;
        return a.metadata.name.localeCompare(b.metadata.name);
      });

    const projectOptions = sortedProjects.map((project) => ({
      value: project.metadata.name,
      label: project.metadata.name,
      description:
        project.metadata.labels?.['openshift.io/display-name'] ||
        `${t('Project')}: ${project.metadata.name}`,
    }));

    return [...baseOptions, ...projectOptions];
  }, [projects, projectsLoaded, projectsError, t]);

  const projectOptions = getProjectOptions;

  const getResourceOptions = (operator: OperatorType) => {
    const baseOptions = [
      { value: 'all', label: t('All Resources'), description: t('Show all resource types') },
    ];

    if (operator === 'all') {
      return [
        ...baseOptions,
        {
          value: 'certificates',
          label: t('Certificates'),
          description: t('cert-manager certificates'),
        },
        { value: 'issuers', label: t('Issuers'), description: t('cert-manager issuers') },
        {
          value: 'externalsecrets',
          label: t('External Secrets'),
          description: t('External secret definitions'),
        },
        {
          value: 'secretstores',
          label: t('Secret Stores'),
          description: t('External secret stores'),
        },
        {
          value: 'pushsecrets',
          label: t('Push Secrets'),
          description: t('External secret push configurations'),
        },
        {
          value: 'secretproviderclasses',
          label: t('Secret Provider Classes'),
          description: t('CSI secret provider configurations'),
        },
      ];
    } else if (operator === 'cert-manager') {
      return [
        ...baseOptions,
        { value: 'certificates', label: t('Certificates'), description: t('TLS certificates') },
        { value: 'issuers', label: t('Issuers'), description: t('Certificate issuers') },
      ];
    } else if (operator === 'external-secrets') {
      return [
        ...baseOptions,
        {
          value: 'externalsecrets',
          label: t('External Secrets'),
          description: t('Secret synchronization rules'),
        },
        {
          value: 'secretstores',
          label: t('Secret Stores'),
          description: t('External secret backends'),
        },
        {
          value: 'pushsecrets',
          label: t('Push Secrets'),
          description: t('Secret push configurations'),
        },
      ];
    } else if (operator === 'secrets-store-csi') {
      return [
        ...baseOptions,
        {
          value: 'secretproviderclasses',
          label: t('Secret Provider Classes'),
          description: t('Secret provider configurations'),
        },
      ];
    }
    return baseOptions;
  };

  const handleOperatorChange = (_event: React.FormEvent<HTMLSelectElement>, value: string) => {
    setFilters((prev) => ({
      ...prev,
      operator: value as OperatorType,
      resourceKind: 'all', // Reset resource filter when operator changes
    }));
  };

  const handleResourceChange = (_event: React.FormEvent<HTMLSelectElement>, value: string) => {
    setFilters((prev) => ({
      ...prev,
      resourceKind: value as ResourceKind,
    }));
  };

  const handleProjectChange = (_event: React.FormEvent<HTMLSelectElement>, value: string) => {
    setFilters((prev) => ({
      ...prev,
      project: value as ProjectType,
    }));
  };

  const shouldShowComponent = (operator: OperatorType, resourceKind: ResourceKind) => {
    if (filters.operator !== 'all' && filters.operator !== operator) return false;
    if (filters.resourceKind !== 'all' && filters.resourceKind !== resourceKind) return false;
    return true;
  };

  // Check if operator is installed for the card content
  const isOperatorInstalled = (operator: OperatorType): boolean => {
    switch (operator) {
      case 'cert-manager':
        return certManager.installed;
      case 'external-secrets':
        return externalSecrets.installed;
      case 'secrets-store-csi':
        return secretsStoreCSI.installed;
      default:
        return true;
    }
  };

  // Get operator status for error/lookup-failure handling
  const getOperatorStatus = (
    operatorKey: 'cert-manager' | 'external-secrets' | 'secrets-store-csi',
  ) => {
    switch (operatorKey) {
      case 'cert-manager':
        return certManager;
      case 'external-secrets':
        return externalSecrets;
      case 'secrets-store-csi':
        return secretsStoreCSI;
    }
  };

  // Render the appropriate content based on operator installation status
  // Uses a render function to lazily evaluate the table component
  const renderOperatorContent = (
    operator: OperatorType,
    renderInstalledContent: () => React.ReactNode,
    operatorKey: 'cert-manager' | 'external-secrets' | 'secrets-store-csi',
  ) => {
    if (operatorsLoading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
          <Spinner size="lg" />
        </div>
      );
    }

    const status = getOperatorStatus(operatorKey);
    if (status.error) {
      return (
        <Alert variant="danger" title={t('Unable to verify operator status')}>
          <p>{status.error}</p>
          <Button variant="secondary" onClick={() => checkOperators()} style={{ marginTop: '8px' }}>
            {t('Retry')}
          </Button>
        </Alert>
      );
    }

    if (!isOperatorInstalled(operator)) {
      return <OperatorNotInstalled operatorKey={operatorKey} />;
    }

    // Only call the render function when operator is confirmed installed
    return renderInstalledContent();
  };

  return (
    <>
      <Helmet>
        <title data-test="secrets-management-page-title">{t('Secrets Management')}</title>
      </Helmet>
      <div className="co-m-pane__body co-m-pane__body--no-top-margin">
        <div
          className="co-m-pane__heading"
          style={{ paddingTop: '2rem', paddingLeft: '2rem', paddingRight: '2rem' }}
        >
          <Title headingLevel="h1" size="2xl" className="co-m-pane__heading-title">
            <KeyIcon className="co-m-resource-icon co-m-resource-icon--lg" />{' '}
            {t('Secrets Management')}
          </Title>
          <p className="help-block" style={{ textAlign: 'left' }}>
            {t('Manage certificates, external secrets, and secret stores across your cluster.')}
          </p>
        </div>

        {/* Filter Controls */}
        <div
          className="co-m-pane__filter-bar"
          style={{ padding: '16px 2rem', marginBottom: '16px' }}
        >
          <Flex spaceItems={{ default: 'spaceItemsMd' }}>
            <FlexItem>
              <MenuContainer
                isOpen={projectMenuOpen}
                onOpenChange={setProjectMenuOpen}
                menuRef={projectMenuRef}
                toggleRef={projectToggleRef}
                toggle={
                  <MenuToggle
                    ref={projectToggleRef}
                    onClick={() => setProjectMenuOpen((prev) => !prev)}
                    isExpanded={projectMenuOpen}
                    isDisabled={!projectsLoaded}
                    aria-label={t('Project')}
                    style={{ width: '200px' }}
                  >
                    {!projectsLoaded
                      ? t('Loading projects...')
                      : projectsError
                      ? t('Error loading projects')
                      : projectOptions.find((o) => o.value === filters.project)?.label ??
                        t('All Projects')}
                  </MenuToggle>
                }
                menu={
                  <Menu
                    ref={projectMenuRef}
                    onSelect={(_event, value) => {
                      handleProjectChange(
                        _event as unknown as React.FormEvent<HTMLSelectElement>,
                        value as string,
                      );
                      setProjectMenuOpen(false);
                      projectToggleRef.current?.focus();
                    }}
                    selected={filters.project}
                  >
                    <MenuContent>
                      <MenuList>
                        {projectOptions.map((option) => (
                          <MenuItem key={option.value} itemId={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </MenuList>
                    </MenuContent>
                  </Menu>
                }
              />
            </FlexItem>
            <FlexItem>
              <MenuContainer
                isOpen={operatorMenuOpen}
                onOpenChange={setOperatorMenuOpen}
                menuRef={operatorMenuRef}
                toggleRef={operatorToggleRef}
                toggle={
                  <MenuToggle
                    ref={operatorToggleRef}
                    onClick={() => setOperatorMenuOpen((prev) => !prev)}
                    isExpanded={operatorMenuOpen}
                    aria-label={t('Operator')}
                    style={{ width: '200px' }}
                  >
                    {operatorOptions.find((o) => o.value === filters.operator)?.label ??
                      t('All Operators')}
                  </MenuToggle>
                }
                menu={
                  <Menu
                    ref={operatorMenuRef}
                    onSelect={(_event, value) => {
                      handleOperatorChange(
                        _event as unknown as React.FormEvent<HTMLSelectElement>,
                        value as string,
                      );
                      setOperatorMenuOpen(false);
                      operatorToggleRef.current?.focus();
                    }}
                    selected={filters.operator}
                  >
                    <MenuContent>
                      <MenuList>
                        {operatorOptions.map((option) => (
                          <MenuItem key={option.value} itemId={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </MenuList>
                    </MenuContent>
                  </Menu>
                }
              />
            </FlexItem>
            <FlexItem>
              <MenuContainer
                isOpen={resourceKindMenuOpen}
                onOpenChange={setResourceKindMenuOpen}
                menuRef={resourceKindMenuRef}
                toggleRef={resourceKindToggleRef}
                toggle={
                  <MenuToggle
                    ref={resourceKindToggleRef}
                    onClick={() => setResourceKindMenuOpen((prev) => !prev)}
                    isExpanded={resourceKindMenuOpen}
                    aria-label={t('Resource Type')}
                    style={{ width: '200px' }}
                  >
                    {getResourceOptions(filters.operator).find(
                      (o) => o.value === filters.resourceKind,
                    )?.label ?? t('All Resources')}
                  </MenuToggle>
                }
                menu={
                  <Menu
                    ref={resourceKindMenuRef}
                    onSelect={(_event, value) => {
                      handleResourceChange(
                        _event as unknown as React.FormEvent<HTMLSelectElement>,
                        value as string,
                      );
                      setResourceKindMenuOpen(false);
                      resourceKindToggleRef.current?.focus();
                    }}
                    selected={filters.resourceKind}
                  >
                    <MenuContent>
                      <MenuList>
                        {getResourceOptions(filters.operator).map((option) => (
                          <MenuItem key={option.value} itemId={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </MenuList>
                    </MenuContent>
                  </Menu>
                }
              />
            </FlexItem>
          </Flex>
        </div>

        <div className="co-m-pane__body-group">
          {/* Show loading state while checking operators */}
          {operatorsLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
              <Spinner size="xl" />
            </div>
          )}

          {/* Show message if no operators are installed */}
          {!operatorsLoading && !anyOperatorInstalled && (
            <Card>
              <CardBody>
                <NoOperatorsInstalled />
              </CardBody>
            </Card>
          )}

          {/* Show operator sections - only when at least one operator is installed */}
          {!operatorsLoading && anyOperatorInstalled && (
            <Grid hasGutter>
              {/* cert-manager Resources */}
              {shouldShowComponent('cert-manager', 'certificates') && (
                <GridItem span={12}>
                  <Card>
                    <CardTitle>
                      <Flex alignItems={{ default: 'alignItemsCenter' }}>
                        <FlexItem>
                          {t('Certificates')}
                          <Badge isRead style={{ marginLeft: '8px' }}>
                            cert-manager
                          </Badge>
                          <OperatorStatusBadge status={certManager} />
                        </FlexItem>
                      </Flex>
                    </CardTitle>
                    <CardBody>
                      {renderOperatorContent(
                        'cert-manager',
                        () => (
                          <CertificatesTable selectedProject={filters.project} />
                        ),
                        'cert-manager',
                      )}
                    </CardBody>
                  </Card>
                </GridItem>
              )}

              {shouldShowComponent('cert-manager', 'issuers') && (
                <GridItem span={12}>
                  <Card>
                    <CardTitle>
                      <Flex alignItems={{ default: 'alignItemsCenter' }}>
                        <FlexItem>
                          {t('Issuers')}
                          <Badge isRead style={{ marginLeft: '8px' }}>
                            cert-manager
                          </Badge>
                          <OperatorStatusBadge status={certManager} />
                        </FlexItem>
                      </Flex>
                    </CardTitle>
                    <CardBody>
                      {renderOperatorContent(
                        'cert-manager',
                        () => (
                          <IssuersTable selectedProject={filters.project} />
                        ),
                        'cert-manager',
                      )}
                    </CardBody>
                  </Card>
                </GridItem>
              )}

              {/* External Secrets Resources */}
              {shouldShowComponent('external-secrets', 'externalsecrets') && (
                <GridItem span={12}>
                  <Card>
                    <CardTitle>
                      <Flex alignItems={{ default: 'alignItemsCenter' }}>
                        <FlexItem>
                          {t('External Secrets')}
                          <Badge isRead style={{ marginLeft: '8px' }}>
                            External Secrets Operator
                          </Badge>
                          <OperatorStatusBadge status={externalSecrets} />
                        </FlexItem>
                      </Flex>
                    </CardTitle>
                    <CardBody>
                      {renderOperatorContent(
                        'external-secrets',
                        () => (
                          <ExternalSecretsTable selectedProject={filters.project} />
                        ),
                        'external-secrets',
                      )}
                    </CardBody>
                  </Card>
                </GridItem>
              )}

              {shouldShowComponent('external-secrets', 'secretstores') && (
                <GridItem span={12}>
                  <Card>
                    <CardTitle>
                      <Flex alignItems={{ default: 'alignItemsCenter' }}>
                        <FlexItem>
                          {t('Secret Stores')}
                          <Badge isRead style={{ marginLeft: '8px' }}>
                            External Secrets Operator
                          </Badge>
                          <OperatorStatusBadge status={externalSecrets} />
                        </FlexItem>
                      </Flex>
                    </CardTitle>
                    <CardBody>
                      {renderOperatorContent(
                        'external-secrets',
                        () => (
                          <SecretStoresTable selectedProject={filters.project} />
                        ),
                        'external-secrets',
                      )}
                    </CardBody>
                  </Card>
                </GridItem>
              )}

              {shouldShowComponent('external-secrets', 'pushsecrets') && (
                <GridItem span={12}>
                  <Card>
                    <CardTitle>
                      <Flex alignItems={{ default: 'alignItemsCenter' }}>
                        <FlexItem>
                          {t('Push Secrets')}
                          <Badge isRead style={{ marginLeft: '8px' }}>
                            External Secrets Operator
                          </Badge>
                          <OperatorStatusBadge status={externalSecrets} />
                        </FlexItem>
                      </Flex>
                    </CardTitle>
                    <CardBody>
                      {renderOperatorContent(
                        'external-secrets',
                        () => (
                          <PushSecretsTable selectedProject={filters.project} />
                        ),
                        'external-secrets',
                      )}
                    </CardBody>
                  </Card>
                </GridItem>
              )}

              {/* Secrets Store CSI Driver Resources */}
              {shouldShowComponent('secrets-store-csi', 'secretproviderclasses') && (
                <GridItem span={12}>
                  <Card>
                    <CardTitle>
                      <Flex alignItems={{ default: 'alignItemsCenter' }}>
                        <FlexItem>
                          {t('Secret Provider Classes')}
                          <Badge isRead style={{ marginLeft: '8px' }}>
                            Secrets Store CSI Driver
                          </Badge>
                          <OperatorStatusBadge status={secretsStoreCSI} />
                        </FlexItem>
                      </Flex>
                    </CardTitle>
                    <CardBody>
                      {renderOperatorContent(
                        'secrets-store-csi',
                        () => (
                          <SecretProviderClassTable selectedProject={filters.project} />
                        ),
                        'secrets-store-csi',
                      )}
                    </CardBody>
                  </Card>
                </GridItem>
              )}
            </Grid>
          )}
        </div>
      </div>
    </>
  );
}
