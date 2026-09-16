// src/pages/SharedProduct.jsx
//
// Where a WhatsApp-shared link lands (#/p/<report id>, see
// utils/share.js). The Result page only knows how to show a report
// that's already in this device's local history, so this fetches the
// shared report, saves it there -- the same thing search does when you
// open a cached product -- and hands off to the normal Result page.
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getReportById } from '../services/productCache';
import { saveToHistory } from '../utils/storage';
import { useLanguage } from '../contexts/LanguageContext';

export default function SharedProduct() {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getReportById(reportId).then((report) => {
      if (cancelled) return;
      if (!report) {
        setNotFound(true);
        return;
      }
      const historyId = saveToHistory(report, 'search');
      // replace, not push -- Back from the report shouldn't land on this
      // loading screen and immediately bounce forward again.
      navigate(`/result/${historyId}`, { replace: true });
    });
    return () => { cancelled = true; };
  }, [reportId, navigate]);

  return (
    <div className="max-w-2xl mx-auto px-5 pt-16 text-center">
      {notFound ? (
        <>
          <p className="text-[34px] leading-none mb-3">🔍</p>
          <p className="text-[15px] leading-relaxed mb-5" style={{ color: 'var(--label-2)' }}>
            {t('sharedProductNotFound')}
          </p>
          <Link
            to="/"
            replace
            className="tap-scale inline-block px-5 py-3 rounded-[14px] text-[15px] font-semibold text-white"
            style={{ background: 'var(--tint)' }}
          >
            {t('sharedProductGoHome')}
          </Link>
        </>
      ) : (
        <p className="text-[15px]" style={{ color: 'var(--label-2)' }}>{t('sharedProductLoading')}</p>
      )}
    </div>
  );
}
