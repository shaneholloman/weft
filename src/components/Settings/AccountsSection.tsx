import { Button } from '../common';
import type { BoardCredential } from '../../types';
import './AccountsSection.css';

/**
 * Account definitions for the UI
 * These match the accounts in worker/mcp/AccountMCPRegistry.ts
 */
const ACCOUNTS = [
  {
    id: 'google',
    name: 'Google',
    credentialType: 'google_oauth',
    description: 'Gmail, Google Docs, and more',
    icon: (
      <svg viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    ),
  },
  // Future accounts can be added here:
  // {
  //   id: 'microsoft',
  //   name: 'Microsoft',
  //   credentialType: 'microsoft_oauth',
  //   description: 'Outlook, OneDrive, Teams',
  //   icon: <MicrosoftIcon />,
  // },
];

interface AccountsSectionProps {
  credentials: BoardCredential[];
  onConnect: (accountId: string) => void;
  onDisconnect: (credentialId: string) => void;
  connecting: string | null;
}

export function AccountsSection({
  credentials,
  onConnect,
  onDisconnect,
  connecting,
}: AccountsSectionProps) {
  const getCredential = (credentialType: string) =>
    credentials.find((c) => c.type === credentialType);

  const getConnectionInfo = (cred: BoardCredential) => {
    if (cred.metadata?.email) return cred.metadata.email as string;
    if (cred.metadata?.login) return cred.metadata.login as string;
    return 'Connected';
  };

  const hasAnyAccount = ACCOUNTS.some((account) =>
    getCredential(account.credentialType)
  );

  return (
    <div className="accounts-section">
      {ACCOUNTS.map((account) => {
        const credential = getCredential(account.credentialType);
        const isConnecting = connecting === account.id;

        return (
          <div
            key={account.id}
            className={`account-card ${credential ? 'connected' : ''}`}
          >
            <div className="account-card-left">
              <div className="account-card-icon">{account.icon}</div>
              <div className="account-card-info">
                <span className="account-card-name">{account.name}</span>
                <span className="account-card-meta">
                  {credential
                    ? getConnectionInfo(credential)
                    : account.description}
                </span>
              </div>
            </div>
            <div className="account-card-actions">
              {credential ? (
                <button
                  className="account-disconnect-btn"
                  onClick={() => onDisconnect(credential.id)}
                  title="Disconnect"
                >
                  Disconnect
                </button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onConnect(account.id)}
                  disabled={isConnecting}
                >
                  {isConnecting ? 'Connecting...' : 'Connect'}
                </Button>
              )}
            </div>
          </div>
        );
      })}

      {!hasAnyAccount && (
        <p className="accounts-hint">
          Connect an account to enable its associated MCP servers
        </p>
      )}
    </div>
  );
}
