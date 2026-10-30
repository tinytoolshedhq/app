import { webAlert } from '../src/lib/webAlert';

describe('webAlert', () => {
  it('maps two-button Alert to window.confirm', () => {
    const ok = jest.fn();
    const cancel = jest.fn();
    const prevConfirm = window.confirm;
    window.confirm = jest.fn(() => true);
    webAlert('T', 'M', [{ text: 'c', style: 'cancel', onPress: cancel }, { text: 'd', onPress: ok }]);
    expect(ok).toHaveBeenCalled();
    window.confirm = jest.fn(() => false);
    webAlert('T', 'M', [{ text: 'c', style: 'cancel', onPress: cancel }, { text: 'd', onPress: ok }]);
    expect(cancel).toHaveBeenCalled();
    window.confirm = prevConfirm;
  });
});
