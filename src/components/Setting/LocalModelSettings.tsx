import { LoadingLabel } from '@/components/Loader/LoadingLabel';
import { useThemeValue } from '@/hooks/layout';
import { useLocalServer } from '@/hooks/models';
import {
  detectLocalServer,
  isDefaultServer,
  LocalServerError,
  LocalServerErrorCode,
  normalizeBaseUrl,
  probeLocalServer,
} from '@/lib/localServer';
import { LocalModelRef, localModelRef, LocalServerConfig } from '@/lib/modelRegistry';
import { Button, Input, Select, Tag } from 'antd';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// While nothing usable is connected, check again this often, so starting the server or pulling a
// model is all the user has to do. A check only lists models; it never loads one.
const RECHECK_MS = 3000;

// Where checks look: the default addresses of Ollama, LM Studio and llama.cpp, or the one address
// the user entered.
type Target = 'defaults' | { baseUrl: string; apiKey?: string };

type Status =
  | { state: 'checking' }
  | { state: 'connected'; server: LocalServerConfig }
  | { state: 'noModels'; server: LocalServerConfig }
  | { state: 'notFound' }
  | { state: 'offline'; baseUrl: string };

type FormError = LocalServerErrorCode | 'invalidUrl';

const RECHECKED_STATES: Status['state'][] = ['noModels', 'notFound', 'offline'];

