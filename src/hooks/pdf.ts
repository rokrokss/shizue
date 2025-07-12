import { STORAGE_PDF_TRANSLATE_NO_DUAL, STORAGE_PDF_TRANSLATE_TASK_INFO } from '@/config/constants';
import { chromeStorageBackend } from '@/lib/storageBackend';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';


export interface TaskInfo {
  task_id: string;
  created_at: string;
}

export const defaultTaskInfo: TaskInfo = {
  task_id: '',
  created_at: new Date().toISOString(),
};

const defaultPdfTranslationNoDual = false;

export const pdfTranslateTaskInfoAtom = atomWithStorage<TaskInfo>(
  STORAGE_PDF_TRANSLATE_TASK_INFO,
  defaultTaskInfo,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const pdfTranslationNoDualAtom = atomWithStorage<boolean>(
  STORAGE_PDF_TRANSLATE_NO_DUAL,
  defaultPdfTranslationNoDual,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const usePdfTranslateTaskInfo = () => useAtom(pdfTranslateTaskInfoAtom);
export const usePdfTranslationNoDual = () => useAtom(pdfTranslationNoDualAtom);
