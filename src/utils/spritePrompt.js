// Превращает короткий запрос пользователя («красное зелье», «iron sword») в подпись в стиле обучающих
// данных генератора спрайтов. Модель обучена на подписях вида
//   «sword, weapon, gray, long blade, hilt with guard, metal, side view, pixel art, transparent background»,
// а на коротких запросах без контекста даёт размытые формы — поэтому запрос достраивается
// категорией, типичными деталями, материалом и ракурсом. Цвета берутся из запроса.
// Модель знает английские слова: русские названия переводятся словарём ниже.

// [en, ru-основы через запятую, категория, детали, материалы, ракурс, [стиль: 'potion' = цвет в названии]]
const SUBJECTS = [
  // оружие
  ['sword', 'меч,клинок,сабл', 'weapon', 'long blade,hilt with guard,pointed tip', 'metal', 'side'],
  ['dagger', 'кинжал,нож', 'weapon', 'short blade,small hilt,pointed tip', 'metal', 'side'],
  ['axe', 'топор', 'weapon', 'wooden handle,curved blade', 'wood,metal', 'side'],
  ['spear', 'копь,пик', 'weapon', 'long shaft,pointed tip', 'wood,metal', 'side'],
  ['hammer', 'молот', 'weapon', 'wooden handle,heavy head', 'wood,metal', 'side'],
  ['bow', 'лук', 'weapon', 'curved limbs,string', 'wood', 'side'],
  ['arrow', 'стрел', 'weapon', 'long shaft,pointed tip,fletching', 'wood', 'side'],
  ['crossbow', 'арбалет', 'weapon', 'wooden stock,string', 'wood,metal', 'side'],
  ['staff', 'посох,жезл,палочк', 'weapon', 'long shaft,glowing gem', 'wood', 'side'],
  ['shield', 'щит', 'armor', 'round shape,central boss,rim', 'wood,metal', 'front'],
  ['helmet', 'шлем', 'armor', 'rounded top,visor', 'metal', 'front'],
  ['chestplate', 'нагрудник,доспех,броня', 'armor', 'broad shoulders,chest plate', 'metal', 'front'],
  ['boots', 'ботин,сапог', 'armor', 'pair of boots,sole', 'leather', 'side'],
  ['gloves', 'перчат', 'armor', 'five fingers,cuff', 'leather', 'front'],
  // предметы
  ['potion', 'зель,эликсир,склян,бутыл', 'potion', 'glass bottle,cork stopper', 'glass', 'front', 'potion'],
  ['flask', 'колб', 'potion', 'round glass flask,cork stopper', 'glass', 'front', 'potion'],
  ['key', 'ключ', 'tool', 'oval head,notched edge,long shaft', 'metal', 'front'],
  ['coin', 'монет', 'gem', 'round shape,centered design', 'metal', 'front'],
  ['gem', 'самоцвет,драгоцен,кристалл', 'gem', 'faceted gemstone', 'crystal', 'front'],
  ['diamond', 'алмаз,бриллиант', 'gem', 'faceted gemstone,pointed bottom', 'crystal', 'front'],
  ['ring', 'кольц', 'gem', 'round band,set gem', 'metal', 'front'],
  ['crown', 'корон', 'armor', 'pointed crown,jewels', 'metal', 'front'],
  ['scroll', 'свиток', 'container', 'rolled paper,ribbon', 'paper', 'front'],
  ['book', 'книг,фолиант', 'container', 'closed cover,spine', 'paper,leather', 'front'],
  ['chest', 'сундук', 'container', 'lid,metal lock,iron bands', 'wood,metal', 'front'],
  ['barrel', 'бочк', 'container', 'wooden staves,metal hoops', 'wood,metal', 'front'],
  ['bag', 'мешок,сумк,рюкзак', 'container', 'tied top,rounded body', 'leather', 'front'],
  ['lantern', 'фонар', 'tool', 'glass panes,handle', 'metal,glass', 'front'],
  ['torch', 'факел', 'tool', 'wooden handle,flame on top', 'wood', 'side'],
  ['bomb', 'бомб', 'weapon', 'round body,fuse', 'metal', 'front'],
  ['pickaxe', 'кирк', 'tool', 'wooden handle,pointed head', 'wood,metal', 'side'],
  ['shovel', 'лопат', 'tool', 'wooden handle,flat blade', 'wood,metal', 'side'],
  ['map', 'карт', 'container', 'folded paper', 'paper', 'front'],
  ['heart', 'сердц', 'ui icon', 'heart shape,highlight', '', 'front'],
  ['star', 'звезд', 'ui icon', 'five points', '', 'front'],
  // еда
  ['apple', 'яблок', 'food', 'round fruit,stem,leaf', '', 'front'],
  ['cherries', 'вишн,черешн', 'food', 'two cherries,green stems', '', 'front'],
  ['strawberry', 'клубник,земляник', 'food', 'seeds,green leaves', '', 'front'],
  ['lemon', 'лимон', 'food', 'oval fruit,pointed ends', '', 'front'],
  ['carrot', 'морков', 'food', 'long root,green leaves', '', 'front'],
  ['bread', 'хлеб,булк', 'food', 'baked loaf,crust', '', 'front'],
  ['cheese', 'сыр', 'food', 'wedge shape,holes', '', 'front'],
  ['meat', 'мясо,стейк,окорок', 'food', 'cooked meat,bone', '', 'front'],
  ['cake', 'торт,пирог', 'food', 'layers,frosting', '', 'front'],
  ['cookie', 'печень', 'food', 'round shape,chocolate chips', '', 'front'],
  ['fish', 'рыб', 'creature', 'tail fin,eye,scales', 'scale', 'side'],
  ['egg', 'яйц', 'food', 'oval shape', '', 'front'],
  ['mushroom', 'гриб', 'plant', 'cap,stem,spots', '', 'front'],
  // существа и персонажи
  ['slime', 'слайм,слизь,желе', 'creature', 'round body,two eyes,smiling mouth', '', 'front'],
  ['skeleton', 'скелет', 'creature', 'skull,rib cage,bones', 'bone', 'front'],
  ['dragon', 'дракон', 'creature', 'wings,horns,tail,sharp teeth', 'scale', 'side'],
  ['cat', 'кот,кош', 'creature', 'pointed ears,tail curled,eyes', 'fur', 'front'],
  ['dog', 'собак,пес,пёс', 'creature', 'floppy ears,tail,snout', 'fur', 'side'],
  ['wolf', 'волк', 'creature', 'pointed ears,snout,tail', 'fur', 'side'],
  ['bat', 'летуч', 'creature', 'spread wings,pointed ears', 'fur', 'front'],
  ['spider', 'паук', 'creature', 'eight legs,round body', '', 'top-down'],
  ['ghost', 'призрак,привиден', 'creature', 'floating,wavy bottom,eyes', '', 'front'],
  ['goblin', 'гоблин', 'creature', 'pointed ears,big nose,crooked smile', 'flesh', 'front'],
  ['rat', 'крыс', 'creature', 'long tail,small ears', 'fur', 'side'],
  ['bird', 'птиц,птич', 'creature', 'beak,wings,tail feathers', 'feather', 'side'],
  ['knight', 'рыцар', 'character', 'helmet with visor,shield held,standing upright', 'metal', 'front'],
  ['wizard', 'маг,волшебник,колдун', 'character', 'pointed hat,long robe,holding staff', 'cloth', 'front'],
  ['archer', 'лучник', 'character', 'hood,holding bow,quiver', 'cloth,leather', 'front'],
  ['princess', 'принцесс', 'character', 'long dress,crown', 'cloth', 'front'],
  ['villager', 'крестьян,житель,селян', 'character', 'simple clothes,standing posture', 'cloth', 'front'],
  ['robot', 'робот', 'character', 'boxy body,visor,joints', 'metal', 'front'],
  ['zombie', 'зомби', 'character', 'torn clothes,outstretched arms', 'flesh,cloth', 'front'],
  ['girl', 'девоч,девуш', 'character', 'long hair,dress', 'cloth', 'front'],
  ['boy', 'мальчик,парень', 'character', 'short hair,shirt', 'cloth', 'front'],
  // природа и окружение
  ['tree', 'дерев,ёлк,ель', 'plant', 'trunk,leafy canopy', 'wood', 'front'],
  ['flower', 'цвет', 'plant', 'petals,green stem,leaves', '', 'front'],
  ['rock', 'камен,валун,скал', 'terrain tile', 'rough surface,cracks', 'stone', 'front'],
  ['bush', 'куст', 'plant', 'leafy,round shape', '', 'front'],
  ['cactus', 'кактус', 'plant', 'spikes,arms', '', 'front'],
  ['crystal', 'кристал', 'gem', 'pointed crystal cluster', 'crystal', 'front'],
  ['house', 'дом,хижин', 'building', 'roof,door,window', 'wood', 'front'],
  ['castle', 'замок,крепост', 'building', 'towers,battlements,gate', 'stone', 'front'],
  ['tower', 'башн', 'building', 'tall tower,battlements', 'stone', 'front'],
  ['door', 'двер', 'furniture', 'wooden door,handle', 'wood', 'front'],
  ['table', 'стол', 'furniture', 'flat top,four legs', 'wood', 'front'],
  ['chair', 'стул,кресл', 'furniture', 'backrest,four legs', 'wood', 'front'],
  ['bed', 'кроват', 'furniture', 'mattress,pillow', 'wood,cloth', 'front'],
  ['campfire', 'костер,костёр', 'effect', 'burning logs,flames', 'wood', 'front'],
  ['fire', 'огонь,пламя', 'effect', 'flames', '', 'front'],
  ['explosion', 'взрыв', 'effect', 'burst,sparks', '', 'front'],
  ['sparkle', 'искр,блеск', 'effect', 'small stars', '', 'front'],
  ['stone wall', 'стен,кирпич', 'terrain tile', 'stone bricks,mortar lines', 'stone', 'front'],
  ['grass', 'трав', 'terrain tile', 'blades of grass', '', 'top-down'],
  ['water', 'вод', 'terrain tile', 'ripples', '', 'top-down'],
  ['lava', 'лав', 'terrain tile', 'bubbling,cracks', '', 'top-down'],
  ['sand', 'песок,песч', 'terrain tile', 'grains', '', 'top-down'],
  ['wooden planks', 'доск,паркет', 'terrain tile', 'wood grain,planks', 'wood', 'top-down'],
];

