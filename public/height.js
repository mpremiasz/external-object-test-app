export function measureDocumentHeight(documentLike) {
  const body = documentLike?.body;
  const boundsHeight = Number(body?.getBoundingClientRect?.().height) || 0;
  if (boundsHeight > 0) return Math.ceil(boundsHeight);
  return Math.max(
    Number(body?.scrollHeight) || 0,
    Number(body?.offsetHeight) || 0
  );
}

export function parseManualHeight(value) {
  const trimmed = String(value).trim();
  if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  return trimmed;
}

export function observeHeight({
  documentLike,
  observeTarget = documentLike?.body,
  onHeight,
  hostWindow = globalThis.window,
  ResizeObserverClass = globalThis.ResizeObserver,
  MutationObserverClass = globalThis.MutationObserver,
  schedule = callback => setTimeout(callback, 50),
  cancel = handle => clearTimeout(handle)
}) {
  if (typeof onHeight !== "function") throw new TypeError("onHeight must be a function");

  let lastHeight;
  let pendingHandle = null;
  let stopped = false;
  let resizeObserver = null;
  let mutationObserver = null;

  function measure() {
    pendingHandle = null;
    if (stopped) return;
    const height = measureDocumentHeight(documentLike);
    if (height !== lastHeight) {
      lastHeight = height;
      onHeight(height);
    }
  }

  function queueMeasurement() {
    if (stopped || pendingHandle !== null) return;
    let ranSynchronously = false;
    pendingHandle = true;
    const handle = schedule(() => {
      ranSynchronously = true;
      measure();
    });
    if (!ranSynchronously) pendingHandle = handle;
  }

  if (ResizeObserverClass) {
    resizeObserver = new ResizeObserverClass(queueMeasurement);
    resizeObserver.observe(observeTarget);
  } else {
    if (MutationObserverClass) {
      mutationObserver = new MutationObserverClass(queueMeasurement);
      mutationObserver.observe(observeTarget, {
        childList: true,
        subtree: true,
        attributes: true
      });
    }
    hostWindow?.addEventListener?.("resize", queueMeasurement);
  }

  const initialHeight = measureDocumentHeight(documentLike);
  lastHeight = initialHeight;
  onHeight(initialHeight);

  return function cleanup() {
    if (stopped) return;
    stopped = true;
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    if (!ResizeObserverClass) hostWindow?.removeEventListener?.("resize", queueMeasurement);
    if (pendingHandle !== null) {
      cancel(pendingHandle);
      pendingHandle = null;
    }
  };
}
