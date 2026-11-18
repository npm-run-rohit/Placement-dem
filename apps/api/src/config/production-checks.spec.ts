import configuration from './configuration';
import { productionProblems } from './production-checks';

describe('productionProblems', () => {
  const base = () => configuration();

  it('lists every laptop default', () => {
    const problems = productionProblems(base());
    expect(problems).toHaveLength(4);
    expect(problems.join(' ')).toMatch(/AUTH_MODE.*FEATURE_DEV_SIMULATORS.*STORAGE_DRIVER.*MALWARE_SCANNER/);
  });

  it('passes a production-shaped config and requires the webhook secret in live mode', () => {
    const c = base();
    c.auth.mode = 'sahayak';
    c.features.devSimulators = false;
    c.storage.driver = 's3';
    c.malware.driver = 'clamav';
    expect(productionProblems(c)).toEqual([]);
    c.bimasetu.mode = 'live';
    expect(productionProblems(c)).toEqual([expect.stringMatching(/BIMASETU_WEBHOOK_SECRET/)]);
    c.bimasetu.webhookSecret = 'secret';
    expect(productionProblems(c)).toEqual([]);
  });

  it('requires the email layer url and secret when it is the mailbox driver', () => {
    const c = base();
    c.mailbox.driver = 'email-layer';
    const msgs = productionProblems(c).filter((p) => /EMAIL_LAYER/.test(p));
    expect(msgs).toHaveLength(2);
    c.mailbox.emailLayer.url = 'https://layer';
    c.mailbox.emailLayer.secret = 's';
    expect(productionProblems(c).filter((p) => /EMAIL_LAYER/.test(p))).toEqual([]);
  });
});
