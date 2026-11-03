import LanguageOptionItem from '@/components/Youtube/LanguageOptionItem';
import type { CaptionDisplayMode, CaptionStyle } from '@/hooks/layout';
import { LoadingOutlined, ReadFilled } from '@ant-design/icons';
import {
  Button,
  ConfigProvider,
  Divider,
  Dropdown,
  MenuProps,
  Popover,
  Space,
  theme,
  Tooltip,
} from 'antd';
import { TFunction } from 'i18next';
import { cloneElement, ReactNode, RefObject } from 'react';

// The caption button and menu shared by the YouTube and Twitch player controls, so both sites
// look and behave the same. Each site supplies its own menu rows and actions.

const rowClassName = `
  sz:flex
  sz:flex-row
  sz:items-center
  sz:justify-between
  sz:gap-4
  sz:cursor-default
  sz:text-[13px]
`;

const stopPropagation = (e: React.MouseEvent) => {
  e.stopPropagation();
};

export const CaptionMenuTitle = ({ label }: { label: string }) => (
  <div
    className="
      sz:flex
      sz:flex-row
      sz:items-center
      sz:gap-2
      sz:cursor-default
      sz:text-[13px]
    "
    onClick={stopPropagation}
  >
    <span className="sz:text-white">{label}</span>
  </div>
);

// A label on the left and a control (switch, number input, value) on the right.
export const CaptionMenuRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className={rowClassName} onClick={stopPropagation}>
    <span className="sz:text-white">{label}</span>
    {children}
  </div>
);

// A row whose value opens a language list beside the menu, to the right unless `side` says left, or
// below the row where there's no room beside the menu. There it covers the menu, so it opens on a
// click rather than on hover, and stays inside the page.
const option = (value: string, label: string) => ({ value, label, desc: label });

// The choices of how captions show and look, the same in every site's menu.
export const captionDisplayOptions = (t: TFunction) =>
  (['translation', 'bilingual', 'translationFirst', 'original'] satisfies CaptionDisplayMode[]).map((value) =>
    option(value, t(`caption.display.${value}`))
  );

export const captionStyleOptions = (t: TFunction) =>
  (['default', 'translucent', 'outline', 'yellow'] satisfies CaptionStyle[]).map((value) =>
    option(value, t(`caption.style.${value}`))
  );

export const CaptionMenuLanguageRow = ({
  label,
  valueLabel,
  options,
  open,
  onOpenChange,
  onSelect,
  side = 'right',
}: {
  label: string;
  valueLabel: string;
  options: { value: string; label: string; desc: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (value: string) => void;
  side?: 'left' | 'right' | 'below';
}) => (
  <Popover
    placement={side === 'left' ? 'leftBottom' : side === 'below' ? 'bottom' : 'rightBottom'}
    trigger={side === 'below' ? 'click' : 'hover'}
    styles={{
      body: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        ...(side === 'below'
          ? {}
          : {
              transform: 'translateY(7px)',
              ...(side === 'left' ? { marginRight: '7px' } : { marginLeft: '7px' }),
            }),
        padding: 0,
      },
    }}
    arrow={false}
    open={open}
    onOpenChange={onOpenChange}
    content={
      <div
        className="
          sz:flex
          sz:flex-col
          sz:rounded-lg
          sz:m-0 sz:p-0
          sz:scrollbar-visible
        "
        style={{
          // No taller than a small frame (an embedded YouTube player) shows.
          maxHeight: 'min(170px, calc(100vh - 16px))',
          overflowY: 'auto',
        }}
      >
        {options.map((option, index) => (
          <LanguageOptionItem
            key={option.value}
            option={option}
            isFirst={index === 0}
            isLast={index === options.length - 1}
            onClick={() => {
              onSelect(option.value);
              onOpenChange(false);
            }}
          />
        ))}
      </div>
    }
  >
    <div className={rowClassName} onClick={stopPropagation}>
      <span className="sz:text-white">{label}</span>
      <span className="sz:text-gray-400">{valueLabel}</span>
    </div>
  </Popover>
);

