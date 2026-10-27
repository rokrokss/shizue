import { useAutoMemory } from '@/hooks/autoMemory';
import { useThemeValue } from '@/hooks/layout';
import { Button, Checkbox, List } from 'antd';
import { useTranslation } from 'react-i18next';

// Off until the user turns it on. While on, the background picks lasting facts about the user out
// of each chat they leave and sends them with every chat request; each one can be deleted here.
// Turning it off keeps the facts but stops both.
export default function AutoMemorySettings() {
  const { t } = useTranslation();
  const theme = useThemeValue();
  const [memory, setMemory] = useAutoMemory();

  const deleteFact = (id: string) =>
    void setMemory({ ...memory, facts: memory.facts.filter((fact) => fact.id !== id) });

  return (
    <div className="sz:flex sz:flex-col sz:items-center sz:gap-2">
      <div className={`sz:text-base ${theme == 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'}`}>
        {t('settings.autoMemory')}
      </div>
      <div className="sz:w-68 sz:text-xs sz:text-center sz:text-gray-500 sz:break-keep sz:wrap-anywhere">
        {t('settings.autoMemoryDescription')}
      </div>
      <Checkbox
        checked={memory.enabled}
        onChange={(e) => void setMemory({ ...memory, enabled: e.target.checked })}
        className="sz:font-ycom"
      >
        {t('settings.autoMemoryEnable')}
      </Checkbox>
      {memory.facts.length > 0 ? (
        <>
          <List
            dataSource={memory.facts}
            bordered
            size="small"
            className="sz:w-68 sz:max-h-[200px] sz:overflow-auto"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: `${theme == 'dark' ? '#111' : '#ddd'} transparent`,
            }}
            renderItem={(fact) => (
              <List.Item
                className={`sz:font-ycom ${theme == 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'}`}
              >
                <div className="sz:w-full sz:flex sz:flex-row sz:items-start sz:justify-between sz:gap-2">
                  <div className="sz:text-xs sz:break-keep sz:wrap-anywhere">{fact.text}</div>
                  <Button
                    type="dashed"
                    size="small"
                    className="sz:text-[12px] sz:font-ycom sz:shrink-0"
                    onClick={() => deleteFact(fact.id)}
                  >
                    {t('settings.autoMemoryDelete')}
                  </Button>
                </div>
              </List.Item>
            )}
          />
          <Button
            type="text"
            size="small"
            className="sz:text-[12px] sz:font-ycom"
            onClick={() => void setMemory({ ...memory, facts: [] })}
          >
            {t('settings.autoMemoryClear')}
          </Button>
        </>
      ) : memory.enabled ? (
        <div className="sz:text-xs sz:text-gray-500">{t('settings.autoMemoryEmpty')}</div>
      ) : null}
    </div>
  );
}
