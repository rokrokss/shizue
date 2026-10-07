import { LoadingOutlined } from '@ant-design/icons';
import { ReactNode } from 'react';

// A button label that stays in place while loading, hidden under the spinner. antd's `loading`
// swaps the label for the spinner instead, so the button and the input beside it change width
// for a moment on every click.
export const LoadingLabel = ({ loading, children }: { loading: boolean; children: ReactNode }) => (
  <span className="sz:relative sz:inline-flex sz:items-center sz:justify-center">
    <span className={`sz:inline-flex sz:items-center ${loading ? 'sz:invisible' : ''}`}>
      {children}
    </span>
    {loading && <LoadingOutlined className="sz:absolute" />}
  </span>
);
