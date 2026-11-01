import React from 'react';
import renderer, { act } from 'react-test-renderer';
import ExportCard, {
  EXPORT_IMAGE_RECORD_LIMIT,
  recordsForExportImage,
} from '../src/components/ExportCard';
import { setLocale, t } from '../src/i18n';

function makeRecords(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `rec_${i}`,
    createdAt: `2026-11-01T00:00:${String(i).padStart(2, '0')}.000Z`,
    durationMs: 1000 + i,
    current: 50,
    max: 70,
    avg: 60,
    min: 40,
  }));
}

describe('recordsForExportImage', () => {
  it('keeps 30 or fewer rows with no overflow', () => {
    expect(EXPORT_IMAGE_RECORD_LIMIT).toBe(30);
    const slice = recordsForExportImage(makeRecords(30));
    expect(slice.records).toHaveLength(30);
    expect(slice.overflowCount).toBe(0);
    expect(recordsForExportImage(makeRecords(8)).overflowCount).toBe(0);
  });

  it('caps 80 records to the newest 30 plus overflow 50', () => {
    const all = makeRecords(80);
    const slice = recordsForExportImage(all);
    expect(slice.records).toHaveLength(30);
    expect(slice.overflowCount).toBe(50);
    expect(slice.records[0].id).toBe('rec_0');
    expect(slice.records[29].id).toBe('rec_29');
    expect(slice.records.find((r) => r.id === 'rec_79')).toBeUndefined();
  });
});

describe('ExportCard overflow line', () => {
  it('renders 30 rows and the overflow copy for 80 records', () => {
    setLocale('en');
    const slice = recordsForExportImage(makeRecords(80));
    let tree;
    act(() => {
      tree = renderer.create(
        <ExportCard records={slice.records} overflowCount={slice.overflowCount} />,
      );
    });
    const texts = tree.root.findAllByType('Text');
    expect(texts).toHaveLength(30 * 3 + 3);
    const text = texts.map((n) => n.props.children).flat().join(' ');
    expect(text).toContain(t('export.imageOverflow', { count: 50 }));
    expect(text).toContain('50 more');
    expect(text).toContain('export CSV');
    act(() => {
      tree.unmount();
    });
    setLocale('zh-Hant');
    let zh;
    act(() => {
      zh = renderer.create(
        <ExportCard records={slice.records} overflowCount={slice.overflowCount} />,
      );
    });
    const zhText = zh.root.findAllByType('Text').map((n) => n.props.children).flat().join(' ');
    expect(zhText).toContain('另有 50 筆');
    expect(zhText).toContain('CSV');
    act(() => {
      zh.unmount();
    });
    setLocale('en');
  });
});
