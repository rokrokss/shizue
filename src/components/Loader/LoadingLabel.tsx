import { LoadingOutlined } from '@ant-design/icons';
import { ReactNode, useEffect, useState } from 'react';

// Work that ends sooner than this (e.g. probing a local server) shows no spinner at all; a spinner
// that appears and vanishes within a few frames reads as flicker.
const SPINNER_DELAY_MS = 300;

// A button label that stays in place while loading, hidden under the spinner. antd's `loading`
// swaps the label for the spinner instead, so the button and the input beside it change width
// for a moment on every click.
export const LoadingLabel = ({ loading, children }: { loading: boolean; children: ReactNode }) => {
  const [showSpinner, setShowSpinner] = useState(false);

  useEffect(() => {
    if (!loading) {
      setShowSpinner(false);
      return;
    }
    const timer = setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  return (
    <span className="sz:relative sz:inline-flex sz:items-center sz:justify-center">
      <span className={`sz:inline-flex sz:items-center ${showSpinner ? 'sz:invisible' : ''}`}>
        {children}
      </span>
      {showSpinner && <LoadingOutlined className="sz:absolute" />}
    </span>
  );
};
