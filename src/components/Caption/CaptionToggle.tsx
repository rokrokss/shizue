import LanguageOptionItem from '@/components/Youtube/LanguageOptionItem';
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

// A row whose value opens a language list to the right of the menu.
export const CaptionMenuLanguageRow = ({
  label,
  valueLabel,
  options,
  open,
  onOpenChange,
  onSelect,
}: {
  label: string;
  valueLabel: string;
  options: { value: string; label: string; desc: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (value: string) => void;
}) => (
  <Popover
    placement="rightBottom"
    styles={{
      body: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        transform: 'translateY(7px)',
        marginLeft: '7px',
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
        "
        style={{
          height: '170px',
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
                  style: { padding: 0, backgroundColor: 'transparent' },
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
          >
            {isLoading ? (
              <LoadingOutlined
                style={{
                  fontSize: '21px',
                  color: 'rgb(255, 255, 255)',
                }}
              />
            ) : (
              <ReadFilled
                style={{
                  fontSize: '24px',
                  color: 'rgb(255, 255, 255)',
                }}
              />
            )}
            <div
              style={{
                position: 'absolute',
                borderRadius: '20%',
                height: '3px',
                width: isActivated ? '24px' : 0,
                backgroundColor: '#32CCBC',
                bottom: '10%',
                transition: 'width 0.5s ease-in-out',
              }}
            />
          </div>
        </Dropdown>
      </Tooltip>
    </div>
  </ConfigProvider>
);
