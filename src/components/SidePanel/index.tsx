import Footer from '@/components/Footer';
import { useSettings } from '@/hooks/useSettings';

const SidePanel = () => {
  const [settings, _] = useSettings();

  return (
    <>
      <div>SidePanel</div>
      <div>{settings.openAIKey}</div>
      <Footer />
    </>
  );
};

export default SidePanel;
