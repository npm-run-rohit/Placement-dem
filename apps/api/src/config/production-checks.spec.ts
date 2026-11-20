import configuration from './configuration';
import { productionProblems } from './production-checks';

const REAL_SECRET = 'k3Jx9vQ2mP8wL5tR7yN4bH6cF1dG0sZa';

describe('productionProblems', () => {
  const base = () => configuration();

  /** Everything production needs: real auth, storage, scanner and the three live integrations. */
  const production = () => {
    const c = base();
    c.auth.mode = 'sahayak';
    c.features.devSimulators = false;
    c.storage.driver = 's3';
    c.malware.driver = 'clamav';
    c.mailbox.driver = 'email-layer';
    c.mailbox.emailLayer.url = 'https://layer';
    c.mailbox.emailLayer.secret = REAL_SECRET;
    c.bimasetu.mode = 'live';
    c.bimasetu.apiUrl = 'https://bimasetu';
    c.bimasetu.webhookSecret = 'secret';
    c.copycat.mode = 'live';
    c.copycat.endpoint = 'https://copycat';
    c.copycat.apiKey = 'key';
    return c;
  };

  it('lists every laptop default', () => {
    const problems = productionProblems(base());
    expect(problems).toHaveLength(8);
    expect(problems.join(' ')).toMatch(
      /AUTH_MODE.*FEATURE_DEV_SIMULATORS.*STORAGE_DRIVER.*MALWARE_SCANNER.*BIMASETU_MODE.*COPYCAT_MODE.*MAILBOX_DRIVER.*EMAIL_LAYER_SECRET/,
    );
  });

  it('passes a production-shaped config', () => {
    expect(productionProblems(production())).toEqual([]);
  });

  it('refuses the integration stand-ins: they would fake QCRs and drop insurer and BimaSetu mail', () => {
    const c = production();
    c.bimasetu.mode = 'mock';
    c.copycat.mode = 'mock';
    expect(productionProblems(c)).toEqual([
      expect.stringMatching(/BIMASETU_MODE/),
      expect.stringMatching(/COPYCAT_MODE/),
    ]);
    for (const driver of ['dev', 'gmail', 'graph'] as const) {
      const m = production();
      m.mailbox.driver = driver;
      expect(productionProblems(m)).toEqual([expect.stringMatching(/MAILBOX_DRIVER/)]);
    }
  });

  it('requires the live endpoints and credentials', () => {
    const c = production();
    c.bimasetu.apiUrl = '';
    c.bimasetu.webhookSecret = '';
    c.copycat.endpoint = '';
    c.copycat.apiKey = '';
    expect(productionProblems(c)).toEqual([
      expect.stringMatching(/BIMASETU_API_URL/),
      expect.stringMatching(/BIMASETU_WEBHOOK_SECRET/),
      expect.stringMatching(/COPYCAT_ENDPOINT/),
    ]);
  });

  it('requires the email layer url and secret when it is the mailbox driver', () => {
    const c = base();
    c.mailbox.driver = 'email-layer';
    const msgs = productionProblems(c).filter((p) => /EMAIL_LAYER/.test(p));
    expect(msgs).toHaveLength(2);
    c.mailbox.emailLayer.url = 'https://layer';
    c.mailbox.emailLayer.secret = REAL_SECRET;
    expect(productionProblems(c).filter((p) => /EMAIL_LAYER/.test(p))).toEqual([]);
  });

  it.each([
    ['empty', ''],
    ['short', 'x'.repeat(31)],
    ['the .env.example value', 'dev-email-layer-secret-change-me'],
    ['a long placeholder', 'change-me-change-me-change-me-change-me'],
  ])('refuses an %s EMAIL_LAYER_SECRET whatever the mailbox driver (D4)', (_n, secret) => {
    for (const driver of ['dev', 'email-layer'] as const) {
      const c = base();
      c.mailbox.driver = driver;
      c.mailbox.emailLayer.url = 'https://layer';
      c.mailbox.emailLayer.secret = secret;
      expect(productionProblems(c).filter((p) => /EMAIL_LAYER_SECRET/.test(p))).toHaveLength(1);
    }
  });
});
