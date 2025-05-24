import StepGetStarted from '@/components/Onboarding/Step0GetStarted';
import StepLanguage from '@/components/Onboarding/Step1Language';
import StepProvider from '@/components/Onboarding/Step2Provider';
import StepShortcut from '@/components/Onboarding/Step3Shortcut';
import { useState } from 'react';

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [isBackClicked, setIsBackClicked] = useState(false);

  const goNext = () => setStep((prev) => prev + 1);
  const goBack = () =>
    setStep((prev) => {
      setIsBackClicked(true);
      return Math.max(prev - 1, 0);
    });

  return (
    <div className="sz:w-screen sz:h-screen sz:flex sz:items-start sz:justify-center sz:font-ycom">
      {step === 0 && <StepGetStarted onNext={goNext} isBackClicked={isBackClicked} />}
      {step === 1 && <StepLanguage onNext={goNext} onBack={goBack} />}
      {step === 2 && <StepProvider onNext={goNext} onBack={goBack} />}
      {step === 3 && <StepShortcut onBack={goBack} />}
    </div>
  );
}
