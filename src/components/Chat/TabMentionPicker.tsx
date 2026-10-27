import { attachRowClass, isWebTab, TabSummary } from '@/components/Chat/AttachMenu';
import { MAX_ATTACHED_TABS } from '@/config/constants';
import { useThemeValue } from '@/hooks/layout';
import { AppstoreAddOutlined } from '@ant-design/icons';
import { Popover } from 'antd';
import { forwardRef, ReactNode, useEffect, useImperativeHandle, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Chrome's tab group colors, as its tab strip draws them.
const GROUP_COLORS: Record<string, string> = {
  grey: '#5F6368',
  blue: '#1A73E8',
  red: '#D93025',
  yellow: '#F9AB00',
  green: '#188038',
  pink: '#D01884',
  purple: '#A142F4',
  cyan: '#007B83',
  orange: '#FA903E',
};

type Row =
  | { kind: 'group'; group: chrome.tabGroups.TabGroup; tabs: chrome.tabs.Tab[] }
  | { kind: 'tab'; tab: chrome.tabs.Tab }
  | { kind: 'allowGroups' };

export interface TabMentionPickerHandle {
  // Arrow keys, Enter, Tab and Escape while the list is open; true when the key was used.
  handleKey: (e: React.KeyboardEvent) => boolean;
}

// Typing @ in the chat box lists this window's web tabs, and its tab groups once the user lets
// Shizue read their names (the optional tabGroups permission, asked for here, not at install).
// The text after @ narrows the list; picking a tab or group attaches it.
const TabMentionPicker = forwardRef<
  TabMentionPickerHandle,
  {
    query: string | null;
    attachedTabIds: number[];
    attachedCount: number;
    onPick: (tabs: chrome.tabs.Tab[]) => void;
    onClose: () => void;
    children: ReactNode;
  }
>(({ query, attachedTabIds, attachedCount, onPick, onClose, children }, ref) => {
  const { t } = useTranslation();
  const theme = useThemeValue();
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);
  const [groups, setGroups] = useState<chrome.tabGroups.TabGroup[] | null>(null);
  const [active, setActive] = useState(0);
  const open = query !== null;
  const room = MAX_ATTACHED_TABS - attachedCount;

  const load = async () => {
    setTabs((await chrome.tabs.query({ currentWindow: true })).filter(isWebTab));
    const allowed = await chrome.permissions.contains({ permissions: ['tabGroups'] });
    setGroups(
      allowed ? await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }) : null
    );
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  useEffect(() => setActive(0), [query]);

  const needle = (query ?? '').toLowerCase();
  const matches = (text?: string) => (text ?? '').toLowerCase().includes(needle);
  const pickable = (tab: chrome.tabs.Tab) => !attachedTabIds.includes(tab.id!) && !tab.discarded;
  const rows: Row[] = [
    ...(groups ?? [])
      .map((group) => ({
        kind: 'group' as const,
        group,
        tabs: tabs.filter((tab) => tab.groupId === group.id && pickable(tab)),
      }))
      .filter((row) => row.tabs.length > 0 && matches(row.group.title || t('chat.untitledGroup'))),
    ...tabs
      .filter((tab) => pickable(tab) && (matches(tab.title) || matches(new URL(tab.url!).host)))
      .map((tab) => ({ kind: 'tab' as const, tab })),
    ...(groups === null && !needle ? [{ kind: 'allowGroups' as const }] : []),
  ];

  const pick = async (row: Row) => {
    if (row.kind === 'allowGroups') {
      // Chrome shows its own prompt; the chat box gets focus back once it closes.
      if (await chrome.permissions.request({ permissions: ['tabGroups'] })) await load();
      return;
    }
    if (room <= 0) return;
    onPick(row.kind === 'group' ? row.tabs.slice(0, room) : [row.tab]);
  };

  useImperativeHandle(ref, () => ({
    handleKey: (e) => {
      if (!open) return false;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (rows.length === 0) return false;
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActive((current) => (current + step + rows.length) % rows.length);
      } else if ((e.key === 'Enter' || e.key === 'Tab') && rows[active]) {
        void pick(rows[active]);
      } else {
        return false;
      }
      e.preventDefault();
      return true;
    },
  }));

  const content = (
    // mousedown would move focus out of the chat box and close the list before the click lands.
    <div
      className="sz-tab-mention sz:font-ycom sz:w-64 sz:max-h-72 sz:overflow-y-auto sz:flex sz:flex-col"
      onMouseDown={(e) => e.preventDefault()}
    >
      {room <= 0 ? (
        <div className="sz:text-xs sz:text-gray-500 sz:px-2 sz:py-1">
          {t('chat.attachLimit', { max: MAX_ATTACHED_TABS })}
        </div>
      ) : null}
      {rows.length === 0 ? (
        <div className="sz:text-xs sz:text-gray-500 sz:px-2 sz:py-2">
          {t('chat.noMatchingTabs')}
        </div>
      ) : (
        rows.map((row, index) => (
          <button
            key={
              row.kind === 'group'
                ? `group-${row.group.id}`
                : row.kind === 'tab'
                  ? `tab-${row.tab.id}`
                  : 'allow'
            }
            type="button"
            disabled={row.kind !== 'allowGroups' && room <= 0}
            onMouseEnter={() => setActive(index)}
            onClick={() => void pick(row)}
            className={attachRowClass(
              row.kind !== 'allowGroups' && room <= 0,
              theme,
              index === active
            )}
          >
            {row.kind === 'group' ? (
              <>
                <span
                  className="sz:w-3 sz:h-3 sz:shrink-0 sz:rounded-full sz:mx-0.5"
                  style={{ backgroundColor: GROUP_COLORS[row.group.color] ?? GROUP_COLORS.grey }}
                />
                <div className="sz:min-w-0 sz:flex-1">
                  <div className="sz:truncate sz:text-sm">
                    {row.group.title || t('chat.untitledGroup')}
                  </div>
                  <div className="sz:truncate sz:text-xs sz:text-gray-500">
                    {t('chat.groupTabs', { count: row.tabs.length })}
                  </div>
                </div>
              </>
            ) : row.kind === 'tab' ? (
              <TabSummary tab={row.tab} />
            ) : (
              <>
                <AppstoreAddOutlined className="sz:shrink-0" />
                <div className="sz:min-w-0 sz:flex-1">
                  <div className="sz:text-sm">{t('chat.showTabGroups')}</div>
                  <div className="sz:text-xs sz:text-gray-500">{t('chat.showTabGroupsHint')}</div>
                </div>
              </>
            )}
          </button>
        ))
      )}
    </div>
  );

  return (
    <Popover content={content} open={open} placement="topLeft" arrow={false} trigger={[]}>
      {/* The list is placed against a DOM element; the chat box's ref is not one. */}
      <div className="sz:flex sz:flex-col sz:flex-1 sz:min-h-0 sz:w-full">{children}</div>
    </Popover>
  );
});

export default TabMentionPicker;