const COLORS = [
  ['red', 'красн,алый,алая'], ['orange', 'оранж'], ['yellow', 'желт,жёлт'], ['green', 'зелен,зелён'], ['blue', 'син,голуб'],
  ['purple', 'фиолет,пурпур'], ['pink', 'розов'], ['brown', 'коричнев'], ['gray', 'сер,gray,grey'], ['white', 'бел'],
  ['black', 'черн,чёрн'], ['teal', 'бирюз'], ['gold', 'золот'], ['silver', 'серебр'],
];

// Русские прилагательные материала/размера → английские слова (берутся, только если их знает модель).
const ADJECTIVES = [
  ['iron', 'железн'], ['steel', 'стальн'], ['wooden', 'деревянн'], ['stone', 'каменн'], ['golden', 'золотой,золотая,золотое,золотые,золотую'],
  ['silver', 'серебрян'], ['leather', 'кожан'], ['magic', 'магическ,волшебн'], ['ice', 'ледян'], ['small', 'маленьк'], ['big', 'больш'],
  ['old', 'стар'], ['rusty', 'ржав'], ['crystal', 'хрустальн'],
];

const tokenize = (s) => (s.toLowerCase().match(/[a-zа-яё0-9]+/g) || []);
const stems = (list) => list.split(',').map((x) => x.trim()).filter(Boolean);

