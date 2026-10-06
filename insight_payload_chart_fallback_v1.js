
// Chart.js読み込み失敗時のフォールバック（ダミー）
window.addEventListener('error', function(e){
  if(e.message && e.message.includes('Chart')) {
    console.warn('Chart.js load failed - charts will not render');
  }
}, true);
