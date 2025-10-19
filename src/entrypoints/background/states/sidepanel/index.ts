let panelOpenedWindowId: number | undefined;

export const setPanelOpenedWindow = (windowId: number | undefined) => {
  panelOpenedWindowId = windowId;
};

export const getPanelOpenedWindow = () => panelOpenedWindowId;

// 호환성을 위해 유지 (Port disconnect 등에서 사용)
export const changePanelOpened = (status: boolean) => {
  if (!status) {
    panelOpenedWindowId = undefined;
  }
};

export const getPanelOpened = () => panelOpenedWindowId !== undefined;
