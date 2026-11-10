import { Link } from 'react-router-dom';
import { brand } from '../config/brand';
import { useT } from '../i18n';

export function Footer() {
  const { t } = useT();
  return (
    <footer className="wrap" style={{ paddingBottom: 36 }}>
      <div className="dbl" />
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '10px 32px', paddingTop: 16, fontSize: 12, color: 'var(--ink3)' }}>
        <p style={{ margin: 0, maxWidth: '60em' }}>{t('common.foot1')}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
          <Link to="/about" className="hl">{t('common.fData')}</Link>
          <Link to="/about#keys" className="hl">{t('common.fKeys')}</Link>
          <span>© {new Date().getFullYear()} {brand.name}</span>
        </div>
      </div>
    </footer>
  );
}
