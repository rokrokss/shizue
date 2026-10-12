// Shizue Plot (plot.shizue.net) is a website whose Sign in with ChatGPT keeps the account on its
// own server. OpenAI's flow can only return to a loopback address, which a website cannot
// receive, so the static rules in public/plot-signin-rules.json send that one navigation on to
// the site, query string and all, before Chrome connects anywhere. The extension reads nothing:
// the site's server checks and exchanges what arrives. This file only answers the site's
// presence check, so its login page can tell whether Shizue is installed and new enough.

// Must match externally_connectable in wxt.config.ts and the targets in plot-signin-rules.json.
export const PLOT_ORIGINS = ['https://plot.shizue.net', 'http://localhost:13000'];

export const PLOT_SIGNIN_FEATURE = 'plotSignIn';

export interface PlotSignInPing {
  ok: true;
  version: string;
  features: string[];
}

// The answer to a page's `{ type: 'ping' }`, or undefined for anything else. Chrome already
// limits who may message us to externally_connectable; the origin is checked again here so the
// two lists cannot drift apart unnoticed.
export function plotSignInPing(message: unknown, senderUrl: string | undefined, version: string): PlotSignInPing | undefined {
  if ((message as { type?: unknown } | null)?.type !== 'ping' || !senderUrl) return undefined;
  let origin: string;
  try {
    origin = new URL(senderUrl).origin;
  } catch {
    return undefined;
  }
  if (!PLOT_ORIGINS.includes(origin)) return undefined;
  return { ok: true, version, features: [PLOT_SIGNIN_FEATURE] };
}
