import CharacterStanding from '@/components/Character/CharacterStanding';
import TypingText from '@/components/Text/TypingText';
import { Button } from 'antd';
import { useTranslation } from 'react-i18next';

export default function StepShortcut({
  onNext,
  isBackClicked,
}: {
  onNext: () => void;
  isBackClicked: boolean;
}) {
  const { t } = useTranslation();
  const [isFirstLineComplete, setIsFirstLineComplete] = useState(false);
  const [isSecondLineComplete, setIsSecondLineComplete] = useState(false);
  const [isThirdLineComplete, setIsThirdLineComplete] = useState(false);
  const [showText, setShowText] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const lines = [
    t('onboarding.greeting_0'),
    t('onboarding.greeting_1'),
    t('onboarding.greeting_2'),
  ];

  const handleFirstLineComplete = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      setIsFirstLineComplete(true);
    }, 300);
  }, []);

  const handleSecondLineComplete = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsSecondLineComplete(true);
    }, 300);
  }, []);

  const handleThirdLineComplete = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsThirdLineComplete(true);
    }, 200);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowText(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="sz:flex sz:flex-col sz:pt-30">
      <div className="sz:flex sz:flex-row sz:items-start sz:w-60">
        <div className="flex-none">
          <CharacterStanding scale={3} marginLeft="0" />
        </div>
        <div
          className={`
            sz:flex-1
            sz:text-lg
            sz:flex
            sz:flex-col
            sz:justify-center
            sz:ml-3
          `}
        >
          {isBackClicked ? (
            <div className="whitespace-pre-wrap sz:min-h-14">
              <div>{lines[0]}</div>
              <div>{lines[1]}</div>
            </div>
          ) : (
            <div className="whitespace-pre-wrap sz:min-h-14">
              {showText && lines[0] && (
                <TypingText text={lines[0]} speed={50} onComplete={handleFirstLineComplete} />
              )}
              {isFirstLineComplete && lines[1] && (
                <TypingText text={lines[1]} speed={50} onComplete={handleSecondLineComplete} />
              )}
            </div>
          )}
        </div>
      </div>
      <div
        className={`
          sz:flex
          sz:flex-col
          sz:items-start
          sz:w-60
          sz:text-sm
          sz:text-gray-500
          sz:pl-1
          sz:pt-[3px]
        `}
      >
        {isBackClicked ? (
          <div>{lines[2]}</div>
        ) : (
          isSecondLineComplete && (
            <TypingText text={lines[2]} speed={50} onComplete={handleThirdLineComplete} />
          )
        )}
      </div>
      {(isThirdLineComplete || isBackClicked) && (
        <Button
          className="sz:mt-3 sz:font-semibold sz:text-base sz:font-ycom"
          type="primary"
          onClick={onNext}
        >
          {t('onboarding.answer_0')}
        </Button>
      )}
    </div>
  );
}
