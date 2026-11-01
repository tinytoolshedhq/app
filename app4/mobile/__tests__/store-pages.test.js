const fs = require('fs');
const path = require('path');

const storeDir = path.join(__dirname, '../../store');
const deployScript = path.join(__dirname, '../../../deploy-store-pages.sh');

describe('app4 store pages', () => {
  const privacy = fs.readFileSync(path.join(storeDir, 'privacy.html'), 'utf8');
  const support = fs.readFileSync(path.join(storeDir, 'support.html'), 'utf8');

  it('covers on-device mic, temp-file deletion, and estimate-only copy in en and zh-Hant', () => {
    expect(privacy).toMatch(/麥克風只在這台裝置上用來估算音量/);
    expect(privacy).toMatch(/立刻刪除/);
    expect(privacy).toMatch(/不收集、不上傳/);
    expect(privacy).toMatch(/校正調整值/);
    expect(privacy).toMatch(/沒有網路連線/);
    expect(privacy).toMatch(/沒有分析、廣告/);
    expect(privacy).toMatch(/僅供參考/);
    expect(privacy.toLowerCase()).toMatch(/used only on this device to estimate sound level/);
    expect(privacy.toLowerCase()).toMatch(/deleted right away/);
    expect(privacy.toLowerCase()).toMatch(/not saved or sent/);
    expect(privacy.toLowerCase()).toMatch(/calibration adjustment/);
    expect(privacy.toLowerCase()).toMatch(/no account, network, analytics, or ads/);
    expect(privacy.toLowerCase()).toMatch(/estimate/);
    expect(privacy).toMatch(/系統分享面板/);
    expect(privacy).toMatch(/CSV、圖片或 PDF/);
    expect(privacy).toMatch(/本 App 自己不會上傳/);
    expect(privacy.toLowerCase()).toMatch(/system share sheet/);
    expect(privacy.toLowerCase()).toMatch(/csv, image, pdf/);
    expect(privacy.toLowerCase()).toMatch(/uploads nothing/);
    expect(privacy).toMatch(/tinytoolshedhq@gmail\.com/);
    expect(support).toMatch(/tinytoolshedhq@gmail\.com/);
  });

  it('explains Full Pack, restore, and estimate-only copy on the support page', () => {
    expect(support).toMatch(/US\$2\.99/);
    expect(support).toMatch(/一次性買斷/);
    expect(support).toMatch(/沒有訂閱、廣告或試用/);
    expect(support).toMatch(/最多 10 筆紀錄，僅供檢視/);
    expect(support).not.toMatch(/最近 10 筆/);
    expect(support).toMatch(/不限筆數與備註/);
    expect(support).toMatch(/設定 &gt; 恢復購買/);
    expect(support).toMatch(/讀數是估計值，僅供參考/);
    expect(support).toMatch(/one-time App Store purchase/i);
    expect(support).toMatch(/No subscription, ads, or trial/i);
    expect(support).toMatch(/Up to 10 records, view-only/);
    expect(support).not.toMatch(/Latest 10|recent 10/i);
    expect(support).toMatch(/Unlimited records and notes/);
    expect(support).toMatch(/Settings &gt; Restore Purchases/);
    expect(support).toMatch(/estimates for reference only/i);
    const blob = support.toLowerCase();
    expect(blob).not.toMatch(/db\(a\)/);
    expect(blob).not.toMatch(/professional|medical|hearing/);
    expect(support).not.toMatch(/專業|醫療|聽力/);
  });

  it('is not the leftover CraftQ / 業問 pages', () => {
    const blob = `${privacy}\n${support}`;
    expect(blob).not.toMatch(/CraftQ|業問|鄰汪|LINE ID|Supabase/i);
  });
});

describe('deploy-store-pages.sh mapping', () => {
  const src = fs.readFileSync(deployScript, 'utf8');

  it('labels app4 as 分貝計 and fails if a store page is missing', () => {
    const index = src.split("<<'EOF'")[1] || '';
    expect(index).toMatch(/app4\/store\/support\.html">分貝計/);
    expect(index).toMatch(/app3\/store\/support\.html">Been Ages/);
    expect(index).not.toMatch(/業問|CraftQ|鄰汪/);
    expect(src).toMatch(/Refusing to deploy with missing store pages/);
    expect(src).toMatch(/git add app1\/store app2\/store app3\/store app4\/store index.html/);
  });
});
