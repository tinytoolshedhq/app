import { t } from '../i18n';

export function errorBlob(error) {
  const e = error && typeof error === 'object' ? error : {};
  return `${e.code || ''} ${e.message || error || ''}`;
}

export function isUserCancelledError(error) {
  return /cancel|E_USER_CANCELLED|user-cancelled/i.test(errorBlob(error));
}

export function isAlreadyOwnedError(error) {
  return /already.?owned|E_ALREADY_OWNED|already-owned|already (been )?bought|already purchased/i.test(errorBlob(error));
}

export function isDeferredError(error) {
  return /E_DEFERRED|deferred-payment|(^|[^a-z])deferred([^a-z]|$)/i.test(errorBlob(error));
}

export function isUnavailableError(error) {
  return /IAP_UNAVAILABLE|IAP unavailable|E_IAP_NOT_AVAILABLE|E_SERVICE_ERROR|not available|billing.?unavailable/i.test(errorBlob(error));
}

export function isTimeoutError(error) {
  if (!error) return false;
  if (error.timedOut === true) return true;
  if (error.code === 'IAP_TIMEOUT') return true;
  return /timeout|timed.?out|E_NETWORK_ERROR/i.test(errorBlob(error));
}

/**
 * Map store / shim errors to localized copy. Never return raw store strings.
 */
export function mapIapError(error) {
  if (isUserCancelledError(error)) return t('iap.cancelled');
  if (isAlreadyOwnedError(error)) return t('iap.restored');
  if (isDeferredError(error)) return t('iap.pending');
  if (isTimeoutError(error)) return t('iap.timeout');
  if (isUnavailableError(error)) return t('iap.unavailable');
  return t('iap.buyFail');
}

export function unavailableError() {
  const err = new Error('IAP_UNAVAILABLE');
  err.code = 'IAP_UNAVAILABLE';
  return err;
}
