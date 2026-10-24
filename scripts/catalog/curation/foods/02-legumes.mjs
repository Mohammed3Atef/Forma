/** B4 food curation — beans, lentils, chickpeas, sesame / chickpea spreads. */
const p = (id, match, en, ar, extra = {}) => ({ id, match, label: [en, ar], ...extra });
const CUP = (o) => p('cup', /^cup$/, '1 cup', 'كوب', o);

export default [
  { id: 'ff_fava_beans_boiled', fdc: 173753, name: ['Fava beans (ful), boiled — plain', 'فول مدمس مسلوق (سادة)'], aliases: { en: ['ful medames plain', 'foul', 'broad beans cooked'], ar: ['فول مسلوق', 'فول مدمس'], eg: ['فول', 'فول مدمس', 'طبق فول سادة', 'فول من غير زيت'] }, category: 'legumes', state: 'cooked', prep: ['Boiled, no salt, no oil', 'مسلوق دون ملح أو زيت'], portions: [CUP()] },
  { id: 'ff_fava_beans_canned', fdc: 173754, name: ['Fava beans, canned', 'فول معلّب'], aliases: { en: ['canned foul', 'canned broad beans'], ar: ['فول معلبات'], eg: ['علبة فول', 'فول علب'] }, category: 'legumes', state: 'as-sold', portions: [CUP()] },
  { id: 'ff_fava_beans_dry', fdc: 175205, name: ['Fava beans, dried (uncooked)', 'فول جاف (غير مطبوخ)'], aliases: { en: ['dried broad beans'], ar: ['فول ناشف'], eg: ['فول ناشف', 'فول تدميس'] }, category: 'legumes', state: 'dry', portions: [CUP()] },
  { id: 'ff_lentils_boiled', fdc: 172421, name: ['Lentils (brown), boiled', 'عدس بجبة مسلوق'], aliases: { en: ['lentils', 'cooked lentils'], ar: ['عدس مطبوخ'], eg: ['عدس', 'عدس بجبة', 'عدس مسلوق'] }, category: 'legumes', state: 'cooked', prep: ['Boiled, no salt', 'مسلوق دون ملح'], portions: [CUP()], replaces: ['seed-food-lentils'] },
  { id: 'ff_lentils_brown_dry', fdc: 172420, name: ['Lentils (brown), uncooked', 'عدس بجبة جاف'], aliases: { en: ['dry lentils'], ar: ['عدس نيء'], eg: ['عدس ناشف'] }, category: 'legumes', state: 'dry', portions: [CUP()] },
  { id: 'ff_lentils_red_dry', fdc: 174284, name: ['Red lentils, uncooked', 'عدس أحمر (أصفر) جاف'], aliases: { en: ['split red lentils', 'masoor'], ar: ['عدس مجروش'], eg: ['عدس أصفر', 'عدس مجروش', 'عدس للشوربة'] }, category: 'legumes', state: 'dry', portions: [CUP()] },
  { id: 'ff_chickpeas_boiled', fdc: 173757, name: ['Chickpeas, boiled', 'حمص مسلوق'], aliases: { en: ['garbanzo beans', 'chick peas'], ar: ['حمص الشام'], eg: ['حمص', 'حمص الشام', 'حمص مسلوق'] }, category: 'legumes', state: 'cooked', prep: ['Boiled, no salt', 'مسلوق دون ملح'], portions: [CUP()], replaces: ['seed-food-chickpeas'] },
  { id: 'ff_chickpeas_canned', fdc: 173800, name: ['Chickpeas, canned, drained', 'حمص معلّب مصفّى'], aliases: { en: ['canned garbanzo'], ar: ['حمص معلبات'], eg: ['علبة حمص'] }, category: 'legumes', state: 'as-sold', portions: [p('can', /^can drained$/, '1 can, drained', 'علبة مصفّاة')] },
  { id: 'ff_white_beans_boiled', fdc: 175203, name: ['White beans, boiled', 'فاصوليا بيضاء مسلوقة'], aliases: { en: ['navy beans', 'cannellini'], ar: ['فاصوليا بيضاء جافة مطبوخة'], eg: ['فاصوليا بيضا', 'فاصوليا ناشفة'] }, category: 'legumes', state: 'cooked', portions: [CUP()] },
  { id: 'ff_kidney_beans_boiled', fdc: 175194, name: ['Red kidney beans, boiled', 'فاصوليا حمراء مسلوقة'], aliases: { en: ['kidney beans'], ar: ['فاصوليا حمراء'], eg: ['فاصوليا حمرا', 'لوبيا حمرا'] }, category: 'legumes', state: 'cooked', portions: [CUP()], replaces: ['seed-food-kidney-beans'] },
  { id: 'ff_green_peas_cooked', fdc: 170017, name: ['Green peas, cooked', 'بازلاء مطبوخة'], aliases: { en: ['peas', 'garden peas'], ar: ['بازلاء'], eg: ['بسلة', 'بسلة مسلوقة'] }, category: 'legumes', state: 'cooked', portions: [p('cup', /^cup$/, '1 cup', 'كوب', { amount: 0.5 })] },
  { id: 'ff_hummus', fdc: 172454, name: ['Hummus (home recipe)', 'حمص بالطحينة (وصفة منزلية)'], aliases: { en: ['hummus', 'houmous', 'chickpea dip'], ar: ['حمص بطحينة'], eg: ['حمص بطحينة', 'حمص شامي'] }, category: 'legumes', state: 'prepared', portions: [p('tbsp', /^tablespoon$/, '1 tbsp', 'ملعقة كبيرة'), CUP()], replaces: ['seed-food-hummus'] },
  { id: 'ff_tahini', fdc: 170189, name: ['Tahini (sesame paste)', 'طحينة (معجون السمسم)'], aliases: { en: ['sesame paste', 'tahina'], ar: ['طحينة خام'], eg: ['طحينة', 'طحينة خام'] }, category: 'nuts-seeds', state: 'as-sold', prep: ['Undiluted paste (not tahini sauce)', 'طحينة خام غير مخففة (وليست سلطة الطحينة)'], portions: [p('tbsp', /^tbsp$/, '1 tbsp', 'ملعقة كبيرة')], replaces: ['seed-food-tahini'] },
  { id: 'ff_falafel_chickpea', fdc: 172455, name: ['Falafel (chickpea, home recipe)', 'فلافل بالحمص (وصفة منزلية)'], aliases: { en: ['falafel', 'chickpea falafel'], ar: ['فلافل'], eg: ['فلافل شامي'] }, category: 'legumes', state: 'prepared', prep: ['Deep-fried', 'مقلية في الزيت'], portions: [p('patty', /^patty/, '1 patty (about 6 cm)', 'قرص (حوالي ٦ سم)')] },
  {
    id: 'ff_taameya', fdc: 172455, name: ['Ta’ameya — Egyptian falafel (estimate)', 'طعمية (تقدير)'], aliases: { en: ['taameya', 'egyptian falafel', 'fava falafel'], ar: ['طعمية', 'فلافل مصرية'], eg: ['طعمية', 'طعمية مقلية', 'فلافل مصري'] }, category: 'legumes', state: 'prepared', prep: ['Deep-fried', 'مقلية في الزيت'],
    proxy: ['No laboratory record exists for Egyptian ta’ameya (made from fava beans). Values are USDA home-recipe chickpea falafel, also deep-fried — the nearest match. Frying oil varies, so treat this as an estimate.', 'لا يوجد سجل معملي للطعمية المصرية المصنوعة من الفول. القيم مأخوذة من الفلافل المنزلية بالحمص لدى USDA (مقلية أيضًا) وهي أقرب مطابق. تختلف كمية زيت القلي، فاعتبرها تقديرًا.'],
    portions: [], replaces: ['seed-food-falafel'],
  },
  {
    id: 'ff_lentil_soup', fdc: 2707462, name: ['Lentil soup (estimate)', 'شوربة عدس (تقدير)'], aliases: { en: ['lentil soup', 'shorbet ads'], ar: ['حساء العدس'], eg: ['شوربة عدس', 'شوربة عدس أصفر'] }, category: 'dishes', state: 'prepared',
    proxy: ['Values are USDA’s survey recipe for plain lentil soup. Egyptian lentil soup (red lentils, onion, carrot, cumin) is similar, but recipes and added fat vary.', 'القيم من وصفة شوربة العدس السادة في مسح USDA. شوربة العدس المصرية (عدس أصفر وبصل وجزر وكمون) قريبة منها، لكن الوصفات وكمية الدهون تختلف.'],
    portions: [p('cup', /^1 cup$/, '1 cup', 'كوب')],
  },
];
