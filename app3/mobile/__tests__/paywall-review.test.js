import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert, TouchableOpacity } from 'react-native';
import PaywallScreen from '../src/screens/PaywallScreen';
import { purchaseProUnlock } from '../src/lib/iap';
import { setLocale, t } from '../src/i18n';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
  useRoute: () => ({ params: {} }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
jest.mock('../src/components/Mascot', () => ({ Mascot: () => null }));
jest.mock('../src/components/Icons', () => ({
  ChevronLeftIcon: () => null, InfinityIcon: () => null,
  ShareIcon: () => null, CheckIcon: () => null,
}));
jest.mock('../src/theme/useTheme', () => ({ useThemeColors: () => ({}) }));
jest.mock('../src/lib/entitlements', () => ({
  isProUnlocked: async () => false,
  subscribePro: () => () => {},
}));
jest.mock('../src/lib/iap', () => ({
  purchaseProUnlock: jest.fn(),
  restoreProUnlock: jest.fn(),
  getProDisplayPrice: async () => '$2.99',
  canPresentRedeemCode: () => false,
}));

describe('paywall purchase feedback', () => {
  let tree;
  let alert;
  const buyButton = () => tree.root.findAllByType(TouchableOpacity)
    .find((node) => node.props.accessibilityLabel === t('paywall.buy'));

  beforeEach(async () => {
    setLocale('en');
    purchaseProUnlock.mockReset();
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await act(async () => { tree = renderer.create(<PaywallScreen />); });
  });
  afterEach(() => {
    act(() => tree.unmount());
    alert.mockRestore();
  });

  it('explains pending approval and lets the user interact again', async () => {
    purchaseProUnlock.mockResolvedValue({ ok: false, pending: true });
    await act(async () => { await buyButton().props.onPress(); });
    expect(alert).toHaveBeenCalledWith(t('paywall.buy'), t('iap.pending'));
    expect(buyButton().props.disabled).toBe(false);
  });

  it('shows errors and permits a retry after a rejected purchase', async () => {
    purchaseProUnlock.mockRejectedValueOnce(new Error('unexpected native failure'));
    await act(async () => { await buyButton().props.onPress(); });
    expect(alert).toHaveBeenCalledWith(t('common.fail'), t('iap.buyFail'));
    purchaseProUnlock.mockResolvedValueOnce({ ok: false, error: 'Store unavailable' });
    await act(async () => { await buyButton().props.onPress(); });
    expect(alert).toHaveBeenLastCalledWith(t('common.fail'), 'Store unavailable');
    expect(buyButton().props.disabled).toBe(false);
  });

  it('dispatches only one purchase for rapid taps and recovers after cancellation', async () => {
    let finish;
    purchaseProUnlock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const press = buyButton().props.onPress;
    let result;
    act(() => {
      result = press();
      press();
    });
    expect(purchaseProUnlock).toHaveBeenCalledTimes(1);
    const busy = tree.root.findAllByType(TouchableOpacity)
      .find((node) => node.props.accessibilityLabel === t('iap.processing'));
    expect(busy.props.disabled).toBe(true);
    await act(async () => { finish({ ok: false, cancelled: true }); await result; });
    expect(alert).not.toHaveBeenCalled();
    expect(buyButton().props.disabled).toBe(false);
  });
});