const INDEX = SUBJECTS.map((row) => {
  const [en, ru, cat, det, mat, view, style] = row;
  return { en, cat, det: stems(det), mat: stems(mat), view, style, ru: stems(ru) };
});
const COLOR_INDEX = COLORS.map(([en, ru]) => ({ en, keys: stems(ru) }));

function matchSubject(tokens) {
  // самое длинное совпадение: английское название (с мн.ч.) или русская основа
  let best = null;
  for (let i = 0; i < tokens.length; i += 1) {
    for (const s of INDEX) {
      const words = s.en.split(' ');
      const slice = tokens.slice(i, i + words.length).join(' ');
      const plural = (slice.endsWith('s') ? slice.slice(0, -1) : slice);
      const hit = slice === s.en || plural === s.en || (words.length === 1 && (tokens[i] === `${s.en}es` || tokens[i] === `${s.en}s`))
        || (words.length === 1 && s.ru.some((r) => tokens[i].startsWith(r) && tokens[i].length <= r.length + 4));
      if (hit && (!best || words.length > best.len)) best = { s, at: i, len: words.length };
    }
  }
  return best;
}

function matchColors(tokens) {
  const found = []; const used = new Set();
  tokens.forEach((tok, i) => {
    for (const c of COLOR_INDEX) {
      if (tok === c.en || c.keys.some((k) => tok.startsWith(k) && tok.length <= k.length + 4)) {
        if (!found.includes(c.en)) found.push(c.en);
        used.add(i);
        break;
      }
    }
  });
  return { found, used };
}

