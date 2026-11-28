'use strict';

window.SK = 'insight_v11';
window.__INSIGHT_SHELL_VERSION__ = '20261125-print-holiday-build-134';
window.__INSIGHT_FEATURE_SIGNATURE__ = '2a1f565f';
window.MONTHS = Array.from({length: 12}, (_, i) => (i + 1) + '月');
window.DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
window.HAIKI_CATS = ['米飯', '調理パン', '麺類・その他', 'デリカテッセン', 'スイーツ', 'FF', 'その他デイリー', 'パン・ペストリー'];
window.InsightBackupEntrypointsV1 = {version: 1, register() { return true; }};
window.InsightBackupPasswordV1 = {};

window.addEventListener('DOMContentLoaded', async () => {
  const get = id => document.getElementById(id);
  const result = get('result');
  const controls = get('controls');
  const api = window.InsightIndexedDBStorageV1;
  const backup = window.InsightMigrationBackupV1;
  const password = 'Fictional-capacity-only-2026';
  const bytes = 25 * 1024 * 1024;
  const storeId = 'fictional-ipad-capacity';
  const marker = 'insight_indexeddb_adoption_v1';
  const row = snapshot => snapshot.stores[storeId].data['2025']['1月'][0];

  function requireCheck(condition, message) {
    if (!condition) throw new Error(message);
  }

  function fixture() {
    const shop = {name: '架空容量店舗', years: ['2025'], data: {'2025': {}}};
    MONTHS.forEach((month, index) => {
      shop.data['2025'][month] = Array.from({length: DAYS_IN_MONTH[index]}, (_, i) => ({
        d: String(i + 1), 売上: 0, 客数: 0, 買上点数: 0, 廃棄金額: 0,
        haiki: Object.fromEntries(HAIKI_CATS.map(category => [category, 0])), weather: ''
      }));
    });
    const snapshot = {schemaVersion: 1, current: storeId, stores: {[storeId]: shop}};
    InsightSalesCount.ensure(snapshot);
    return snapshot;
  }

  function verifyFixture(snapshot) {
    requireCheck(snapshot.current === storeId && Object.keys(snapshot.stores).length === 1 &&
      snapshot.stores[storeId]?.name === '架空容量店舗', '架空店舗のスナップショットを確認できません。');
  }

  async function smallFile() {
    const {encrypted} = await backup.encodeCommitted(fixture(), password);
    return new File([JSON.stringify(encrypted)], 'Insight-fictional-target.json');
  }

  async function read() {
    const state = await api.read();
    verifyFixture(state.snapshot);
    return state;
  }

  function describe(state) {
    const memo = row(state.snapshot).storeMemo;
    const kind = memo?.startsWith('架') ? '日本語主体' : '英数字主体';
    return '保存リビジョン ' + state.revision + '、' + (memo ? '25 MiB ' + kind : '小容量');
  }

  const original = InsightStorage.serialize(fixture());
  function verifyLegacy() {
    requireCheck(localStorage.getItem(SK) === original, '旧ストレージの架空原本が一致しません。');
  }

  async function startFixture() {
    if (localStorage.getItem(marker) !== null) return read();
    const file = await smallFile();
    if (localStorage.getItem(SK) === null) localStorage.setItem(SK, original);
    verifyLegacy();
    // The isolated harness supplies its own synthetic migration confirmation.
    window.InsightMigrationBackupV1 = {...backup, assertReady() {}, confirm: async () => true};
    try {
      await api.migrate({legacyClientsClosed: true, selectVerifiedBackup: () => ({file, password})});
    } finally {
      window.InsightMigrationBackupV1 = backup;
    }
    return read();
  }

  function selected(id) {
    const file = get(id).files[0];
    requireCheck(file, '検証用ファイルを選択してください。');
    return file;
  }

  function bind(id, action) {
    get(id).addEventListener('click', async () => {
      controls.disabled = true;
      result.textContent = '検証中…';
      const started = performance.now();
      try {
        const message = await action();
        result.textContent = message + '（' + ((performance.now() - started) / 1000).toFixed(1) + '秒）';
      } catch (error) {
        result.textContent = 'ここで停止して状況を記録してください。 ' + error.message;
      } finally {
        controls.disabled = false;
      }
    });
  }

  async function restore(file, confirm, previousRevision) {
    const safetyFile = selected('safety');
    const restored = await api.restoreBackup({
      file, password, safetyFile, safetyPassword: password, legacyClientsClosed: true,
      confirm: ({target}) => {
        requireCheck(target.stores.length === 1 && target.stores[0].id === storeId,
          '架空店舗のバックアップを選択してください。');
        return confirm;
      }
    });
    verifyLegacy();
    const after = await read();
    requireCheck(confirm ? restored.revision === previousRevision + 1 && restored.revision === after.revision
      : restored.review === 'cancelled' && after.revision === previousRevision,
    '復元後のリビジョンが一致しません。');
    return after;
  }

  try {
    const localOrigin = ['http://localhost:8075', 'http://127.0.0.1:8075'].includes(location.origin);
    const allowedHost = localOrigin || /^https:\/\/[a-z0-9-]+-8075\.app\.github\.dev$/.test(location.origin);
    requireCheck(isSecureContext && allowedHost && navigator.locks && navigator.serviceWorker,
      '専用のポート8075をHTTPSで開いてください。');
    requireCheck(!navigator.serviceWorker.controller && !(await navigator.serviceWorker.getRegistration(location.href)),
      '専用の新しい検証先で開いてください。');
    const raw = localStorage.getItem(SK);
    requireCheck(raw === original || (raw === null && localStorage.getItem(marker) === null && localStorage.length === 0),
      '既存の保存領域が見つかりました。新しい検証先で開いてください。');
    if (raw !== null && localStorage.getItem(marker) !== null) {
      result.textContent = '読み戻し成功。' + describe(await read());
    } else {
      result.textContent = '準備完了。';
    }
  } catch (error) {
    result.textContent = error.message;
    return;
  }

  bind('seed', async () => {
    const {revision} = await startFixture();
    const snapshot = fixture();
    row(snapshot).storeMemo = '';
    const {encrypted} = await backup.encodeCommitted(snapshot, password);
    const envelope = await InsightBackupCryptoV1.decrypt(encrypted, password);
    const padding = bytes - new TextEncoder().encode(JSON.stringify(envelope)).length;
    const ascii = get('encoding').value === 'ascii';
    const memo = ascii ? 'A'.repeat(padding) : '架'.repeat(Math.floor(padding / 3)) + 'A'.repeat(padding % 3);
    row(snapshot).storeMemo = memo;
    envelope.data = snapshot;
    requireCheck(new TextEncoder().encode(JSON.stringify(envelope)).length === bytes, '25 MiBを構成できません。');
    const first = await api.save(revision, snapshot);
    row(snapshot).売上 = 1;
    await api.save(first.revision, snapshot);
    const after = await read();
    requireCheck(after.revision === revision + 2 && row(after.snapshot).storeMemo === memo && row(after.snapshot).売上 === 1,
      '連続保存後の内容が一致しません。');
    verifyLegacy();
    return '連続保存成功。' + describe(after);
  });

  bind('download', async () => {
    const {revision: before} = await read();
    const revision = await api.downloadCommittedBackup(password);
    requireCheck(revision === before, 'バックアップのリビジョンが一致しません。');
    return 'ダウンロードを開始しました。ファイルの保存先を確認してください。';
  });

  bind('cancel', async () => {
    const before = await read();
    const after = await restore(await smallFile(), false, before.revision);
    requireCheck(row(after.snapshot).storeMemo === row(before.snapshot).storeMemo && row(after.snapshot).売上 === row(before.snapshot).売上,
      '取消後の内容が一致しません。');
    return '取消成功。' + describe(after);
  });

  bind('restoreSmall', async () => {
    const after = await restore(await smallFile(), true, (await read()).revision);
    requireCheck(!row(after.snapshot).storeMemo && row(after.snapshot).売上 === 0, '小容量データが一致しません。');
    return '小容量への復元成功。' + describe(after);
  });

  bind('restoreLarge', async () => {
    const {revision} = await read();
    const file = selected('target');
    requireCheck(file.size > 33 * 1024 * 1024 && file.size <= 36 * 1024 * 1024,
      '先に保存した25 MiB検証ファイルを選択してください。');
    const after = await restore(file, true, revision);
    requireCheck(row(after.snapshot).storeMemo && row(after.snapshot).売上 === 1, '復元後の内容が一致しません。');
    return '25 MiBへの復元成功。' + describe(after);
  });

  get('restart').addEventListener('click', () => location.reload());
  controls.disabled = false;
});
