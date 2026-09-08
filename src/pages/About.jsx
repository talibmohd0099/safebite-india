// src/pages/About.jsx
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function About() {
  const navigate = useNavigate();
  const location = useLocation();

  // React Router doesn't auto-scroll to #hash targets on navigation —
  // do it ourselves so links like "How is this score calculated?" from
  // the Result page actually jump to the right section.
  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-green-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">
          🛡️
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">About SafeBite India</h1>
        <p className="text-slate-500 text-sm">
          Food label transparency for every Indian consumer
        </p>
      </div>

      {/* Mission */}
      <div className="bg-green-50 border border-green-200 rounded-2xl p-5 mb-4">
        <h2 className="font-bold text-green-800 mb-2">🎯 Our Mission</h2>
        <p className="text-sm text-green-700 leading-relaxed">
          International apps like Yuka are built for Europe and America. They don't recognize Indian brands, 
          don't understand FSSAI regulations, and flag ingredients that are actually fine under Indian standards — 
          while missing ones that aren't. SafeBite fixes that.
        </p>
      </div>

      {/* How it works */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
        <h2 className="font-bold text-slate-800 mb-4">⚙️ How It Works</h2>
        <div className="space-y-4">
          {[
            {
              step: '1',
              title: 'You upload, paste, or scan a barcode',
              desc: 'Take a photo of the ingredient label, paste the ingredient text, or enter a barcode. SafeBite accepts all three.'
            },
            {
              step: '2',
              title: 'Every ingredient is looked up',
              desc: "Each ingredient is checked against SafeBite's own growing database first — built from the official FSSAI additive regulations plus every ingredient ever researched before. Known ones are instant."
            },
            {
              step: '3',
              title: 'New ingredients get researched once',
              desc: "Anything genuinely new gets researched by AI a single time, then saved permanently — so the next person (or your next scan) never pays that cost again."
            },
            {
              step: '4',
              title: 'Your score is calculated with plain math',
              desc: 'No AI guesses your final score — it\'s computed with a transparent formula from each ingredient\'s data. See exactly how below.'
            },
          ].map((item) => (
            <div key={item.step} className="flex gap-3">
              <div className="w-7 h-7 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                {item.step}
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">{item.title}</p>
                <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* How the score is actually calculated */}
      <div id="how-score-works" className="bg-white border border-slate-200 rounded-2xl p-5 mb-4 scroll-mt-4">
        <h2 className="font-bold text-slate-800 mb-2">🧮 How Your Score Is Calculated</h2>
        <p className="text-sm text-slate-500 mb-4 leading-relaxed">
          Every product starts at a perfect <strong>100</strong>. Each ingredient then subtracts points based on how much it's actually worth worrying about — and, critically, <strong>how much of the product it actually is</strong>.
        </p>

        <div className="space-y-3 mb-5">
          <div className="flex gap-3">
            <span className="text-lg flex-shrink-0">1️⃣</span>
            <p className="text-sm text-slate-600 leading-relaxed">
              <strong>Every ingredient gets a 0–40 penalty</strong> reflecting nutritional quality — not just whether it's legal. Being permitted doesn't mean penalty-free: refined flour (maida) is completely legal, but it's stripped of fibre and spikes blood sugar, so it still costs real points.
            </p>
          </div>
          <div className="flex gap-3">
            <span className="text-lg flex-shrink-0">2️⃣</span>
            <p className="text-sm text-slate-600 leading-relaxed">
              <strong>Quantity matters.</strong> When a label states a percentage, that ingredient's penalty is scaled by how dominant it is — from 0.5× for a trace amount up to a full 1× if it's basically the whole product. A stated 3% gets far less weight than a stated 68%.
            </p>
          </div>
          <div className="flex gap-3">
            <span className="text-lg flex-shrink-0">3️⃣</span>
            <p className="text-sm text-slate-600 leading-relaxed">
              <strong>One bad ingredient can't hide in a crowd.</strong> If anything is FSSAI-banned or genuinely harmful, the score is capped at 24 no matter how many safe ingredients surround it. A pile of safe ingredients should never be able to launder something dangerous into looking "moderate."
            </p>
          </div>
        </div>

        {/* Worked example */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-2">📎 Real example — Parle-G Gluco Biscuits</p>
          <p className="text-sm text-amber-900 leading-relaxed mb-3">
            The label states <strong>Refined Wheat Flour (Maida) — 68%</strong>, its single largest ingredient. Maida carries a penalty of <strong>15</strong> (nutritionally poor, though legal). Here's its actual contribution to the score:
          </p>
          <div className="bg-white rounded-lg p-3 font-mono text-xs text-slate-700 mb-3 overflow-x-auto">
            weight = 0.5 + (68 ÷ 100) × 0.5 = <strong>0.84</strong><br />
            contribution = 15 × 0.84 = <strong>12.6 points</strong>
          </div>
          <p className="text-sm text-amber-900 leading-relaxed">
            Add sugar, refined palm oil, and a few minor ingredients on top, and the total comes to about 47 points off — landing the product at a final score of <strong>53/100 — Moderate</strong>. If maida had been a trace 2% ingredient instead of 68%, its contribution would drop to under 1 point — the same substance, treated very differently, because quantity genuinely changes how much it matters.
          </p>
        </div>

        <p className="text-xs text-slate-400 mt-4 leading-relaxed">
          Honest note: this is SafeBite's own transparent formula, not a government or scientific standard — there isn't one universal agreed formula for this anywhere (Nutri-Score, NOVA, and Yuka all score differently from each other, too). We'd rather show you the exact math than hide behind a black box.
        </p>
      </div>

      {/* Score guide */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
        <h2 className="font-bold text-slate-800 mb-3">📊 Score Guide</h2>
        <div className="space-y-2">
          {[
            { range: '85–100', color: 'bg-green-500', label: 'Very Healthy', desc: 'Whole/minimally processed, nothing concerning' },
            { range: '65–84', color: 'bg-green-400', label: 'Good', desc: 'Mostly natural, only minor deductions' },
            { range: '45–64', color: 'bg-yellow-400', label: 'Moderate', desc: 'Real concerns present — also the ceiling whenever any ingredient is flagged "concerning," however small the penalty' },
            { range: '25–44', color: 'bg-orange-400', label: 'Poor', desc: 'Multiple or significant concerns, heavily processed' },
            { range: '0–24', color: 'bg-red-500', label: 'Avoid', desc: 'Always the result whenever a harmful/banned ingredient is present, regardless of anything else in the product' },
          ].map((item) => (
            <div key={item.range} className="flex items-center gap-3">
              <div className={`w-10 h-6 ${item.color} rounded text-white text-xs font-bold flex items-center justify-center flex-shrink-0`}>
                {item.range.split('–')[0]}
              </div>
              <div>
                <span className="text-sm font-semibold text-slate-700">{item.label}</span>
                <span className="text-xs text-slate-400 ml-2">{item.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Data sources */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
        <h2 className="font-bold text-slate-800 mb-3">📚 Data Sources</h2>
        <ul className="text-sm text-slate-600 space-y-2">
          <li className="flex items-start gap-2">
            <span>🇮🇳</span>
            <span><strong>FSSAI</strong> — legal/permitted status for food additives comes directly from the official Food Safety and Standards (Food Products Standards and Food Additives) Regulations, not from AI guessing</span>
          </li>
          <li className="flex items-start gap-2">
            <span>🇪🇺</span>
            <span><strong>EU/EFSA</strong> — European Food Safety Authority guidelines for comparison</span>
          </li>
          <li className="flex items-start gap-2">
            <span>🤖</span>
            <span><strong>AI research, done once per ingredient</strong> — health effects, category, and scoring are researched by AI a single time per ingredient and saved permanently, not regenerated per scan</span>
          </li>
        </ul>
      </div>

      {/* Disclaimer */}
      <div className="bg-slate-100 rounded-2xl p-4 mb-6 text-xs text-slate-500 leading-relaxed">
        <strong>⚠️ Disclaimer:</strong> SafeBite is an independent, AI-powered informational tool and is not affiliated with FSSAI or any government body. Scores are for general awareness only. Always consult a healthcare professional for personal dietary advice. AI analysis may occasionally make errors.
      </div>

      <button
        onClick={() => navigate('/')}
        className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-colors"
      >
        🔍 Start Scanning
      </button>
    </div>
  );
}
