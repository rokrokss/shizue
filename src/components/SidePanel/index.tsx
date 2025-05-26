import Footer from '@/components/Footer';
import { useSettings } from '@/hooks/useSettings';

const SidePanel = () => {
  const [settings, _] = useSettings();

  return (
    <div className="sz-sidepanel sz:flex sz:flex-col sz:h-screen sz:relative sz:font-ycom">
      <div className="sz-sidepanel-content sz:flex-1">
        SidePanel
        <div className="sz-sidepanel-api-key sz:break-all">{settings.openAIKey}</div>
      </div>
      <div className="sz-sidepanel-footer sz:mt-auto">
        <Footer />
      </div>
    </div>
  );
};

export default SidePanel;
