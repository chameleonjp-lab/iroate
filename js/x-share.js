// Web Intent opens a composer; posting remains an explicit action on X.
export function buildXShareUrl(text) {
  const url = new URL('https://x.com/intent/tweet');
  url.searchParams.set('text', text);
  return url.href;
}

// Keep modified/native anchor activation untouched. Normal activation opens the
// composer synchronously in the gesture; only a failed opening offers copy.
export function isPlainShareActivation(event) {
  return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
}
export function openXShare(text, {openWindow, onBlocked}) {
  let popup;
  try {
    popup = openWindow('', '_blank');
    if (!popup) throw new Error('Popup unavailable');
    popup.opener = null;
    if (popup.opener !== null) throw new Error('Popup opener could not be detached');
    const link = popup.document.createElement('a');
    link.href = buildXShareUrl(text);
    link.target = '_self';
    link.rel = 'noreferrer';
    link.referrerPolicy = 'no-referrer';
    popup.document.body.append(link);
    link.click();
    return true;
  } catch {
    try { popup?.close(); } catch { /* Result state is independent of popup. */ }
    onBlocked(text);
    return false;
  }
}
