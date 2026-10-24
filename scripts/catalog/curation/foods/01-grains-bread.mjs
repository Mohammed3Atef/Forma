/** B4 food curation — grains, rice, pasta, bread. Values + portion weights come from the named USDA record. */
const p = (id, match, en, ar, extra = {}) => ({ id, match, label: [en, ar], ...extra });
const CUP = (o) => p('cup', /^cup$/, '1 cup', 'كوب', o);

export default [
  { id: 'ff_rice_white_medium_cooked', fdc: 168880, name: ['White rice (medium grain), cooked', 'أرز أبيض متوسط الحبة، مطبوخ'], aliases: { en: ['rice', 'egyptian rice', 'boiled rice'], ar: ['أرز مسلوق', 'أرز مصري'], eg: ['رز', 'رز أبيض', 'رز مصري', 'رز مطبوخ'] }, category: 'grains', state: 'cooked', prep: ['Boiled in water, no added fat', 'مسلوق في الماء دون دهون'], portions: [CUP()] },
  { id: 'ff_rice_white_long_cooked', fdc: 168878, name: ['White rice (long grain), cooked', 'أرز أبيض طويل الحبة، مطبوخ'], aliases: { en: ['long grain rice'], ar: ['أرز طويل الحبة'], eg: ['رز طويل', 'رز حبة طويلة'] }, category: 'grains', state: 'cooked', prep: ['Boiled in water, no added fat', 'مسلوق في الماء دون دهون'], portions: [CUP()], replaces: ['seed-food-white-rice'] },
  { id: 'ff_rice_white_dry', fdc: 168879, name: ['White rice (medium grain), uncooked', 'أرز أبيض متوسط الحبة، غير مطبوخ'], aliases: { en: ['raw rice', 'dry rice'], ar: ['أرز نيء'], eg: ['رز ني', 'رز قبل الطبخ'] }, category: 'grains', state: 'dry', portions: [CUP()] },
  { id: 'ff_rice_brown_cooked', fdc: 169704, name: ['Brown rice, cooked', 'أرز بني مطبوخ'], aliases: { en: ['wholegrain rice'], ar: ['أرز بني مسلوق'], eg: ['رز بني', 'رز اسمر'] }, category: 'grains', state: 'cooked', prep: ['Boiled in water, no added fat', 'مسلوق في الماء دون دهون'], portions: [CUP()], replaces: ['seed-food-brown-rice'] },
  {
    id: 'ff_pasta_cooked', fdc: 169737, name: ['Pasta, cooked', 'مكرونة مسلوقة'], aliases: { en: ['spaghetti', 'macaroni', 'penne', 'boiled pasta'], ar: ['معكرونة مطبوخة', 'سباغيتي'], eg: ['مكرونة', 'مكرونة مسلوقة', 'اسباجتي', 'مكرونة قلم', 'مكرونة خواتم'] },
    category: 'grains', state: 'cooked', prep: ['Boiled, no added salt or fat', 'مسلوقة دون ملح أو دهون'],
    portions: [p('cup_spaghetti', /^cup spaghetti not packed$/, '1 cup spaghetti', 'كوب اسباجتي'), p('cup_elbows', /^cup elbows not packed$/, '1 cup elbow macaroni', 'كوب مكرونة خواتم'), p('cup_penne', /^cup penne$/, '1 cup penne', 'كوب مكرونة قلم')],
    replaces: ['seed-food-pasta', 'seed-food-macaroni-bechamel'],
  },
  { id: 'ff_pasta_dry', fdc: 169736, name: ['Pasta, uncooked', 'مكرونة جافة (غير مطبوخة)'], aliases: { en: ['dry pasta', 'raw pasta'], ar: ['معكرونة جافة'], eg: ['مكرونة ني', 'مكرونة قبل الطبخ'] }, category: 'grains', state: 'dry', portions: [] },
  { id: 'ff_pasta_whole_wheat_cooked', fdc: 168910, name: ['Whole-wheat pasta, cooked', 'مكرونة قمح كامل مسلوقة'], aliases: { en: ['wholewheat spaghetti', 'brown pasta'], ar: ['معكرونة بالقمح الكامل'], eg: ['مكرونة سن', 'مكرونة دايت', 'مكرونة بني'] }, category: 'grains', state: 'cooked', portions: [p('cup_spaghetti', /^cup spaghetti not packed$/, '1 cup spaghetti', 'كوب اسباجتي')] },
  { id: 'ff_oats_dry', fdc: 173904, name: ['Rolled oats, uncooked', 'شوفان (غير مطبوخ)'], aliases: { en: ['oats', 'oatmeal dry', 'quick oats'], ar: ['شوفان جاف', 'رقائق الشوفان'], eg: ['شوفان', 'اوتس'] }, category: 'grains', state: 'dry', portions: [CUP({ amount: 1 })], replaces: ['seed-food-oats'] },
  { id: 'ff_oatmeal_cooked', fdc: 173905, name: ['Oatmeal cooked with water', 'شوفان مطبوخ بالماء'], aliases: { en: ['porridge', 'oatmeal'], ar: ['عصيدة الشوفان'], eg: ['شوفان بالمية', 'بليلة شوفان'] }, category: 'grains', state: 'cooked', prep: ['Cooked in water, no salt', 'مطبوخ بالماء دون ملح'], portions: [CUP({ amount: 1 })] },
  { id: 'ff_bulgur_cooked', fdc: 170287, name: ['Bulgur, cooked', 'برغل مطبوخ'], aliases: { en: ['cracked wheat', 'burghul'], ar: ['برغل مسلوق'], eg: ['برغل', 'فريك برغل'] }, category: 'grains', state: 'cooked', portions: [CUP()] },
  { id: 'ff_bulgur_dry', fdc: 170688, name: ['Bulgur, uncooked', 'برغل جاف'], aliases: { en: ['dry bulgur'], ar: ['برغل نيء'], eg: ['برغل ناشف'] }, category: 'grains', state: 'dry', portions: [CUP()] },
  { id: 'ff_couscous_cooked', fdc: 169700, name: ['Couscous, cooked', 'كسكسي مطبوخ'], aliases: { en: ['cous cous'], ar: ['كسكس'], eg: ['كسكسي'] }, category: 'grains', state: 'cooked', portions: [p('cup', /^cup, cooked$/, '1 cup', 'كوب')], replaces: ['seed-food-couscous'] },
  { id: 'ff_quinoa_cooked', fdc: 168917, name: ['Quinoa, cooked', 'كينوا مطبوخة'], aliases: { en: ['quinoa'], ar: ['كينوا'], eg: ['كينوا'] }, category: 'grains', state: 'cooked', portions: [CUP()], replaces: ['seed-food-quinoa'] },
  { id: 'ff_barley_cooked', fdc: 170285, name: ['Pearl barley, cooked', 'شعير مقشور مطبوخ'], aliases: { en: ['barley'], ar: ['شعير'], eg: ['شعير'] }, category: 'grains', state: 'cooked', portions: [CUP()] },
  { id: 'ff_popcorn_air', fdc: 167959, name: ['Popcorn, air-popped', 'فشار بدون زيت'], aliases: { en: ['popcorn'], ar: ['فشار'], eg: ['فشار', 'فشار من غير زيت'] }, category: 'grains', state: 'prepared', portions: [p('cup', /^cup$/, '1 cup', 'كوب')], replaces: ['seed-food-popcorn'] },
  { id: 'ff_rice_cakes_plain', fdc: 170250, name: ['Rice cakes, brown rice, plain', 'كعك الأرز البني سادة'], aliases: { en: ['rice cake', 'puffed rice cake'], ar: ['رقائق أرز منفوخ'], eg: ['رايس كيك', 'كيك رز'] }, category: 'grains', state: 'as-sold', portions: [p('cake', /^cake$/, '1 cake', 'قطعة')], replaces: ['seed-food-rice-cake'] },

  { id: 'ff_bread_pita_white', fdc: 174915, name: ['Pita bread, white', 'خبز بيتا أبيض'], aliases: { en: ['pita', 'arabic bread', 'pocket bread'], ar: ['خبز عربي أبيض'], eg: ['عيش شامي', 'عيش شامي أبيض', 'رغيف شامي'] }, category: 'bread', state: 'as-sold', portions: [p('pita_large', /^pita, large/, '1 large pita (about 16 cm)', 'رغيف كبير (حوالي ١٦ سم)'), p('pita_small', /^pita, small/, '1 small pita (about 10 cm)', 'رغيف صغير (حوالي ١٠ سم)')] },
  { id: 'ff_bread_pita_whole_wheat', fdc: 174916, name: ['Pita bread, whole-wheat', 'خبز بيتا من القمح الكامل'], aliases: { en: ['brown pita', 'wholemeal pita'], ar: ['خبز عربي أسمر'], eg: ['عيش شامي سن', 'عيش سن', 'عيش بني'] }, category: 'bread', state: 'as-sold', portions: [p('pita_large', /^pita, large/, '1 large pita (about 16 cm)', 'رغيف كبير (حوالي ١٦ سم)'), p('pita_small', /^pita, small/, '1 small pita (about 10 cm)', 'رغيف صغير (حوالي ١٠ سم)')] },
  {
    id: 'ff_baladi_bread', fdc: 174916, name: ['Baladi bread (estimate)', 'العيش البلدي (تقدير)'], aliases: { en: ['egyptian bread', 'aish baladi'], ar: ['خبز بلدي'], eg: ['عيش بلدي', 'عيش', 'رغيف بلدي', 'عيش مدعم'] }, category: 'bread', state: 'as-sold',
    proxy: ['No laboratory record exists for Egyptian baladi bread. Values are those of USDA whole-wheat pita, its nearest match. Loaves vary in size — weigh one when you can.', 'لا يوجد سجل معملي للعيش البلدي المصري. القيم مأخوذة من خبز البيتا بالقمح الكامل لدى USDA وهو أقرب مطابق. يختلف حجم الرغيف، فالأفضل وزنه.'],
    portions: [], replaces: ['seed-food-baladi-bread'],
  },
  {
    id: 'ff_fino_roll', fdc: 172796, name: ['Fino roll (estimate)', 'عيش فينو (تقدير)'], aliases: { en: ['egyptian fino', 'soft white roll'], ar: ['خبز فينو'], eg: ['فينو', 'عيش فينو', 'صامولي'] }, category: 'bread', state: 'as-sold',
    proxy: ['No laboratory record exists for Egyptian fino. Values are those of USDA plain hamburger / hot-dog rolls, a similar soft white roll. Sizes vary — weigh it when you can.', 'لا يوجد سجل معملي لعيش الفينو المصري. القيم مأخوذة من خبز البرجر والهوت دوج السادة لدى USDA وهو خبز أبيض طري مشابه. تختلف الأحجام، فالأفضل وزنه.'],
    portions: [],
  },
  { id: 'ff_bread_white', fdc: 174924, name: ['White bread (sandwich loaf)', 'خبز أبيض (توست)'], aliases: { en: ['toast bread', 'white toast', 'sandwich bread'], ar: ['خبز التوست الأبيض'], eg: ['عيش توست', 'توست أبيض', 'توست'] }, category: 'bread', state: 'as-sold', portions: [p('slice_large', /^slice, large$/, '1 large slice', 'شريحة كبيرة'), p('slice_thin', /^slice, thin$/, '1 thin slice', 'شريحة رفيعة')] },
  { id: 'ff_bread_whole_wheat', fdc: 172688, name: ['Whole-wheat bread', 'خبز القمح الكامل (توست أسمر)'], aliases: { en: ['brown bread', 'wholemeal bread', 'brown toast'], ar: ['خبز أسمر'], eg: ['توست بني', 'توست سن', 'عيش توست بني'] }, category: 'bread', state: 'as-sold', portions: [p('slice', /^slice$/, '1 slice', 'شريحة')], replaces: ['seed-food-whole-wheat-bread'] },
  { id: 'ff_bread_french', fdc: 172675, name: ['French bread (baguette)', 'خبز فرنسي (باجيت)'], aliases: { en: ['baguette', 'french stick'], ar: ['باجيت'], eg: ['عيش فرنساوي', 'باجيت'] }, category: 'bread', state: 'as-sold', portions: [] },
];
