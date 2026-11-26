'use strict';
const {test, expect} = require('@playwright/test');
const {stat} = require('node:fs/promises');

for (const encoding of ['japanese', 'ascii']) {
  test('iPad capacity fixture flow: ' + encoding, async ({page}) => {
    await page.goto('http://localhost:8075/');
    const result = page.locator('#result');
    const status = pattern => expect(result).toHaveText(pattern, {timeout: 60000});
    const click = id => page.locator('#' + id).click();
    async function download() {
      const pending = page.waitForEvent('download');
      await click('download');
      const file = await (await pending).path();
      await status(/ダウンロードを開始/);
      return file;
    }

    await status(/準備完了/);
    await page.locator('#encoding').selectOption(encoding);
    await click('seed');
    await status(/連続保存成功.*リビジョン 2/);
    const large = await download();
    const {size} = await stat(large);
    expect(size).toBeGreaterThan(33 * 1024 * 1024);
    expect(size).toBeLessThanOrEqual(36 * 1024 * 1024);

    const safety = page.locator('#safety');
    await safety.setInputFiles({name: 'wrong.json', mimeType: 'application/json', buffer: Buffer.from('{}')});
    await click('cancel');
    await status(/ここで停止/);
    await safety.setInputFiles(large);

    await click('cancel');
    await status(/取消成功.*リビジョン 2/);
    await click('restoreSmall');
    await status(/小容量への復元成功.*リビジョン 3/);
    await safety.setInputFiles(await download());
    await page.locator('#target').setInputFiles(large);
    await click('restoreLarge');
    await status(/25 MiBへの復元成功.*リビジョン 4/);
    await click('restart');
    await status(/読み戻し成功.*リビジョン 4/);
  });
}
