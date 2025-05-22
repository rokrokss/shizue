const logoText = `
            _              _            
  _ __ ___ | | ___ __ ___ | | _____ ___ 
 | '__/ _ \\| |/ / '__/ _ \\| |/ / __/ __|
 | | | (_) |   <| | | (_) |   <\\__ \\__ \\
 |_|  \\___/|_|\\_\\_|  \\___/|_|\\_\\___/___/
 `;

const msgText = (msg: string) => `\n${' '.repeat(14 - msg.length / 2)}[${msg}]`;

export const contentScriptLog = (item: string) => {
  console.log(logoText, msgText(`${item} Script Loaded`));
};

export const backgroundLog = () => {
  console.log(logoText, msgText('Background Loaded'));
};

export const debugLog = (...args: any[]) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('[ROKROKSS DEBUG]', ...args);
  }
};

export const errorLog = (...args: any[]) => {
  if (process.env.NODE_ENV === 'development') {
    console.error('[ROKROKSS ERROR]', ...args);
  }
};
