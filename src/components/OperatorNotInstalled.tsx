import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import {
  EmptyState,
  EmptyStateBody,
  EmptyStateActions,
  EmptyStateVariant,
  Button,
  Content,
  ContentVariants,
  List,
  ListItem,
  Title,
} from '@patternfly/react-core';
import { CubesIcon, ExternalLinkAltIcon } from '@patternfly/react-icons';
import { OPERATOR_INFO, OperatorKey } from '../hooks/useOperatorDetection';

interface OperatorNotInstalledProps {
  operatorKey: OperatorKey;
}

export const OperatorNotInstalled: React.FC<OperatorNotInstalledProps> = ({ operatorKey }) => {
  const { t } = useTranslation('plugin__ocp-secrets-management');
  const history = useHistory();
  const info = OPERATOR_INFO[operatorKey];

  const handleNavigateToOperatorHub = () => {
    history.push(info.operatorHubUrl);
  };

  const handleOpenQuickStart = () => {
    history.push(info.quickStartUrl);
  };

  return (
    <EmptyState variant={EmptyStateVariant.lg} icon={CubesIcon}>
      <Title headingLevel="h4" size="lg">
        {t('{{operatorName}} is not installed', { operatorName: info.displayName })}
      </Title>
      <EmptyStateBody>
        <Content component={ContentVariants.p}>{info.description}</Content>
        <Content component={ContentVariants.p}>
          {t('To use this feature, install the operator by following these steps:')}
        </Content>
        <List>
          {info.installInstructions.map((instruction, index) => (
            <ListItem key={index}>{t(instruction)}</ListItem>
          ))}
        </List>
      </EmptyStateBody>
      <EmptyStateActions>
        <Button variant="primary" onClick={handleNavigateToOperatorHub}>
          {t('Go to Catalog')}
        </Button>
        <Button variant="link" onClick={handleOpenQuickStart} icon={<ExternalLinkAltIcon />}>
          {t('Open Quick Start')}
        </Button>
      </EmptyStateActions>
    </EmptyState>
  );
};

const OPERATOR_KEYS: OperatorKey[] = ['cert-manager', 'external-secrets', 'secrets-store-csi'];

/**
 * Component to show when all operators are not installed
 */
export const NoOperatorsInstalled: React.FC = () => {
  const { t } = useTranslation('plugin__ocp-secrets-management');
  const history = useHistory();

  return (
    <EmptyState variant={EmptyStateVariant.lg} icon={CubesIcon}>
      <Title headingLevel="h4" size="lg">
        {t('No secrets operators installed')}
      </Title>
      <EmptyStateBody>
        <Content component={ContentVariants.p}>
          {t(
            'This plugin provides a unified interface to manage secrets across your OpenShift cluster. To get started, install at least one of the following operators:',
          )}
        </Content>
        <List style={{ textAlign: 'left', maxWidth: '800px', margin: '16px auto' }}>
          {OPERATOR_KEYS.map((key) => {
            const info = OPERATOR_INFO[key];
            return (
              <ListItem key={key} style={{ marginBottom: '12px' }}>
                <strong>{info.displayName}</strong>
                <br />
                <span style={{ color: '#6a6e73' }}>{t(info.description)}</span>
                <br />
                <Button
                  variant="link"
                  isInline
                  icon={<ExternalLinkAltIcon />}
                  onClick={() => history.push(info.quickStartUrl)}
                  style={{ padding: '4px 0' }}
                >
                  {t('Open Quick Start')}
                </Button>
              </ListItem>
            );
          })}
        </List>
        <Content component={ContentVariants.p}>
          {t(
            'Open Quick Starts from the Help menu (?) for guided setup, or go to Catalog to install operators.',
          )}
        </Content>
      </EmptyStateBody>
      <EmptyStateActions>
        <Button variant="primary" onClick={() => history.push('/quickstart')}>
          {t('Open Quick Starts')}
        </Button>
        <Button variant="secondary" onClick={() => history.push('/catalog/ns/default')}>
          {t('Go to Catalog')}
        </Button>
      </EmptyStateActions>
    </EmptyState>
  );
};