const displayAddress = (baseUrl: string) => baseUrl.replace(/^https?:\/\//, '');

// Connects a server on this computer and shows what it found: the server, its chat models (which
// the chat and translation model pickers then list), or what to do next. The address field only
// appears when the user asks for another address. Onboarding has no pickers, so there it also
// asks for a model (`pickModel`) and reports it for both uses.
export default function LocalModelSettings({
  className,
  pickModel,
  onModelPicked,
}: {
  className?: string;
  pickModel?: boolean;
  onModelPicked?: (model: LocalModelRef) => void;
}) {
  const { t } = useTranslation();
  const theme = useThemeValue();
  const [localServer, setLocalServer] = useLocalServer();
  // A saved server shows as connected right away and is re-checked quietly, so opening the
  // settings doesn't flash a checking state.
  const [status, setStatus] = useState<Status>(
    localServer ? { state: 'connected', server: localServer } : { state: 'checking' }
  );
  const [target, setTarget] = useState<Target>(
    localServer && !isDefaultServer(localServer.baseUrl)
      ? { baseUrl: localServer.baseUrl, apiKey: localServer.apiKey }
      : 'defaults'
  );
  const [isEditing, setIsEditing] = useState(false);
  const [address, setAddress] = useState('');
  const [apiKey, setApiKey] = useState(localServer?.apiKey ?? '');
  const [formError, setFormError] = useState<FormError>();
  const [isConnecting, setIsConnecting] = useState(false);
  const [pickedModel, setPickedModel] = useState<string>();
  // Each check or connect takes a number; a result that is no longer the latest is dropped.
  const latestRequest = useRef(0);

  const show = (server: LocalServerConfig | undefined) => {
    if (!server) {
      setStatus({ state: 'notFound' });
    } else if (server.models.length === 0) {
      setStatus({ state: 'noModels', server });
    } else {
      setLocalServer(server);
      setStatus({ state: 'connected', server });
    }
  };

  const check = async (checkTarget: Target) => {
    const request = ++latestRequest.current;
    if (checkTarget === 'defaults') {
      // The saved server first, so having both Ollama and LM Studio running doesn't switch servers.
      const saved =
        localServer && isDefaultServer(localServer.baseUrl)
          ? await probeLocalServer(localServer.baseUrl).catch(() => undefined)
          : undefined;
      const found = saved?.models.length ? saved : await detectLocalServer();
      if (request === latestRequest.current) show(found);
      return;
    }
    try {
      const found = await probeLocalServer(checkTarget.baseUrl, checkTarget.apiKey);
      if (request === latestRequest.current) show(found);
    } catch (err) {
      if (request !== latestRequest.current) return;
      const code = err instanceof LocalServerError ? err.code : 'unreachable';
      if (code === 'unreachable') {
        setStatus({ state: 'offline', baseUrl: checkTarget.baseUrl });
      } else {
        // A key or Ollama's origin setting has to change, which only the user can do.
        openEditor(checkTarget.baseUrl);
        setFormError(code);
      }
    }
  };

  // Check on open (refreshing the saved server's models), then keep checking while nothing usable
  // is connected.
  useEffect(() => {
    check(target);
  }, []);
  useEffect(() => {
    if (isEditing || !RECHECKED_STATES.includes(status.state)) return;
    const timer = setTimeout(() => check(target), RECHECK_MS);
    return () => clearTimeout(timer);
  }, [status, target, isEditing]);

  const currentAddress = () => {
    if (status.state === 'connected' || status.state === 'noModels') return status.server.baseUrl;
    if (status.state === 'offline') return status.baseUrl;
    return '';
  };

  const openEditor = (baseUrl = currentAddress()) => {
    latestRequest.current++;
    setAddress(displayAddress(baseUrl));
    setFormError(undefined);
    setIsEditing(true);
  };

  const onConnect = async () => {
    if (isConnecting) return;
    const baseUrl = normalizeBaseUrl(address);
    if (!baseUrl) {
      setFormError('invalidUrl');
      return;
    }
    const key = apiKey.trim() || undefined;
    const request = ++latestRequest.current;
    setIsConnecting(true);
    try {
      const found = await probeLocalServer(baseUrl, key);
      if (request !== latestRequest.current) return;
      setTarget({ baseUrl, apiKey: key });
      setIsEditing(false);
      setFormError(undefined);
      show(found);
    } catch (err) {
      // The previous error stays until this one replaces it, so the form doesn't jump.
      if (request === latestRequest.current) {
        setFormError(err instanceof LocalServerError ? err.code : 'unreachable');
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const onFindAutomatically = () => {
    setIsEditing(false);
    setFormError(undefined);
    setTarget('defaults');
    check('defaults');
  };

  const onSelectModel = (id: string) => {
    setPickedModel(id);
    onModelPicked?.(localModelRef(id));
  };

  const muted = theme == 'dark' ? 'sz:text-gray-400' : 'sz:text-gray-500';
  const strong = theme == 'dark' ? 'sz:text-gray-100' : 'sz:text-gray-800';
  const codeClass = `sz:px-1 sz:py-[2px] sz:rounded sz:break-all sz:select-all ${
    theme == 'dark' ? 'sz:bg-gray-800 sz:text-gray-200' : 'sz:bg-gray-100 sz:text-gray-800'
  }`;

  const link = (label: string, onClick: () => void) => (
    <Button
      type="link"
      size="small"
      className="sz:font-ycom sz:self-start sz:p-0 sz:h-auto"
      onClick={onClick}
    >
      {label}
    </Button>
  );

  // Name, address and models each stay on one line; lines break only between them.
  const serverLine = (server: { baseUrl: string; serverName?: string }, online: boolean) => (
    <div className="sz:flex sz:flex-row sz:flex-wrap sz:items-center sz:gap-x-[6px]">
      <span
        className={`sz:inline-block sz:w-[7px] sz:h-[7px] sz:rounded-full ${
          online ? 'sz:bg-[#32CCBC]' : 'sz:bg-gray-400'
        }`}
      />
      {server.serverName && (
        <span className={`sz:whitespace-nowrap sz:font-semibold ${strong}`}>
          {server.serverName}
        </span>
      )}
      <span className={`sz:whitespace-nowrap ${muted}`}>{displayAddress(server.baseUrl)}</span>
    </div>
  );

  const message = (title: string, hint: string) => (
    <div className="sz:flex sz:flex-col">
      <span className={`sz:font-semibold ${strong}`}>{title}</span>
      <span className={muted}>{hint}</span>
    </div>
  );

  let content: ReactNode = null;
  if (isEditing) {
    content = (
      <>
        <span className={muted}>{t('local.serverAddress')}</span>
        <Input
          className="sz:font-ycom sz:text-sm sz:h-8"
          placeholder="localhost:11434"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onPressEnter={onConnect}
          autoFocus
        />
        {(formError === 'unauthorized' || apiKey) && (
          <Input.Password
            className="sz:font-ycom sz:text-sm sz:h-8"
            placeholder={t('local.apiKeyOptional')}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onPressEnter={onConnect}
          />
        )}
        <div className="sz:flex sz:flex-row sz:flex-wrap sz:items-center sz:gap-x-3 sz:gap-y-1">
          <Button
            className="sz:font-semibold sz:text-base sz:font-ycom sz:h-8"
            type="primary"
            onClick={onConnect}
            style={{ color: theme == 'dark' ? '#000' : 'white' }}
          >
            <LoadingLabel loading={isConnecting}>{t('local.connect')}</LoadingLabel>
          </Button>
          {link(t('local.findAutomatically'), onFindAutomatically)}
        </div>
        {formError && (
          <div className="sz:flex sz:flex-col sz:gap-1 sz:text-red-500">
            <span>{t(`local.${formError}`)}</span>
            {formError === 'forbidden' && (
              <code className={codeClass}>
                OLLAMA_ORIGINS=chrome-extension://{chrome.runtime.id}
              </code>
            )}
          </div>
        )}
      </>
    );
  } else if (status.state === 'connected') {
    content = (
      <>
        {serverLine(status.server, true)}
        <div className="sz:flex sz:flex-row sz:flex-wrap sz:gap-y-1">
          {status.server.models.map((model) => (
            <Tag key={model.id} style={{ fontSize: '11px' }}>
              {model.id}
            </Tag>
          ))}
        </div>
        {pickModel && (
          <Select
            className="sz:font-ycom"
            placeholder={t('local.selectModel')}
            value={pickedModel}
            onChange={onSelectModel}
            options={status.server.models.map((model) => ({
              value: model.id,
              label: model.id,
              className: 'sz:font-ycom',
            }))}
          />
        )}
        {link(t('local.changeAddress'), () => openEditor())}
      </>
    );
  } else if (status.state === 'noModels') {
    const isOllama = status.server.kind === 'ollama';
    content = (
      <>
        {serverLine(status.server, false)}
        {message(
          t('local.noModelsTitle'),
          t(isOllama ? 'local.noModelsHintOllama' : 'local.noModelsHint')
        )}
        {isOllama && <code className={`${codeClass} sz:self-start`}>ollama pull gemma4:12b</code>}
        {link(t('local.useOtherAddress'), () => openEditor())}
      </>
    );
  } else if (status.state === 'notFound') {
    content = (
      <>
        {message(t('local.notFoundTitle'), t('local.notFoundHint'))}
        {link(t('local.useOtherAddress'), () => openEditor())}
      </>
    );
  } else if (status.state === 'offline') {
    content = (
      <>
        {serverLine({ baseUrl: status.baseUrl }, false)}
        {message(t('local.offlineTitle'), t('local.offlineHint'))}
        {link(t('local.changeAddress'), () => openEditor())}
      </>
    );
  }

  // keep-all breaks Korean between words; anywhere lets a long unspaced run (Chinese, Japanese,
  // an address) still wrap instead of overflowing.
  return (
    <div
      className={`sz:flex sz:flex-col sz:gap-[6px] sz:text-xs sz:leading-[1.5] sz:break-keep sz:wrap-anywhere ${
        className ?? ''
      }`}
    >
      {content}
    </div>
  );
}
