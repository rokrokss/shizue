import Footer from '@/components/Footer';
import Chat from '../Chat';

const SidePanel = () => {
  return (
    <div className="sz-sidepanel sz:flex sz:flex-col sz:h-screen sz:relative sz:font-ycom">
      <div className="sz-sidepanel-content sz:flex-1">
        <Chat />
      </div>
      <div className="sz-sidepanel-footer sz:mt-auto">
        <Footer />
      </div>
    </div>
  );
};

export default SidePanel;