const TAIL = 'pixel art, transparent background';

// vocab — необязательный Set слов словаря модели: нераспознанные английские слова из запроса, которые модель
// знает, добавляются как есть. Возвращает { prompt, subject, known, unknown }.
export function buildPrompt(text, vocab) {
  const raw = (text || '').trim();
  if (!raw) return { prompt: '', subject: null, known: false, unknown: [] };
  // уже подпись в обучающем стиле — не трогаем
  if ((raw.match(/,/g) || []).length >= 3 || /pixel art/i.test(raw)) return { prompt: raw, subject: null, known: true, unknown: [] };
  const tokens = tokenize(raw);
  const m = matchSubject(tokens);
  const { found: colors, used } = matchColors(tokens);
  const adjectives = [];
  tokens.forEach((tok, i) => {
    for (const [en, keys] of ADJECTIVES) {
      if (stems(keys).some((k) => tok.startsWith(k)) && /[а-яё]/.test(tok) && !(m && i >= m.at && i < m.at + m.len)) {
        if (!vocab || vocab.has(en)) adjectives.push(en);
        used.add(i);
        break;
      }
    }
  });
  const rest = tokens.filter((tok, i) => !used.has(i) && !(m && i >= m.at && i < m.at + m.len));
  const isLatin = (w) => /^[a-z0-9]+$/.test(w);
  const extra = [...adjectives, ...rest.filter((w) => isLatin(w) && (!vocab || vocab.has(w)))];
  const unknown = rest.filter((w) => !isLatin(w) || (vocab && !vocab.has(w)));
  if (!m) {
    // предмет не из словаря: передаём английские слова запроса как есть, достраивая стиль
    if (!extra.length && !colors.length) return { prompt: '', subject: null, known: false, unknown };
    const prompt = [...(colors.length ? [`${colors[0]} ${extra.join(' ')}`.trim()] : [extra.join(' ')]), ...colors.slice(1), TAIL].filter(Boolean).join(', ');
    return { prompt, subject: null, known: false, unknown };
  }
  const { s } = m;
  const parts = [];
  if (s.style === 'potion') {
    parts.push(`${[colors[0] || 'blue', ...extra].join(' ')} ${s.en === 'flask' ? 'potion' : s.en}`, ...s.det, 'item icon');
  } else {
    parts.push([...extra, s.en].join(' '), s.cat, ...colors.slice(0, 2), ...s.det, ...s.mat, `${s.view} view`);
  }
  parts.push(TAIL);
  return { prompt: [...new Set(parts)].join(', '), subject: s.en, known: true, unknown };
}

export const EXAMPLES = {
  ru: ['красное зелье', 'железный меч', 'деревянный сундук', 'зелёный слайм', 'золотая корона', 'яблоко', 'рыцарь', 'ключ'],
  en: ['red potion', 'iron sword', 'wooden chest', 'green slime', 'golden crown', 'apple', 'knight', 'key'],
};
