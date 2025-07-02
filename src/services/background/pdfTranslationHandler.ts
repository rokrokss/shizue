import { debugLog } from '@/logs';
import { loadPyodide } from 'pyodide';

interface Pyodide {
  runPython: (code: string) => string;
  runPythonAsync: (code: string) => Promise<string>;
  loadPackage: (name: string | string[]) => Promise<void>;
  pyimport: (name: string) => any;
}

export class PdfTranslationHandler {
  private pyodide: Pyodide | null = null;
  private isInitialized = false;

  constructor() {}

  public async initialize() {
    if (this.isInitialized) return;
    const pyodideURL = chrome.runtime.getURL('pyodide/');
    this.pyodide = (await loadPyodide({
      indexURL: pyodideURL,
    })) as unknown as Pyodide;
    const result = await this.pyodide.runPythonAsync('1+1');
    debugLog(result);
    const packagingWheelURL = chrome.runtime.getURL(
      'pyodide_packages/packaging-24.2-py3-none-any.whl'
    );
    const micropipWheelURL = chrome.runtime.getURL(
      'pyodide_packages/micropip-0.9.0-py3-none-any.whl'
    );
    await this.pyodide.loadPackage([packagingWheelURL, micropipWheelURL]);
  }

  public async translatePdf(pdf: string): Promise<string> {
    return 'Hello, world!';
  }
}

let pdfTranslationHandler: PdfTranslationHandler | null = null;

export const getPdfTranslationHandler = (): PdfTranslationHandler => {
  if (!pdfTranslationHandler) {
    pdfTranslationHandler = new PdfTranslationHandler();
  }
  return pdfTranslationHandler;
};

export const ensurePdfTranslationHandler = () => {
  if (!pdfTranslationHandler) {
    pdfTranslationHandler = new PdfTranslationHandler();
  }
  pdfTranslationHandler.initialize();
};
