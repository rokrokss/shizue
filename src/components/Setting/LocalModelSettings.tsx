import { useThemeValue } from '@/hooks/layout';
import { useLocalServer } from '@/hooks/models';
import {
  detectLocalServer,
  LocalServerError,
  LocalServerErrorCode,
  normalizeBaseUrl,
  probeLocalServer,
} from '@/lib/localServer';
import { LocalModelRef, localModelRef, LocalServerConfig } from '@/lib/modelRegistry';
import { Button, Input, Select } from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Problem = LocalServerErrorCode | 'notFound' | 'noModels' | 'invalidUrl';

// Connects a server on this computer: finds Ollama, LM Studio or llama.cpp at their default ports,
// or takes an address, and saves the server with its chat models, which the chat and translation
// model pickers then list. Onboarding has no pickers, so there it also asks for a model
// (`pickModel`) and reports it for both uses.
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
  const [address, setAddress] = useState(localServer?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState(localServer?.apiKey ?? '');
  const [server, setServer] = useState<LocalServerConfig>();
  const [pickedModel, setPickedModel] = useState<string>();
  const [problem, setProblem] = useState<Problem>();
  const [isLoading, setIsLoading] = useState(false);

  const run = async (find: () => Promise<LocalServerConfig | undefined>) => {
    setIsLoading(true);
    setProblem(undefined);
    try {
      const found = await find();
      setServer(found);
      if (found) setAddress(found.baseUrl);
      if (found && found.models.length > 0) setLocalServer(found);
      setProblem(!found ? 'notFound' : found.models.length === 0 ? 'noModels' : undefined);
    } catch (err) {
      setServer(undefined);
      setProblem(err instanceof LocalServerError ? err.code : 'unreachable');
    }
    setIsLoading(false);
  };

  const onFind = () => run(detectLocalServer);

  const onConnect = () => {
    const baseUrl = normalizeBaseUrl(address);
    if (!baseUrl) {
      setProblem('invalidUrl');
      return;
    }
    run(() => probeLocalServer(baseUrl, apiKey.trim() || undefined));
  };

  // Look for a server right away (or refresh the saved one's model list), so most users only have
  // to pick a model.
  useEffect(() => {
    if (localServer) {
      run(() => probeLocalServer(localServer.baseUrl, localServer.apiKey));
    } else {
      onFind();
    }
  }, []);

  const onSelectModel = (id: string) => {
    setPickedModel(id);
    onModelPicked?.(localModelRef(id));
  };
  const mutedText = theme == 'dark' ? 'sz:text-gray-400' : 'sz:text-gray-500';
  const codeClass = `sz:block sz:mt-1 sz:px-1 sz:py-[2px] sz:rounded sz:break-all sz:select-all ${
    theme == 'dark' ? 'sz:bg-gray-800 sz:text-gray-200' : 'sz:bg-gray-100 sz:text-gray-800'
  }`;

  const problemMessage = problem && (
    <div className="sz:text-xs sz:text-red-500 sz:whitespace-pre-wrap">
      {t(`local.${problem}`)}
      {problem === 'forbidden' && (
        <code className={codeClass}>OLLAMA_ORIGINS=chrome-extension://{chrome.runtime.id}</code>
      )}
      {problem === 'noModels' && <code className={codeClass}>ollama pull gemma4:12b</code>}
    </div>
  );

  return (
    <div className={`sz:flex sz:flex-col sz:gap-[6px] ${className ?? ''}`}>
      <div className="sz:flex sz:flex-row sz:items-center">
        <Input
          className="sz:font-ycom sz:text-sm sz:mr-[5px] sz:h-8"
          placeholder="http://localhost:11434"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onPressEnter={onConnect}
        />
        <Button
          className="sz:font-semibold sz:text-base sz:font-ycom sz:h-8"
          type="primary"
          onClick={onConnect}
          loading={isLoading}
          style={{ color: theme == 'dark' ? '#000' : 'white' }}
        >
          {!isLoading && t('local.connect')}
        </Button>
      </div>
      {(server?.kind === 'openai-compatible' || problem === 'unauthorized' || apiKey) && (
        <Input.Password
          className="sz:font-ycom sz:text-sm sz:h-8"
          placeholder={t('local.apiKeyOptional')}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onPressEnter={onConnect}
        />
      )}
      {pickModel && server && server.models.length > 0 && (
        <Select
          className="sz:font-ycom"
          placeholder={t('local.selectModel')}
          value={pickedModel}
          onChange={onSelectModel}
          options={server.models.map((model) => ({
            value: model.id,
            label: model.id,
            className: 'sz:font-ycom',
          }))}
        />
      )}
      {problemMessage ??
        (localServer && (
          <div className={`sz:text-xs ${mutedText} sz:break-all`}>
            {t('local.connected')}: {localServer.baseUrl} ·{' '}
            {localServer.models.map((model) => model.id).join(', ')}
          </div>
        ))}
      <Button
        type="link"
        size="small"
        className="sz:font-ycom sz:self-start sz:p-0 sz:h-auto"
        onClick={onFind}
        disabled={isLoading}
      >
        {t('local.find')}
      </Button>
    </div>
  );
}
