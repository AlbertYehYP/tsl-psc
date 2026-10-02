/* TSL PSC System — front-end settings (safe to commit: no secrets here) */
window.PSC_CONFIG = {
  // Apps Script 網頁應用程式網址（部署後取得，結尾為 /exec）
  apiUrl: 'https://script.google.com/macros/s/……/exec',
  // Google Cloud OAuth 2.0 Client ID（網頁應用程式類型；已授權的 JavaScript 來源要加上 GitHub Pages 網址）
  googleClientId: '…….apps.googleusercontent.com',
  // true = 示範模式（不連線，資料只在瀏覽器）
  demo: false,
  orgName: '德翔海技 TSL MARTEC'
};
