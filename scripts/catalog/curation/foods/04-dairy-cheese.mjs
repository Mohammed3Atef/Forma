/** B4 food curation — milk, yogurt, cheese (Egyptian cheeses without a USDA record are labelled estimates). */
const p = (id, match, en, ar, extra = {}) => ({ id, match, label: [en, ar], ...extra });
const CUP = (o) => p('cup', /^cup$/, '1 cup (240 ml)', 'كوب (٢٤٠ مل)', o);

export default [
  { id: 'ff_milk_whole', fdc: 171265, name: ['Whole milk (3.25% fat)', 'حليب كامل الدسم (٣٫٢٥٪)'], aliases: { en: ['full fat milk', 'milk'], ar: ['حليب'], eg: ['لبن', 'لبن كامل الدسم', 'لبن حليب'] }, category: 'dairy', state: 'as-sold', portions: [CUP()], replaces: ['seed-food-whole-milk'] },
  { id: 'ff_milk_2', fdc: 171267, name: ['Reduced-fat milk (2%)', 'حليب نصف دسم (٢٪)'], aliases: { en: ['semi skimmed milk', '2% milk'], ar: ['حليب قليل الدسم'], eg: ['لبن نص دسم', 'لبن قليل الدسم'] }, category: 'dairy', state: 'as-sold', portions: [CUP()] },
  { id: 'ff_milk_skim', fdc: 171269, name: ['Skim milk (fat-free)', 'حليب خالي الدسم'], aliases: { en: ['skimmed milk', 'fat free milk', 'nonfat milk'], ar: ['حليب منزوع الدسم'], eg: ['لبن خالي الدسم', 'لبن سكيم'] }, category: 'dairy', state: 'as-sold', portions: [CUP()], replaces: ['seed-food-skim-milk'] },
  {
    id: 'ff_laban_rayeb', fdc: 170874, name: ['Laban rayeb — cultured milk (estimate)', 'لبن رايب (تقدير)'], aliases: { en: ['soured milk', 'buttermilk', 'laban'], ar: ['لبن رائب'], eg: ['لبن رايب', 'رايب'] }, category: 'dairy', state: 'as-sold',
    proxy: ['Values are USDA cultured low-fat buttermilk. Home-made laban rayeb from whole milk is richer in fat.', 'القيم من اللبن الرائب المخمّر قليل الدسم لدى USDA. اللبن الرايب البيتي المصنوع من لبن كامل الدسم أعلى في الدهون.'],
    portions: [CUP()],
  },
  { id: 'ff_yogurt_plain_whole', fdc: 171284, name: ['Plain yogurt, whole milk', 'زبادي سادة كامل الدسم'], aliases: { en: ['yoghurt', 'natural yogurt'], ar: ['لبن زبادي'], eg: ['زبادي', 'زبادي كامل الدسم', 'علبة زبادي'] }, category: 'dairy', state: 'as-sold', portions: [p('cup', /^cup \(8 fl oz\)$/, '1 cup', 'كوب')] },
  { id: 'ff_yogurt_plain_lowfat', fdc: 170886, name: ['Plain yogurt, low-fat', 'زبادي سادة قليل الدسم'], aliases: { en: ['low fat yoghurt'], ar: ['زبادي خفيف'], eg: ['زبادي لايت', 'زبادي قليل الدسم'] }, category: 'dairy', state: 'as-sold', portions: [p('cup', /^cup \(8 fl oz\)$/, '1 cup', 'كوب')] },
  { id: 'ff_greek_yogurt_nonfat', fdc: 170894, name: ['Greek yogurt, plain, fat-free', 'زبادي يوناني سادة خالي الدسم'], aliases: { en: ['greek yoghurt', 'strained yogurt nonfat'], ar: ['زبادي يوناني'], eg: ['جريك يوجرت', 'زبادي يوناني'] }, category: 'dairy', state: 'as-sold', portions: [p('container', /^container$/, '1 container (170 g)', 'علبة (١٧٠ جم)')], replaces: ['seed-food-greek-yogurt'] },
  { id: 'ff_greek_yogurt_whole', fdc: 171304, name: ['Greek yogurt, plain, whole milk', 'زبادي يوناني سادة كامل الدسم'], aliases: { en: ['full fat greek yogurt'], ar: ['زبادي يوناني كامل الدسم'], eg: ['جريك يوجرت كامل الدسم'] }, category: 'dairy', state: 'as-sold', portions: [] },

  { id: 'ff_cottage_cheese_4', fdc: 172179, name: ['Cottage cheese (4% fat)', 'جبن كوتيج (٤٪ دسم)'], aliases: { en: ['cottage cheese', 'creamed cottage cheese'], ar: ['جبن قريش كوتيج'], eg: ['جبنة كوتيج', 'كوتيج'] }, category: 'cheese', state: 'as-sold', portions: [p('cup', /^cup, small curd/, '1 cup', 'كوب')], replaces: ['seed-food-cottage-cheese'] },
  { id: 'ff_cottage_cheese_1', fdc: 173417, name: ['Cottage cheese, low-fat (1%)', 'جبن كوتيج قليل الدسم (١٪)'], aliases: { en: ['low fat cottage cheese'], ar: ['جبن كوتيج قليل الدسم'], eg: ['كوتيج لايت'] }, category: 'cheese', state: 'as-sold', portions: [p('cup', /^cup \(not packed\)$/, '1 cup', 'كوب')] },
  {
    id: 'ff_areesh_cheese', fdc: 172181, name: ['Areesh cheese (estimate)', 'جبن قريش (تقدير)'], aliases: { en: ['areesh', 'egyptian quark'], ar: ['جبن قريش'], eg: ['جبنة قريش', 'قريش'] }, category: 'cheese', state: 'as-sold',
    proxy: ['No laboratory record exists for Egyptian areesh. Values are USDA dry-curd fat-free cottage cheese, the nearest match (both are fresh curd cheeses from skimmed milk). Salt and moisture vary.', 'لا يوجد سجل معملي للجبن القريش المصري. القيم من جبن الكوتيج الجاف خالي الدسم لدى USDA وهو أقرب مطابق (كلاهما جبن طازج من لبن منزوع الدسم). تختلف الملوحة والرطوبة.'],
    portions: [],
  },
  { id: 'ff_feta', fdc: 173420, name: ['Feta cheese', 'جبن فيتا'], aliases: { en: ['feta'], ar: ['فيتا'], eg: ['جبنة فيتا', 'فيتا'] }, category: 'cheese', state: 'as-sold', portions: [p('cube', /^cubic inch$/, '1 cube (about 2.5 cm)', 'مكعب (حوالي ٢٫٥ سم)')] },
  {
    id: 'ff_white_cheese_domiati', fdc: 173420, name: ['White cheese — Domiati (estimate)', 'جبن أبيض دمياطي (تقدير)'], aliases: { en: ['egyptian white cheese', 'domiati', 'gebna beyda'], ar: ['جبن أبيض'], eg: ['جبنة بيضا', 'جبن دمياطي', 'جبنة بيضاء'] }, category: 'cheese', state: 'as-sold',
    proxy: ['No laboratory record exists for Egyptian Domiati cheese. Values are USDA feta, the nearest match (both are brined white cheeses). Fat and salt vary by brand.', 'لا يوجد سجل معملي للجبن الدمياطي. القيم من جبن الفيتا لدى USDA وهو أقرب مطابق (كلاهما جبن أبيض محفوظ في محلول ملحي). يختلف الدسم والملح حسب النوع.'],
    portions: [p('cube', /^cubic inch$/, '1 cube (about 2.5 cm)', 'مكعب (حوالي ٢٫٥ سم)')], replaces: ['seed-food-feta'],
  },
  { id: 'ff_mozzarella_part_skim', fdc: 171244, name: ['Mozzarella, part-skim', 'جبن موتزاريلا نصف دسم'], aliases: { en: ['mozzarella'], ar: ['موتزاريلا'], eg: ['موتزاريلا', 'جبنة موتزاريلا'] }, category: 'cheese', state: 'as-sold', portions: [p('slice', /^slice \(1 oz\)$/, '1 slice', 'شريحة'), p('cup', /^cup, shredded$/, '1 cup, shredded', 'كوب مبشور')] },
  { id: 'ff_cheddar', fdc: 173414, name: ['Cheddar cheese', 'جبن شيدر'], aliases: { en: ['cheddar'], ar: ['شيدر'], eg: ['جبنة شيدر', 'شيدر'] }, category: 'cheese', state: 'as-sold', portions: [p('cube', /^cubic inch$/, '1 cube (about 2.5 cm)', 'مكعب (حوالي ٢٫٥ سم)'), p('cup', /^cup, shredded$/, '1 cup, shredded', 'كوب مبشور')], replaces: ['seed-food-cheese-cheddar'] },
  { id: 'ff_parmesan', fdc: 170848, name: ['Parmesan (hard)', 'جبن بارميزان'], aliases: { en: ['parmigiano'], ar: ['بارميزان'], eg: ['بارميزان', 'جبنة بارميزان'] }, category: 'cheese', state: 'as-sold', portions: [] },
  { id: 'ff_cream_cheese', fdc: 173418, name: ['Cream cheese', 'جبن كريمي'], aliases: { en: ['soft cheese'], ar: ['جبن كريمي'], eg: ['جبنة كريمي', 'جبنة كريمة'] }, category: 'cheese', state: 'as-sold', portions: [p('tbsp', /^tbsp$/, '1 tbsp', 'ملعقة كبيرة')] },
  { id: 'ff_ricotta_part_skim', fdc: 171248, name: ['Ricotta, part-skim', 'جبن ريكوتا نصف دسم'], aliases: { en: ['ricotta'], ar: ['ريكوتا'], eg: ['ريكوتا'] }, category: 'cheese', state: 'as-sold', portions: [p('cup', /^cup$/, '1 cup', 'كوب', { amount: 1 })] },
  { id: 'ff_processed_cheese_spread', fdc: 171254, name: ['Processed cheese spread', 'جبن مطبوخ قابل للدهن'], aliases: { en: ['cheese spread', 'processed cheese'], ar: ['جبن مطبوخ'], eg: ['جبنة مثلثات', 'جبنة مطبوخة', 'جبنة سايحة'] }, category: 'cheese', state: 'as-sold', portions: [p('cube', /^cubic inch$/, '1 cube (about 2.5 cm)', 'مكعب (حوالي ٢٫٥ سم)')] },
  { id: 'ff_tofu_firm', fdc: 172475, name: ['Tofu, firm (uncooked)', 'توفو صلب (غير مطبوخ)'], aliases: { en: ['bean curd', 'tofu'], ar: ['جبن الصويا'], eg: ['توفو'] }, category: 'legumes', state: 'raw', portions: [], replaces: ['seed-food-tofu'] },
];