type CaptionToggleProps = {
  className: string;
  triggerRef: RefObject<HTMLDivElement | null>;
  tooltip: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NonNullable<MenuProps['items']>;
  // Replaces the activate/deactivate buttons, e.g. with a consent prompt.
  footer?: ReactNode;
  activateLabel: string;
  deactivateLabel: string;
  onActivate: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onDeactivate: (e: React.MouseEvent<HTMLButtonElement>) => void;
  isLoading: boolean;
  isActivated: boolean;
  // Netflix sizes the icon like its own controls; YouTube and Twitch keep 24px.
  iconSize?: string;
  // Where the page around the controls would clip the menu, its rows scroll within this height.
  menuMaxHeight?: number;
  // Where the bar under an activated icon starts, from the top of the icon's own box (whose middle
  // is the icon's); by default 10% above the bottom of the controls.
  underlineTop?: string;
};

export const CaptionToggle = ({
  className,
  triggerRef,
  tooltip,
  open,
  onOpenChange,
  items,
  footer,
  activateLabel,
  deactivateLabel,
  onActivate,
  onDeactivate,
  isLoading,
  isActivated,
  iconSize = '24px',
  underlineTop,
  menuMaxHeight,
}: CaptionToggleProps) => (
  <ConfigProvider
    prefixCls="sz-ant-"
    iconPrefixCls="sz-ant-icon-"
    theme={{
      token: {
        colorPrimary: '#32CCBC',
      },
      algorithm: theme.darkAlgorithm,
    }}
  >
    <div className={className} ref={triggerRef}>
      <Tooltip
        placement="top"
        title={tooltip}
        arrow={false}
        styles={{
          body: {
            color: '#E8E9EA',
            backgroundColor: 'rgba(0, 0, 0, 0.72)',
            fontSize: '13px',
            maxHeight: '24px',
            marginBottom: '27px',
            paddingTop: '2px',
            paddingBottom: '2px',
            minHeight: '24px',
            height: '24px',
            borderRadius: '4px',
            display: open ? 'none' : 'block',
          },
        }}
      >
        <Dropdown
          placement="top"
          trigger={['click']}
          overlayStyle={{
            paddingBottom: '24px',
          }}
          open={open}
          onOpenChange={onOpenChange}
          menu={{ items }}
          popupRender={(menu) => (
            <div
              className="
                sz-dropdown-caption-menu
                sz:bg-black/72
                sz:rounded-lg
              "
            >
              {cloneElement(
                menu as React.ReactElement<{
                  style: React.CSSProperties;
                }>,
                {
                  style: {
                    padding: 0,
                    backgroundColor: 'transparent',
                    ...(menuMaxHeight ? { maxHeight: menuMaxHeight, overflowY: 'auto' } : {}),
                  },
                }
              )}
              <Divider style={{ margin: 0 }} />
              {footer ?? (
                <Space
                  style={{ padding: 6 }}
                  className="sz:w-full sz:flex sz:flex-row sz:justify-center sz:items-center sz:gap-4"
                >
                  <Button
                    type="primary"
                    size="small"
                    className="sz:w-full sz:text-[13px]"
                    onClick={onActivate}
                  >
                    {activateLabel}
                  </Button>
                  <Button
                    type="dashed"
                    size="small"
                    className="sz:w-full sz:text-[13px]"
                    onClick={onDeactivate}
                  >
                    {deactivateLabel}
                  </Button>
                </Space>
              )}
            </div>
          )}
        >
          <div
            className="
              sz:flex
              sz:flex-col
              sz:justify-center
              sz:items-center
              sz:h-full
              sz:px-3
              sz:gap-2
              sz:cursor-pointer
            "
            style={underlineTop ? { position: 'relative' } : undefined}
          >
            {isLoading ? (
              <LoadingOutlined
                style={{
                  fontSize: `calc(${iconSize} * 0.875)`,
                  color: 'rgb(255, 255, 255)',
                }}
              />
            ) : (
              <ReadFilled
                style={{
                  fontSize: iconSize,
                  color: 'rgb(255, 255, 255)',
                }}
              />
            )}
            <div
              style={{
                position: 'absolute',
                borderRadius: '20%',
                height: '3px',
                width: isActivated ? iconSize : 0,
                backgroundColor: '#32CCBC',
                ...(underlineTop ? { top: underlineTop } : { bottom: '10%' }),
                transition: 'width 0.5s ease-in-out',
              }}
            />
          </div>
        </Dropdown>
      </Tooltip>
    </div>
  </ConfigProvider>
);
