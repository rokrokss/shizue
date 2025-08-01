import StepGetStarted from '@/components/Onboarding/Step0GetStarted';
import { Step1Google } from '@/components/Onboarding/Step1Google';
import StepLanguage from '@/components/Onboarding/Step1Language';
import StepProvider from '@/components/Onboarding/Step2Provider';
import { useAuthContext } from '@/components/Auth/AuthProvider';
import { useState, useEffect } from 'react';

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [isBackClicked, setIsBackClicked] = useState(false);
  const { isAuthenticated } = useAuthContext();

  // Skip Google login step if already authenticated
  useEffect(() => {
    if (step === 1 && isAuthenticated) {
      setStep(2);
    }
  }, [step, isAuthenticated]);

  const goNext = () => setStep((prev) => prev + 1);
  const goBack = () =>
    setStep((prev) => {
      setIsBackClicked(true);
      return Math.max(prev - 1, 0);
    });

  return (
    <div className="sz:w-screen sz:h-screen sz:flex sz:items-start sz:justify-center sz:font-ycom">
      {step === 0 && <StepGetStarted onNext={goNext} isBackClicked={isBackClicked} />}
      {step === 1 && <Step1Google onNext={goNext} />}
      {step === 2 && <StepLanguage onNext={goNext} onBack={goBack} />}
      {step === 3 && <StepProvider onBack={goBack} />}
    </div>
  );
}
