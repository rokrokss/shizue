import SidePanel from '@/components/SidePanel';
import { Navigate, useRoutes } from 'react-router-dom';

export const SidePanelRoutes = () => {
  const preferredPath = localStorage.getItem('preferredPath') || '/default';

  const routes = [
    { path: '/', element: <Navigate to={preferredPath} replace /> },
    { path: '/default', element: <SidePanel /> },
    { path: '/chat', element: <SidePanel /> },
  ];

  return useRoutes(routes);
};
