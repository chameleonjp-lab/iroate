// Web Intent opens a composer; posting remains an explicit action on X.
export function buildXShareUrl(text) {
  const url = new URL('https://x.com/intent/tweet');
  url.searchParams.set('text', text);
  return url.href;
}
