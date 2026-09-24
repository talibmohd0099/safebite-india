// src/components/NutritionTrafficLight.jsx
//
// Four coloured tiles -- fat, saturated fat, sugars, salt -- each Low /
// Medium / High by the UK front-of-pack levels (see trafficLight.js), so
// the nutrition panel reads at a glance before anyone looks at a number.
// The word is always shown next to the colour: colour alone would fail
// colour-blind users.
const LEVEL_LOOK = {
  low: { color: 'var(--v-good)', bg: 'var(--v-good-bg)', key: 'tlLow' },
  medium: { color: 'var(--v-moderate)', bg: 'var(--v-moderate-bg)', key: 'tlMedium' },
  high: { color: 'var(--v-very-poor)', bg: 'var(--v-very-poor-bg)', key: 'tlHigh' },
};
const LABEL_KEY = { fat: 'tlFat', satFat: 'tlSatFat', sugars: 'tlSugars', salt: 'tlSalt' };

export default function NutritionTrafficLight({ light, t }) {
  return (
    <div className="mb-3.5">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${light.items.length}, minmax(0, 1fr))` }}>
        {light.items.map((item, i) => {
          const look = LEVEL_LOOK[item.level];
          return (
            <div
              key={item.key}
              className="item-in rounded-xl px-1.5 py-2 text-center"
              style={{ background: look.bg, animationDelay: `${i * 80}ms` }}
            >
              <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--label-2)' }}>{t(LABEL_KEY[item.key])}</p>
              <p className="text-[16px] font-extrabold tabular-nums leading-tight mt-0.5" style={{ color: 'var(--label-1)' }}>{item.grams}g</p>
              <p className="text-[10.5px] font-bold uppercase tracking-wide mt-0.5" style={{ color: look.color }}>{t(look.key)}</p>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] mt-1.5" style={{ color: 'var(--label-3)' }}>
        {t(light.isDrink ? 'tlBasisDrink' : 'tlBasisFood')}
      </p>
    </div>
  );
}
