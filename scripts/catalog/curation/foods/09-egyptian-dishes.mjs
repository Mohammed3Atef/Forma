/**
 * B4 food curation — Egyptian dishes with no measured record, computed from catalog ingredients.
 * Method (documented in B4_FOOD_LIBRARY_ARCHITECTURE.md): ingredient weights are AS SERVED (already
 * cooked components), so no yield factor is assumed; added fat counts in full. Each dish's only
 * household portion is the plate exactly as composed. Every dish is a labelled estimate.
 * Ingredient amounts: a standard home serving — reviewed by a dietitian before production use.
 */
export default [
  {
    id: 'ff_ful_with_oil', name: ['Ful medames with olive oil (estimate)', 'فول مدمس بزيت الزيتون (تقدير)'], aliases: { en: ['ful medames', 'foul with oil'], ar: ['فول بالزيت'], eg: ['طبق فول', 'فول بالزيت', 'فول بزيت زيتون'] }, category: 'dishes', state: 'prepared',
    recipe: { ingredients: [['ff_fava_beans_boiled', 200], ['ff_olive_oil', 13.5], ['ff_lemon_juice', 10]], note: ['1 cup-plus of boiled fava beans (200 g) with 1 tbsp olive oil and a squeeze of lemon. Cumin and salt add no meaningful energy.', 'طبق فول مسلوق (٢٠٠ جم) مع ملعقة كبيرة زيت زيتون وعصرة ليمون. الكمون والملح لا يضيفان طاقة تُذكر.'] },
    portions: [{ id: 'plate', recipeServing: true, label: ['1 plate as described', 'طبق كما في الوصفة'] }],
    replaces: ['seed-food-full-fava'],
  },
  {
    id: 'ff_koshary', name: ['Koshary (estimate)', 'كشري (تقدير)'], aliases: { en: ['koshari', 'kushari'], ar: ['كشري مصري'], eg: ['كشري', 'طبق كشري'] }, category: 'dishes', state: 'prepared',
    recipe: {
      ingredients: [['ff_rice_white_medium_cooked', 150], ['ff_lentils_boiled', 60], ['ff_pasta_cooked', 70], ['ff_chickpeas_boiled', 25], ['ff_tomato_sauce', 90], ['ff_sunflower_oil', 10], ['ff_onion_sauteed', 20]],
      note: ['A medium plate: rice, lentils, pasta and chickpeas (all cooked), tomato sauce made with 2 tsp oil, and sautéed onion. Shop koshary often uses more oil and crisp-fried onion — count extra oil separately.', 'طبق متوسط: أرز وعدس ومكرونة وحمص (مطبوخة)، وصلصة طماطم بملعقتين صغيرتين زيت، وبصل مشوّح. كشري المحلات غالبًا أكثر زيتًا وبصله مقلي مقرمش — احسب الزيت الإضافي منفصلًا.'],
    },
    portions: [{ id: 'plate', recipeServing: true, label: ['1 medium plate as described', 'طبق متوسط كما في الوصفة'] }],
  },
  {
    id: 'ff_molokhia_soup', name: ['Molokhia with chicken broth (estimate)', 'ملوخية بالمرق (تقدير)'], aliases: { en: ['molokhia', 'mulukhiyah'], ar: ['ملوخية خضراء'], eg: ['ملوخية', 'طبق ملوخية', 'ملوخية بالشوربة'] }, category: 'dishes', state: 'prepared',
    recipe: { ingredients: [['ff_jute_leaves_boiled', 150], ['ff_chicken_broth', 200], ['ff_ghee', 7], ['ff_garlic_raw', 6]], note: ['A bowl: cooked jute leaves in chicken broth, finished with garlic fried in ½ tbsp ghee. Meat or rice served with it is counted separately.', 'طبق: ورق ملوخية مطبوخ في مرق الفراخ مع تقلية ثوم في نصف ملعقة كبيرة سمنة. اللحم أو الأرز المقدّم معها يُحسب منفصلًا.'] },
    portions: [{ id: 'bowl', recipeServing: true, label: ['1 bowl as described', 'طبق كما في الوصفة'] }],
  },
  {
    id: 'ff_mahshi_kousa', name: ['Stuffed zucchini — mahshi (estimate)', 'كوسة محشية (تقدير)'], aliases: { en: ['mahshi', 'stuffed zucchini', 'stuffed courgettes'], ar: ['محشي كوسة'], eg: ['محشي', 'محشي كوسة', 'كوسة محشي'] }, category: 'dishes', state: 'prepared',
    recipe: { ingredients: [['ff_zucchini_boiled', 160], ['ff_rice_white_medium_cooked', 90], ['ff_tomato_sauce', 50], ['ff_sunflower_oil', 7], ['ff_parsley_fresh', 5]], note: ['A serving of about 4 small zucchini filled with rice cooked in tomato sauce, herbs and ½ tbsp oil. Meat filling, or more oil and ghee, raise the values.', 'حصة من حوالي ٤ كوسات صغيرة محشوة بأرز مطبوخ في صلصة طماطم وخضرة ونصف ملعقة كبيرة زيت. حشوة اللحم أو زيادة الزيت والسمن ترفع القيم.'] },
    portions: [{ id: 'serving', recipeServing: true, label: ['1 serving as described', 'حصة كما في الوصفة'] }],
  },
  {
    id: 'ff_rice_vermicelli', name: ['Rice with vermicelli (estimate)', 'أرز بالشعرية (تقدير)'], aliases: { en: ['egyptian rice with vermicelli', 'roz bel shaeria'], ar: ['أرز بالشعيرية'], eg: ['رز بالشعرية', 'رز بشعرية'] }, category: 'dishes', state: 'prepared',
    recipe: { ingredients: [['ff_rice_white_medium_cooked', 170], ['ff_pasta_cooked', 20], ['ff_ghee', 7]], note: ['A cup-and-a-bit of cooked rice with toasted vermicelli and ½ tbsp ghee (vermicelli valued as cooked pasta).', 'كوب وشوية من الأرز المطبوخ مع شعرية محمّرة ونصف ملعقة كبيرة سمنة (الشعرية محسوبة كمكرونة مطبوخة).'] },
    portions: [{ id: 'serving', recipeServing: true, label: ['1 serving as described', 'حصة كما في الوصفة'] }],
  },
  { id: 'ff_grape_leaves_stuffed', fdc: 2709064, name: ['Stuffed grape leaves with rice (US survey recipe)', 'ورق عنب محشي بالأرز (وصفة مسح USDA)'], aliases: { en: ['dolma', 'warak enab', 'stuffed vine leaves'], ar: ['ورق عنب محشي'], eg: ['ورق عنب', 'محشي ورق عنب'] }, category: 'dishes', state: 'prepared', prep: ['As recorded in USDA FNDDS (vegetarian, with oil)', 'كما سُجلت في FNDDS لدى USDA (نباتية بالزيت)'], portions: [{ id: 'roll', match: /^1 roll$/, label: ['1 roll', 'صباع واحد'] }] },
];
