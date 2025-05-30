let panelOpened = false;

export const changePanelOpened = (status: boolean) => {
  panelOpened = status;
};

export const getPanelOpened = () => panelOpened;
