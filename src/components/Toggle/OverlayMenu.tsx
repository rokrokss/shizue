import { FC, ReactNode } from 'react';

interface OverlayMenuProps {
  children: ReactNode;
}

const OverlayMenu: FC<OverlayMenuProps> = ({ children }) => (
  <div
    className="sz:shadow-lg sz:shadow-cyan-400/20 sz:flex sz:flex-col"
    style={{
      borderRadius: 17,
      background: 'linear-gradient(135deg, #90F7EC 10%, #32CCBC 100%)',
    }}
  >
    {children}
  </div>
);

export default OverlayMenu;
