import { BRIDGE_TO_CONTENT_EVENT, BridgeMessage } from '@/lib/twitch/bridgeProtocol';
import { createCaptionExtractor } from '@/lib/twitch/captionExtractor';

// Twitch's player (Amazon IVS) appends the stream to a MediaSource inside its worker, 1–3 s ahead
// of playback on live streams and 10–35 s on VODs. The broadcaster's CEA-608 captions ride in that
// video, so reading them as it is appended lets translation start before the player shows them as
// PlayerTextCue. This wraps `Worker` before Twitch's scripts run and puts a hook in front of the
// player worker's source; it reads only what the player itself downloaded. If anything here fails,
// the player runs untouched and captions come from PlayerTextCue alone.

const CHANNEL = 'shizue-twitch-captions';

// Runs in the player worker (and in the page, in case a player appends there). It is stringified,
// so it uses nothing from module scope.
function hookSourceBuffers(
  channelName: string,
  createExtractor: () => { extract(bytes: Uint8Array, offset: number): number[][] }
) {
  const SourceBufferClass = (self as any).SourceBuffer;
  if (!SourceBufferClass) return;
  const channel = new BroadcastChannel(channelName);
  const extractor = createExtractor();
  const append = SourceBufferClass.prototype.appendBuffer;
  SourceBufferClass.prototype.appendBuffer = function (data: ArrayBuffer | ArrayBufferView) {
    try {
      const bytes =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      const pairs = extractor.extract(bytes, this.timestampOffset);
      if (pairs.length) channel.postMessage({ pairs });
    } catch {
      // Never stand in the player's way.
    }
    return append.call(this, data);
  };
}

export default defineContentScript({
  matches: ['https://www.twitch.tv/*', 'https://twitch.tv/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const marker = '__shizueTwitchWorker';
    if ((window as any)[marker]) return;
    (window as any)[marker] = true;

    const hook = `(${hookSourceBuffers.toString()})(${JSON.stringify(CHANNEL)}, ${createCaptionExtractor.toString()});\n`;
    const RealWorker = window.Worker;
    // The player's worker is a blob that imports Twitch's amazon-ivs-wasmworker script. Read its
    // source and prepend the hook, as Twitch ad-block userscripts do; anything else passes through.
    class TwitchWorker extends RealWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        let source: string | null = null;
        if (options?.type !== 'module') {
          try {
            const request = new XMLHttpRequest();
            request.open('GET', String(url), false);
            request.send();
            source = request.responseText;
          } catch {
            source = null;
          }
        }
        if (source?.includes('amazon-ivs-wasmworker')) {
          super(URL.createObjectURL(new Blob([hook + source], { type: 'text/javascript' })), options);
        } else {
          super(url, options);
        }
      }
    }
    window.Worker = TwitchWorker;
    hookSourceBuffers(CHANNEL, createCaptionExtractor);

    // Worker → page → the isolated caption script, like the player bridge's messages.
    new BroadcastChannel(CHANNEL).onmessage = (event) => {
      const pairs = event.data?.pairs;
      if (!Array.isArray(pairs)) return;
      const message: BridgeMessage = { type: 'captionData', pairs };
      window.dispatchEvent(new CustomEvent(BRIDGE_TO_CONTENT_EVENT, { detail: JSON.stringify(message) }));
    };
  },
});
