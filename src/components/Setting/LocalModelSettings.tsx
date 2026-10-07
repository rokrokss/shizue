import { useThemeValue } from '@/hooks/layout';
import { useLocalModel } from '@/hooks/models';
import {
  detectLocalServer,
  LocalServer,
  LocalServerError,
  LocalServerErrorCode,
  normalizeBaseUrl,
  probeLocalServer,
} from '@/lib/localServer';
import { Button, Input, Select } from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Problem = LocalServerErrorCode | 'notFound' | 'noModels' | 'invalidUrl';

// Connects the 'local' slot to a server on this computer: finds Ollama, LM Studio or llama.cpp at
// their default ports, or takes an address, then saves the picked model.
export default function LocalModelSettings({
  className,
  onSaved,
}: {
  className?: string;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const theme = useThemeValue();
  const [localModel, setLocalModel] = useLocalModel();
  const [address, setAddress] = useState(localModel?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState(localModel?.apiKey ?? '');
  const [server, setServer] = useState<LocalServer>();
  const [problem, setProblem] = useState<Problem>();
  const [isLoading, setIsLoading] = useState(false);

  const run = async (find: () => Promise<LocalServer | undefined>) => {
    setIsLoading(true);
    setProblem(undefined);
    try {
      const found = await find();
      setServer(found);
      if (found) setAddress(found.baseUrl);
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

  // Look for a server right away, so most users only have to pick a model.
  useEffect(() => {
    if (localModel) {
      run(() => probeLocalServer(localModel.baseUrl, localModel.apiKey));
    } else {
      onFind();
    }
  }, []);

  const onSelectModel = (id: string) => {
    const model = server?.models.find((m) => m.id === id);
    if (!server || !model) return;
    setLocalModel({
      kind: server.kind,
      baseUrl: server.baseUrl,
      model: model.id,
      apiKey: apiKey.trim() || undefined,
      supportsImages: model.supportsImages,
      supportsThinking: model.supportsThinking,
      contextLength: model.contextLength,
    });
    onSaved?.();
  };

  const selectedHere = localModel && server && localModel.baseUrl === server.baseUrl;
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
      {server && server.models.length > 0 && (
        <Select
          className="sz:font-ycom"
          placeholder={t('local.selectModel')}
          value={selectedHere ? localModel.model : undefined}
          onChange={onSelectModel}
          options={server.models.map((model) => ({
            value: model.id,
            label: model.id,
            className: 'sz:font-ycom',
          }))}
        />
      )}
      {problemMessage ??
        (localModel && (
          <div className={`sz:text-xs ${mutedText} sz:break-all`}>
            {t('local.connected')}: {localModel.model} · {localModel.baseUrl}
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
