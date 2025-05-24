import { useTranslation } from 'react-i18next';

export default function StepShortcut({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">{t('onboarding.selectShortcut.title')}</h2>
      <div className="border p-3 rounded mb-6">⌘ + Shift + E</div>
      <div className="flex justify-between">
        <button onClick={onBack} className="text-gray-600">
          Back
        </button>
        <button className="bg-green-500 text-white px-4 py-2 rounded">Done</button>
      </div>
    </div>
  );
}
