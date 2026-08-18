import sponsorQr from '../../assets/sponsor-qr.png';

export function SponsorSettingsSection() {
  return (
    <section className="settings-section narrow-section sponsor-settings-section">
      <div className="settings-section-title-row"><h3>赞助</h3><span className="settings-hint">感谢支持开发</span></div>
      <p className="settings-hint">如果这个工具帮你节省了整理快捷方式和启动应用的时间，可以扫码赞助。收款码会跟随软件一起离线显示。</p>
      <div className="sponsor-qr-card"><img src={sponsorQr} alt="微信/支付宝赞助收款码" /></div>
      <div className="sponsor-note"><strong>微信 / 支付宝</strong><span>扫码后输入金额即可支持。感谢每一次反馈和赞助。</span></div>
    </section>
  );
}
