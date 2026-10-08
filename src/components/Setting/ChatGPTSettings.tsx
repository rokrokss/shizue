import { Button, Alert } from 'antd';
import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useThemeValue } from '@/hooks/layout';
import { useChatGPTConnectionValue, useChatModel, useTranslateModel } from '@/hooks/models';
import { chatGPTModelRef, isChatGPTModel, isSelectableChatGPTModelId, chatGPTModelId, type ChatGPTModelRef } from '@/lib/modelRegistry';
import { chatGPTSettings, chatGPTNeedsSignIn, ChatGPTSettingsError, type ChatGPTConnection, type ChatGPTSettingsOperation } from '@/lib/chatgpt';

export default function ChatGPTSettings({ className, onConnected, onReadyChange, onWelcomeChange, onWelcomeConfirmed }: {
  className?: string;
  onConnected?: (chat: ChatGPTModelRef, translation: ChatGPTModelRef) => void;
  onReadyChange?: (ready: boolean) => void;
  onWelcomeChange?: (visible: boolean) => void;
  onWelcomeConfirmed?: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const theme = useThemeValue();
  const connection = useChatGPTConnectionValue();
  const [chatModel, setChatModel] = useChatModel();
  const [translateModel, setTranslateModel] = useTranslateModel();
  const mounted = useRef(true);
  const requestId = useRef(0);
  const foregroundOperation = useRef<ChatGPTSettingsOperation | null>(null);
  const [pendingOperation, setPendingOperation] = useState<ChatGPTSettingsOperation | null>(null);
  const busy = pendingOperation !== null;
  const [hasChecked, setHasChecked] = useState(false);
  const [error, setError] = useState('');
  const [welcome, setWelcome] = useState<{ chat: ChatGPTModelRef; translation: ChatGPTModelRef } | null>(null);
  const [revocationPending, setRevocationPending] = useState(false);
  const needsSignIn = chatGPTNeedsSignIn(connection);
  const needsConnectionCheck = Boolean(connection.activeId && !connection.connected && !needsSignIn);
  const activeAccount = connection.accounts.find((account) => account.id === connection.activeId);
  // Older helper versions may still return multiple registrations. Only the active
  // connection is displayed; a returning login reuses the last saved registration.
  const savedAccount = activeAccount ?? connection.accounts.at(-1);
  const accountName = (account: ChatGPTConnection['accounts'][number]) => {
    // Older cached status replies appended an internal client ID to the email.
    const suffix = ` · ${account.id.slice(-6)}`;
    return account.label.endsWith(suffix) ? account.label.slice(0, -suffix.length) : account.label;
  };
  const codeClass = `sz:block sz:rounded sz:px-1 sz:py-[2px] sz:break-all sz:select-all ${
    theme === 'dark' ? 'sz:bg-gray-800 sz:text-gray-200' : 'sz:bg-gray-100 sz:text-gray-800'
  }`;
  const primaryLabel = needsSignIn ? 'chatgpt.reconnect' : needsConnectionCheck ? 'chatgpt.retry' : 'chatgpt.continue';

  const apply = (next: ChatGPTConnection, selectModels: boolean, showWelcome: boolean, isCurrent: () => boolean) => {
    if (!isCurrent()) return;
    const models = next.models.filter(({ id }) => isSelectableChatGPTModelId(id));
    setRevocationPending(Boolean(next.revocationPending));
    onReadyChange?.(next.connected && models.length > 0 && !showWelcome);
    if (next.errorCode) setError(t(chatGPTNeedsSignIn(next) ? 'chatgpt.signInRequired' : 'chatgpt.reconnectError'));
    if (!next.connected || !models.length) return;
    const available = (model: string) => isChatGPTModel(model) && models.some((m) => m.id === chatGPTModelId(model));
    const chat = available(chatModel) ? chatModel as ChatGPTModelRef : chatGPTModelRef(models[0].id);
    const translation = available(translateModel) ? translateModel as ChatGPTModelRef : chatGPTModelRef(models.find((m) => /luna|mini/i.test(m.id))?.id || models[0].id);
    if (selectModels) { setChatModel(chat); setTranslateModel(translation); }
    // First sign-in is complete only after the user acknowledges the usage notice.
    if (showWelcome) {
      setWelcome({ chat, translation });
      onWelcomeChange?.(true);
    }
    else onConnected?.(chat, translation);
  };
  const run = async (operation: ChatGPTSettingsOperation, accountId?: string, automatic = false) => {
    if (foregroundOperation.current) return;
    const id = ++requestId.current;
    const isCurrent = () => mounted.current && requestId.current === id;
    setError('');
    if (!automatic) {
      foregroundOperation.current = operation;
      setPendingOperation(operation);
      onReadyChange?.(false);
    }
    try {
      // Read the first-sign-in flag during authentication, not after the UI is ready.
      // Background status checks must never show the welcome notice.
      const [next, flags] = await Promise.all([
        chatGPTSettings(operation, accountId),
        operation === 'signIn' ? chrome.storage.local.get('CHATGPT_WELCOME_SEEN') : undefined,
      ]);
      apply(next, operation === 'signIn', operation === 'signIn' && !flags?.CHATGPT_WELCOME_SEEN, isCurrent);
      if (isCurrent() && operation === 'signOut' && next.requiresOnboarding) navigate('/onboarding', { replace: true });
    } catch (error) {
      if (isCurrent()) {
        const errorLabels: Record<string, string> = {
          request_timeout: 'chatgpt.timeout',
          account_unavailable: 'chatgpt.accountUnavailable',
          account_already_registered: 'chatgpt.accountAlreadyRegistered',
          duplicate_account_revocation_pending: 'chatgpt.duplicateAccountRevocationPending',
        };
        const label = error instanceof ChatGPTSettingsError && errorLabels[error.code];
        setError(label ? t(label) : (error as Error).message);
      }
    } finally {
      if (isCurrent()) {
        foregroundOperation.current = null;
        setPendingOperation(null);
        setHasChecked(true);
      }
    }
  };
  useEffect(() => {
    mounted.current = true;
    void run('status', undefined, true);
    return () => { mounted.current = false; requestId.current++; foregroundOperation.current = null; };
  }, []);

  const feedback = <>
    {revocationPending && <Alert className="sz:font-ycom sz:text-right" type="warning" message={t('chatgpt.revocationPending')} />}
    {error && <Alert className="sz:font-ycom sz:text-right" type="error" message={error} />}
  </>;

  if (welcome) return (
    <section className={`sz:flex sz:flex-col sz:gap-3 sz:font-ycom sz:text-center sz:min-w-0 sz:max-w-full ${className || ''}`}>
      <h2 className="sz:text-lg sz:font-semibold">{t('chatgpt.welcomeTitle')}</h2>
      <p className={`sz:text-sm sz:leading-6 ${theme === 'dark' ? 'sz:text-gray-300' : 'sz:text-gray-600'}`}>
        {t('chatgpt.welcomeDescription')}
      </p>
      <Button
        type="primary"
        className="sz:font-semibold sz:text-base sz:font-ycom sz:h-8 sz:w-full"
        style={{ color: theme === 'dark' ? '#000' : 'white' }}
        onClick={() => {
          void chrome.storage.local.set({ CHATGPT_WELCOME_SEEN: true });
          setWelcome(null);
          onWelcomeChange?.(false);
          onConnected?.(welcome.chat, welcome.translation);
          onReadyChange?.(true);
          onWelcomeConfirmed?.();
        }}
      >{t('chatgpt.gotIt')}</Button>
    </section>
  );

  return (
    <div className={`sz:flex sz:flex-col sz:gap-2 sz:font-ycom sz:min-w-0 sz:max-w-full ${className || ''}`}>
      {connection.activeId && <div className="sz:flex sz:flex-col sz:items-center sz:gap-1 sz:w-full sz:min-w-0">
        <span className={`sz:w-full sz:min-w-0 sz:truncate sz:text-center sz:text-sm ${theme === 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'}`}
          title={activeAccount ? accountName(activeAccount) : undefined}>
          {activeAccount ? accountName(activeAccount) : t('chatgpt.account')}
        </span>
        <Button className="sz:font-ycom sz:shrink-0" size="small" loading={pendingOperation === 'signOut'} disabled={busy}
          onClick={() => void run('signOut', connection.activeId!)}>{t('chatgpt.signOut')}</Button>
      </div>}
      {!connection.connected && (
        <Button
          type="primary"
          className="sz:font-ycom sz:min-w-0 sz:font-semibold sz:text-base sz:h-8 sz:w-full"
          loading={pendingOperation === 'signIn' || (needsConnectionCheck && pendingOperation === 'status')}
          disabled={busy}
          style={busy ? undefined : { color: theme === 'dark' ? '#000' : 'white' }}
          onClick={() => void run(needsConnectionCheck ? 'status' : 'signIn', savedAccount?.id)}
        >
          {t(primaryLabel)}
        </Button>
      )}
      {!connection.installed && hasChecked && (
        <Alert className="sz:font-ycom sz:text-right" type="info" message={t('chatgpt.helperTitle')} description={
          <div className="sz:text-xs">
            <p>{t('chatgpt.helperDescription')}</p>
            <code className={codeClass}>pnpm chatgpt:install --extension-id {chrome.runtime.id}</code>
            <div className="sz:flex sz:flex-wrap sz:items-center sz:justify-end sz:gap-2 sz:mt-1">
              <Button
                type="link"
                size="small"
                href="https://github.com/rokrokss/shizue#sign-in-with-chatgpt"
                target="_blank"
                rel="noreferrer"
                className="sz:font-ycom sz:text-xs sz:p-0 sz:h-auto"
              >{t('chatgpt.setupInstructions')}</Button>
              <Button className="sz:font-ycom" size="small" loading={pendingOperation === 'status'} disabled={busy} onClick={() => void run('status')}>{t('chatgpt.retry')}</Button>
            </div>
          </div>
        } />
      )}
      {feedback}
    </div>
  );
}
