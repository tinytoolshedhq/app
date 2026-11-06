const iap = require('expo-iap');

describe('IAP mock isolation between tests', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    iap.__resetIapMock();
  });

  afterEach(() => {
    iap.__resetIapMock();
    jest.useRealTimers();
  });

  it('does not deliver an earlier test purchase to newly registered listeners', async () => {
    await iap.requestPurchase();
    iap.__resetIapMock();
    const listener = jest.fn();
    iap.purchaseUpdatedListener(listener);
    await jest.advanceTimersByTimeAsync(10);
    expect(listener).not.toHaveBeenCalled();
    expect(await iap.getAvailablePurchases()).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not fabricate a purchase when restoring an account with no purchases', async () => {
    const listener = jest.fn();
    iap.purchaseUpdatedListener(listener);
    await iap.restorePurchases();
    await jest.advanceTimersByTimeAsync(10);
    expect(listener).not.toHaveBeenCalled();
    expect(await iap.getAvailablePurchases()).toEqual([]);
  });

  it('still delivers a purchase to the current test', async () => {
    const listener = jest.fn();
    iap.purchaseUpdatedListener(listener);
    await iap.requestPurchase();
    await jest.advanceTimersByTimeAsync(10);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(await iap.getAvailablePurchases()).toEqual([
      { productId: 'com.beenages.app.fullpack' },
    ]);
  });
});
