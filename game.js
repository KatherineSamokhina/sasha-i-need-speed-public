"use strict";

/* =====================================================================
   I NEED SPEED 1: First Racing — Этап 1
   Наш собственный мини-движок псевдо-3D (как в старых гонках F1!)
   =====================================================================
   Как это работает, по-простому:

   1. Трасса — это список СЕГМЕНТОВ (кусочков дороги). У каждого кусочка
      есть "изгиб" (curve): 0 — прямо, плюс — вправо, минус — влево.

   2. Каждый кадр мы берём ~300 сегментов перед машиной и ПРОЕЦИРУЕМ их
      из 3D-мира на плоский экран: что дальше — то рисуется меньше и
      ближе к горизонту. Каждый кусочек — трапеция. Из сотен трапеций
      складывается дорога.

   3. Поворот — это когда дальние сегменты постепенно сдвигаются вбок.
      Дорога на самом деле никуда не поворачивает, но глаз верит!
   ===================================================================== */

// ---------- Холст ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;   // 960
const H = canvas.height;  // 540

// ---------- Настройки "камеры" и дороги ----------
const ROAD_WIDTH  = 2100;   // половина ширины дороги (в мировых единицах)
const SEG_LEN     = 200;    // длина одного сегмента дороги
const RUMBLE_LEN  = 3;      // сколько сегментов в одной цветной полосе
const DRAW_DIST   = 300;    // сколько сегментов видно вдаль
const CAM_HEIGHT  = 1150;   // высота камеры над дорогой (повыше —
                            // видно дальше, соперники заметны заранее)
const FOV         = 100;    // угол обзора камеры (в градусах)
const CAM_DEPTH   = 1 / Math.tan((FOV / 2) * Math.PI / 180);
const FOG_DENSITY = 5;      // насколько быстро дорога "тает" вдали
const LANES       = 3;      // количество полос на дороге

// ---------- Общая физика ----------
// MAX_SPEED — это "потолок игры": 360 км/ч (запас под будущий болид F1!).
// У каждой МАШИНЫ своя максималка и свой разгон — смотри ГАРАЖ ниже.
const MAX_SPEED     = SEG_LEN * 60;
const GAME_TOP_KMH  = 360;
const KMH           = MAX_SPEED / GAME_TOP_KMH; // игровых единиц в 1 км/ч
// Торможение двигателем (на ручной, при передаче ниже скорости):
// мягкое, ~12 км/ч в секунду — настоящий тормоз теперь у каждой
// машины свой, смотри BRAKE_100_0 в гараже!
const ENGINE_BRAKE  = -KMH * 12;
const OFFROAD_DECEL = -KMH * 92;        // трава ОЧЕНЬ тормозит
const OFFROAD_LIMIT =  KMH * 46;        // ниже этой скорости трава уже не тормозит
const CENTRIFUGAL   = 0.3;              // как сильно поворот "выталкивает" машину

// НАКАТ (спецификация Саши): отпустил газ — машина катится и почти
// не замедляется. По прямой теряем 1 км/ч за 5 секунд, в повороте —
// 1 км/ч за 3 секунды (повёрнутые колёса трутся сильнее).
const COAST_DECEL      = -KMH / 5;
const COAST_DECEL_TURN = -KMH / 3;
// А ещё в повороте мотор разгоняет медленнее: часть сил уходит вбок
const TURN_ACCEL_FACTOR = 0.6;

// =====================================================================
//  ГАРАЖ: машины и их характеристики
//  Всё по-настоящему: максималка, разгон 0–100 и категория коробки
//  (система Саши: А — автомат, М — механика, С — смешанная).
// =====================================================================

const CARS = [
  {
    id: "aveo", name: "Chevalet Avio 2013", gearbox: "С",
    topKmh: 185, zeroTo100: 11.5,
    desc: "Первая машина игры. Дизайн — по спецификации Саши.",
  },
  {
    id: "picanto", name: "Kiwi Pikanto 2018", gearbox: "А",
    topKmh: 173, zeroTo100: 12.3,
    desc: "Городской малыш на автомате. Лёгкий, юркий, дружелюбный.",
  },
  {
    id: "focus", name: "Fjord Fokus", gearbox: "А",
    topKmh: 210, zeroTo100: 8.9,
    desc: "Крепкий хэтчбек: заметно быстрее, но всё прощает.",
  },
  {
    id: "delorean", name: "TMC TimeLorean TMC-12", gearbox: "С",
    topKmh: 177, zeroTo100: 10.3,
    desc: "Легенда из нержавейки: жалюзи на стекле и фонари-сетки. 88 миль/ч = 142 км/ч… попробуй разогнаться!",
  },
  {
    // Та самая Корса, с которой было "всё тяжело"! Саша уточнил:
    // НЕ электрическая — обычная бензиновая (фото было электро-
    // версии, но кузов у них одинаковый). Категория С — решение
    // Саши, принято 19.09.2026. Загадка Корсы разгадана!
    id: "corsa", name: "Opal Corza", gearbox: "С",
    topKmh: 194, zeroTo100: 9.9,
    modes: true,   // фишка Корсы (заметил Саша): 3 режима поездки!
    desc: "Новейшая Корза: 3 режима поездки — Эко, Норма и Спорт!",
  },
  {
    id: "camaro70", name: "Chevalet Camarro SS 1970", gearbox: "М",
    topKmh: 201, zeroTo100: 7.1,
    desc: "Оранжевый маслкар с белыми полосами. Только механика, только хардкор!",
  },
  {
    id: "camaroNew", name: "Chevalet Camarro SS", gearbox: "С",
    topKmh: 290, zeroTo100: 4.3,
    desc: "Современный мускул: белый, злой, четыре трубы в диффузоре.",
  },
  {
    id: "vetteC1", name: "Chevalet Corvetta 1959", gearbox: "М",
    topKmh: 206, zeroTo100: 7.8,
    desc: "Классика с хромом: плавные крылья и круглые фонари.",
  },
  {
    id: "vetteC8", name: "Chevalet Corvetta Stingrey", gearbox: "М",
    topKmh: 296, zeroTo100: 3.5,
    desc: "Клин-суперкар: мотор за спиной, крыло и четыре трубы.",
  },
  {
    id: "shelby", name: "Shelbee Mustango GT500 1967", gearbox: "М",
    topKmh: 206, zeroTo100: 6.5,
    desc: "Белый с синими полосами Ле-Мана. Легенда шестидесятых.",
  },
  {
    id: "darkhorse", name: "Fjord Mustango Dark Pony", gearbox: "С",
    topKmh: 267, zeroTo100: 4.1,
    modes: true,   // у Тёмного Коня тоже есть режимы поездки!
    desc: "Тёмный Пони 2023: три полосы фонарей, сильнее старого Шелбби.",
  },
  {
    id: "fford", name: "Болид Формулы Фьорд", gearbox: "М",
    topKmh: 235, zeroTo100: 4.6,
    noNpc: true,  // решение Саши: соперникам болиды не выдаются!
    desc: "Открытые колёса, серийный мотор, лёгкий как пёрышко.",
  },
  {
    id: "f1", name: "Болид Ф-1", gearbox: "М",
    topKmh: 350, zeroTo100: 2.6,
    noNpc: true,  // решение Саши: соперникам болиды не выдаются!
    desc: "Король скорости: огромное крыло, 350 км/ч. Вершина гаража!",
  },
  {
    id: "zis", name: "ЗИС-115 Бронированный", gearbox: "М",
    topKmh: 140, zeroTo100: 22.0,
    ram: true,      // спецспособность (идея Саши): ТАРАНИТ всё подряд
                    // и не замедляется на траве. Броня есть броня!
    noBrakes: true, // а ещё у него НЕТ ТОРМОЗОВ — «по приколу» © Саша
    noNpc: true,    // и соперникам ЗИС не выдаётся (решение Саши)
    desc: "Таранит деревья, не вязнет в траве… и НЕ УМЕЕТ ТОРМОЗИТЬ. Удачи!",
  },
  {
    id: "disco", name: "Sand Hover Discoverry", gearbox: "С",
    topKmh: 209, zeroTo100: 8.1,
    offroadSoft: true,  // внедорожник: трава НЕ тормозит (но аварии убивают!)
    desc: "Большой внедорожник: трава ему не помеха. Но деревья объезжай!",
  },
  {
    id: "hilux", name: "Tayoda Highlux", gearbox: "М",
    topKmh: 145, zeroTo100: 16.5,
    offroadSoft: true,  // пикап-вездеход: трава НЕ тормозит (но аварии убивают!)
    desc: "Пикап-вездеход: по траве как по асфальту. Только деревья не таранит!",
  },
  {
    id: "rav4", name: "Tayoda REV4", gearbox: "А",
    topKmh: 195, zeroTo100: 8.4,   // реальные цифры RAV4 2.5 AWD
    offroadSoft: true,  // кроссовер: трава НЕ тормозит (но аварии убивают!)
    desc: "Современный кроссовер: быстрый на шоссе и не боится травы.",
  },
  {
    id: "buhanka", name: "Буханка 452", gearbox: "М",
    topKmh: 100, zeroTo100: 30.0,  // честные цифры: она не про скорость
    offroadSoft: true,  // фургон-вездеход: трава НЕ тормозит!
    desc: "Легендарный фургон-вездеход: не быстрый, зато нигде не застрянет.",
  },
  {
    id: "raf", name: "РАФ 2203", gearbox: "М",
    topKmh: 120, zeroTo100: 26.0,  // рижский микроавтобус, тоже не гонщик
    offroadSoft: true,  // решение Саши: УАЗ и РАФ — внедорожники!
    desc: "Рижский микроавтобус: возил такси и скорую. Теперь — гоняет!",
  },
  {
    id: "kopeyka", name: "Копейка 2101", gearbox: "М",
    topKmh: 142, zeroTo100: 20.0,  // честные заводские цифры ВАЗ-2101
    desc: "Вишнёвая классика: хром, честная механика и вечная любовь.",
  },
  {
    id: "semerka", name: "Семёрка 2107", gearbox: "М",
    topKmh: 150, zeroTo100: 16.0,  // заводские цифры ВАЗ-2107
    desc: "Белая семёрка: большие фонари, дворовый престиж высшей пробы.",
  },
  {
    id: "chetverka", name: "Четвёрка 2104", gearbox: "М",
    topKmh: 143, zeroTo100: 19.0,  // заводские цифры ВАЗ-2104
    desc: "Красный универсал: багажник размером с дачу. Везёт ВСЁ.",
  },
  // ---- Американский автосалон (17 фото от Саши за один раз!) ----
  {
    id: "challenger", name: "Dodgee Challenjer", gearbox: "С",
    topKmh: 280, zeroTo100: 4.5,
    desc: "Кислотно-зелёный мускул: рычит так, что дрожат стёкла.",
  },
  {
    id: "charger14", name: "Dodgee Charjer", gearbox: "А",
    topKmh: 250, zeroTo100: 5.5,
    desc: "Чёрный седан-мускул: семейный снаружи, злой внутри.",
  },
  {
    id: "charger69", name: "Dodgee Charjer 1969", gearbox: "М",
    topKmh: 215, zeroTo100: 6.5,
    desc: "Жёлтая легенда 60-х: полоса-шмель и хромовый характер.",
  },
  {
    id: "durango", name: "Dodgee Duranga", gearbox: "А",
    topKmh: 210, zeroTo100: 7.5,
    offroadSoft: true,
    desc: "Белый семейный танк: фонарь во всю корму, как гоночный трек.",
  },
  {
    id: "escalade", name: "Kadillark Eskalade", gearbox: "А",
    topKmh: 180, zeroTo100: 6.8,
    offroadSoft: true,
    desc: "Чёрный небоскрёб на колёсах с фонарями до самой крыши.",
  },
  {
    id: "sixteen", name: "Kadillark Sixteen", gearbox: "А",
    topKmh: 300, zeroTo100: 4.0,
    desc: "Концепт с мотором V16: шестнадцать цилиндров роскоши.",
  },
  {
    id: "cruze", name: "Chevalet Cruzze", gearbox: "С",
    topKmh: 195, zeroTo100: 9.5,
    desc: "Красный аккуратный седан: галстук-бабочка на багажнике.",
  },
  {
    id: "ecosport", name: "Fjord EkoSport", gearbox: "С",
    topKmh: 180, zeroTo100: 11.5,
    offroadSoft: true,
    desc: "Синий малыш с запаской на двери — готов к приключениям.",
  },
  {
    id: "kuga", name: "Fjord Kugga", gearbox: "А",
    topKmh: 196, zeroTo100: 9.2,
    offroadSoft: true,
    desc: "Чёрный кроссовер: тихий, удобный и не боится обочин.",
  },
  {
    id: "fordgt", name: "Fjord GT", gearbox: "А",
    topKmh: 348, zeroTo100: 3.0,
    desc: "Синий гиперкар: круглые фонари-турбины и 348 км/ч!",
  },
  {
    id: "nautilus", name: "Linkorn Nautilas", gearbox: "А",
    topKmh: 210, zeroTo100: 6.5,
    offroadSoft: true,
    desc: "Синий люкс-кроссовер с фонарём через всю корму.",
  },
  {
    id: "continental17", name: "Linkorn Kontinental", gearbox: "А",
    topKmh: 240, zeroTo100: 5.8,
    desc: "Чёрный лимузин-джентльмен: тонкая полоса света и тишина.",
  },
  {
    id: "mark5", name: "Linkorn Марк V 1979", gearbox: "А",
    topKmh: 190, zeroTo100: 11.5,
    desc: "Голубой корабль 70-х: горб запаски на багажнике — фирменный знак.",
  },
  {
    id: "lincoln60", name: "Linkorn Kontinental 1960", gearbox: "А",
    topKmh: 175, zeroTo100: 11.0,
    desc: "Белый крейсер с плавниками и четырьмя круглыми огнями.",
  },
  {
    id: "navigator", name: "Linkorn Navigador", gearbox: "А",
    topKmh: 175, zeroTo100: 7.5,
    offroadSoft: true,
    desc: "Серый гигант: три ряда сидений и капитанский мостик.",
  },
  {
    id: "zephyr", name: "Linkorn Zefir", gearbox: "А",
    topKmh: 210, zeroTo100: 7.8,
    desc: "Серебристый зефир: мягкий, сладкий, быстрее, чем кажется.",
  },
  {
    id: "mkz", name: "Linkorn MKZ", gearbox: "А",
    topKmh: 250, zeroTo100: 5.6,
    desc: "Белый красавец: светящаяся дуга через всю корму.",
  },
  // ---- Корейский день (5 фото от Саши) ----
  {
    id: "sportage", name: "Kiwi Sportage", gearbox: "А",
    topKmh: 201, zeroTo100: 9.1,
    offroadSoft: true,
    desc: "Красный кроссовер: бодрый, семейный и не боится обочин.",
  },
  {
    id: "k5", name: "Kiwi K5", gearbox: "А",
    topKmh: 210, zeroTo100: 7.6,
    desc: "Синий красавец: фонарь-пунктир через всю корму.",
  },
  {
    id: "sonata", name: "Hyondai Sonata", gearbox: "А",
    topKmh: 210, zeroTo100: 8.0,
    desc: "Чёрный стиляга: светящаяся лента и имя по буквам.",
  },
  {
    id: "tucson", name: "Hyondai Tucson", gearbox: "А",
    topKmh: 185, zeroTo100: 9.4,
    offroadSoft: true,
    desc: "Серый гибрид с фонарями-когтями. Дворник спрятан под спойлер!",
  },
  {
    id: "i30", name: "Hyondai i30", gearbox: "С",
    topKmh: 192, zeroTo100: 10.5,
    desc: "Серебристый хэтчбек-кругляш: честный работяга.",
  },
  // ---- Гиперкары (восторг Саши: «СКОРОСТЬ ГЕМЕРЫ!!!») ----
  {
    id: "gemera", name: "Konisegg Gemera", gearbox: "А",
    topKmh: 344,      // ограничение Саши: «у гемеры ограничь 344»
    zeroTo100: 1.9,   // 1700 гибридных лошадей!
    noNpc: true,      // соперникам гиперкары не выдаются — нечестно!
    desc: "1700 сил и 0–100 за 1.9 сек. Электроника держит 344 км/ч.",
  },
  {
    id: "wayra", name: "Paganny Wayra BC", gearbox: "М",
    topKmh: 335,      // правка Саши: Пагани медленнее Гемеры
    zeroTo100: 2.8,
    noNpc: true,      // соперникам гиперкары не выдаются — нечестно!
    desc: "Роскошь: карбон, крыло-этажерка и четыре трубы букетом.",
  },
  // ---- Мерседес-день (4 фото от Саши) ----
  {
    id: "merc190", name: "Merzedes 190E Evo", gearbox: "М",
    topKmh: 250, zeroTo100: 7.1,
    desc: "Чёрная классика гонок: спойлер на багажнике и характер чемпиона.",
  },
  {
    id: "amggt53", name: "Merzedes AMJ GT 53", gearbox: "А",
    topKmh: 285, zeroTo100: 4.5,
    desc: "Матово-серый зверь: крыло-карбон и четыре трубы парами.",
  },
  {
    id: "maybach", name: "Merzedes-Maybax S", gearbox: "А",
    topKmh: 250, zeroTo100: 4.8,
    desc: "Двухцветная роскошь: едет тихо, выглядит громко.",
  },
  {
    id: "gle", name: "Merzedes GLE Coupe", gearbox: "А",
    topKmh: 240, zeroTo100: 5.7,
    offroadSoft: true,
    desc: "Белый купе-внедорожник: покатая крыша, широкие плечи.",
  },
  // ---- Четвёрка №47–50: Пежо и династия Волг! ----
  {
    id: "pejo308", name: "Pejo 308 R", gearbox: "С",
    topKmh: 250, zeroTo100: 6.0,
    desc: "Матовый хот-хэтч с красной крышей: лев на корме рычит.",
  },
  {
    id: "volga3110", name: "Волга 3110", gearbox: "М",
    topKmh: 147, zeroTo100: 13.5,
    desc: "Белая рабочая лошадка: большие оранжевые фонари, стальной характер.",
  },
  {
    id: "volga24", name: "Волга 24", gearbox: "М",
    topKmh: 145, zeroTo100: 19.0,
    desc: "Серебристая классика: хром по кругу и багажник-чемодан.",
  },
  {
    id: "volga21", name: "Волга 21", gearbox: "М",
    topKmh: 130, zeroTo100: 34.0,  // честно: она никуда не торопится
    desc: "Розовая с белой крышей: олень на капоте, «Три тополя» на Плющихе.",
  },
  {
    id: "tuatara", name: "ZSC Tuatara", gearbox: "А",
    topKmh: 320,      // ограничение Саши: «MAX 320 км час»
    zeroTo100: 2.5,
    noNpc: true,      // соперникам гиперкары не выдаются — нечестно!
    desc: "Белая капля-ракета: плавники, лента огня и электроника на 320.",
  },
];

// Режимы поездки (фишка Корсы — идея Саши): меняют тягу и голос мотора.
// ЭКО бережёт мотор (70% тяги), СПОРТ выжимает всё (120%!)
const MODE_NAMES  = ["ЭКО", "НОРМА", "СПОРТ"];
const MODE_COLORS = ["#57d977", "#ffffff", "#ff5050"];
const MODE_ACCEL  = [0.7, 1.0, 1.2];
let driveMode = 2;   // круг начинается со СПОРТА — решение Саши!

// ТОРМОЗА 100–0 (идея Саши): за сколько секунд машина останавливается
// со 100 км/ч. У спорткаров тормоза цепкие, у тяжёлого ЗИСа — вечность!
const BRAKE_100_0 = {
  aveo: 3.0, picanto: 2.9, corsa: 2.8, focus: 2.7, delorean: 3.2,
  camaro70: 3.4, camaroNew: 2.4, vetteC1: 3.5, vetteC8: 2.1,
  shelby: 3.3, darkhorse: 2.3, fford: 1.8, f1: 1.2,
  zis: 5.5, disco: 3.1, hilux: 4.0, rav4: 2.9, buhanka: 4.6, raf: 4.2,
  kopeyka: 4.0, semerka: 3.8, chetverka: 3.9,
  challenger: 2.5, charger14: 2.7, charger69: 3.4, durango: 3.0,
  escalade: 3.1, sixteen: 2.4, cruze: 2.9, ecosport: 3.0, kuga: 2.9,
  fordgt: 1.5, nautilus: 2.8, continental17: 2.6, mark5: 3.8,
  lincoln60: 4.0, navigator: 3.2, zephyr: 2.9, mkz: 2.6,
  gemera: 1.7, wayra: 1.6, tuatara: 1.6,
  merc190: 3.0, amggt53: 2.3, maybach: 2.5, gle: 2.7,
  pejo308: 2.6, volga3110: 3.9, volga24: 4.1, volga21: 4.4,
  sportage: 2.9, k5: 2.8, sonata: 2.8, tucson: 2.9, i30: 2.9,
};

// Досчитываем игровые характеристики из реальных цифр.
// Формула разгона та же, что была у Авео: тяга падает ближе к максималке,
// а 0.605 подгоняет кривую под честное время до "сотни".
for (const c of CARS) {
  c.maxSpeed = KMH * c.topKmh;
  // Точная калибровка разгона под КАЖДУЮ машину (Math.atanh — обратный
  // гиперболический тангенс): раньше формула была подогнана под Авео,
  // и у машин с другой максималкой "сотня" приходила неточно
  c.accel = c.maxSpeed * Math.atanh(Math.min(0.98, 100 / c.topKmh)) / c.zeroTo100;
  c.brake100 = BRAKE_100_0[c.id] || 3.0;
  c.brakeDecel = -(KMH * 100) / c.brake100;  // тормозим равномерно
  if (c.noBrakes) c.brakeDecel = 0;          // у ЗИСа педаль для красоты
}

let carIndex = 0;
let car = CARS[0];   // текущая машина (по умолчанию — Авио)

// ---------- МАГАЗИН МАШИН (решение Саши: всё платное, кроме Авио!) ----------
// ЗЫС не продаётся ни за какие деньги — только секретный код.
const CAR_PRICES = {
  aveo: 0, kopeyka: 250, chetverka: 270, semerka: 280, picanto: 300, buhanka: 350, raf: 400, hilux: 500, disco: 700, rav4: 900, corsa: 600, focus: 800,
  camaro70: 1000, vetteC1: 1200, delorean: 1500, shelby: 1600,
  camaroNew: 2000, darkhorse: 2400, vetteC8: 3000, fford: 4000, f1: 6000,
  // Американский автосалон
  ecosport: 650, cruze: 700, kuga: 850, zephyr: 900, lincoln60: 950,
  mark5: 1000, durango: 1100, navigator: 1150, nautilus: 1200,
  escalade: 1300, mkz: 1600, charger69: 1700, charger14: 1800,
  continental17: 1900, challenger: 2200, sixteen: 3500, fordgt: 5500,
  gemera: 8000, wayra: 9000, tuatara: 8500,
  merc190: 1400, amggt53: 2600, maybach: 2800, gle: 1500,
  pejo308: 1300, volga3110: 320, volga24: 300, volga21: 380,
  sportage: 850, k5: 950, sonata: 900, tucson: 800, i30: 600,
  zis: -1,   // −1 = не продаётся, только код «вечная ностальгия»
};

let owned = ["aveo"];
try {
  const o = JSON.parse(localStorage.getItem("ins1-owned"));
  if (Array.isArray(o)) owned = [...new Set(["aveo", ...o])];
} catch {}
function saveOwned() {
  try { localStorage.setItem("ins1-owned", JSON.stringify(owned)); } catch {}
}
const isOwned = (id) => owned.includes(id);

// Коробка передач: объявляем здесь, наверху — applyCar пользуется
// этими переменными уже при загрузке страницы
let manualMode = false;
let manualGear = 1;

// АДМИНСКИЙ КОД (спецификация Саши): все машины + бесконечные деньги.
// Объявлен здесь, наверху, потому что нужен и магазину, и настройкам.
let adminCode = false;
try { adminCode = localStorage.getItem("ins1-admin") === "1"; } catch {}
const canAfford = (n) => adminCode || money >= n;
function pay(n) {
  if (!adminCode) {
    money -= n;
    saveMoney();
  }
  updateMoneyUI();
}

// ---------- Цвета ----------
const COLORS = {
  SKY_TOP: "#1e90ff",
  SKY_BOT: "#bfe8ff",
  FOG:     "191, 232, 255",  // цвет тумана у горизонта (r, g, b)
  // Полосы дороги чередуются: светлая/тёмная — так видно скорость.
  // Бордюры (rumble) чередуются белый/красный, как настоящие поребрики!
  LIGHT: { road: "#6e6e73", grass: "#42b542", rumble: "#f2f2f2", lane: "#ffffff" },
  DARK:  { road: "#66666b", grass: "#379b37", rumble: "#e03a30" },
  START: { road: "#f0f0f0", grass: "#42b542", rumble: "#f0f0f0" },
};

// =====================================================================
//  ТРАССА
// =====================================================================

let segments = [];     // все кусочки дороги
let trackLength = 0;   // полная длина трассы
let currentTrack = 0;  // какая трасса выбрана (T — переключить)
const TRACK_NAMES = ["Зелёное кольцо", "Горный серпантин", "Поля", "Пустыня", "Офроуд", "Трасса"];

// Палитра карты: у полей — сочная зелень, у пустыни — песок,
// у офроуда — грязь. Задаётся при постройке трассы.
let PAL = null;
function setTheme(id) {
  PAL = {
    LIGHT: { road: "#6e6e73", grass: "#42b542", rumble: "#f2f2f2", lane: "#ffffff" },
    DARK:  { road: "#66666b", grass: "#379b37", rumble: "#e03a30" },
    START: { road: "#f0f0f0", grass: "#42b542", rumble: "#f0f0f0" },
    FOG: "191, 232, 255",
    hillFar: "#7fa8c9",
    hillNear: "#5cae62",
  };
  if (id === 2) {              // ПОЛЯ: сочная зелень и простор
    PAL.LIGHT.grass = "#54c94f"; PAL.DARK.grass = "#46b53f"; PAL.START.grass = "#54c94f";
    PAL.hillNear = "#6cc46c";
  } else if (id === 3) {       // ПУСТЫНЯ: песок и дюны
    PAL.LIGHT.grass = "#e3c46e"; PAL.DARK.grass = "#d6b458"; PAL.START.grass = "#e3c46e";
    PAL.FOG = "240, 224, 176";
    PAL.hillFar = "#cfa95c"; PAL.hillNear = "#e0bc66";
  } else if (id === 4) {       // ОФРОУД: грязь, колея, камни
    PAL.LIGHT = { road: "#8a7a5e", grass: "#7a5c34", rumble: "#5e4a28", lane: "#a89372" };
    PAL.DARK  = { road: "#816f52", grass: "#6b5030", rumble: "#4e3d20" };
    PAL.START = { road: "#d9cbb0", grass: "#7a5c34", rumble: "#d9cbb0" };
    PAL.hillFar = "#8a6a4a"; PAL.hillNear = "#9c7a4e";
  }
}
setTheme(0);

// Высота конца дороги, построенной на данный момент
function lastY() {
  return segments.length ? segments[segments.length - 1].p2.world.y : 0;
}

function addSegment(curve, y) {
  const n = segments.length;
  segments.push({
    index: n,
    curve: curve,
    // p1 — ближний край кусочка, p2 — дальний. world — координаты в 3D-мире
    // (теперь с высотой y — это и есть горки!)
    p1: { world: { y: lastY(), z:  n      * SEG_LEN }, camera: {}, screen: {} },
    p2: { world: { y: y,       z: (n + 1) * SEG_LEN }, camera: {}, screen: {} },
    sprites: [],   // деревья, знаки и прочее у этого кусочка
    clip: 0,       // линия, ниже которой этот кусочек скрыт за холмом
    color: Math.floor(n / RUMBLE_LEN) % 2 ? PAL.DARK : PAL.LIGHT,
  });
}

// Плавные "входы" и "выходы" из поворотов, чтобы руль не дёргался
function easeIn(a, b, t)    { return a + (b - a) * t * t; }
function easeInOut(a, b, t) { return a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5); }

// Добавить участок дороги: enter/hold/leave — сегменты входа в поворот,
// самого поворота и выхода. hill — на сколько "ступенек" дорога
// поднимется (+) или опустится (−) за весь участок. Высота меняется
// плавной волной easeInOut — горка получается округлой, без изломов.
function addRoad(enter, hold, leave, curve, hill = 0) {
  const startY = lastY();
  const endY = startY + hill * SEG_LEN;
  const total = enter + hold + leave;
  let n = 0;
  for (let i = 0; i < enter; i++, n++)
    addSegment(easeIn(0, curve, i / enter), easeInOut(startY, endY, (n + 1) / total));
  for (let i = 0; i < hold; i++, n++)
    addSegment(curve, easeInOut(startY, endY, (n + 1) / total));
  for (let i = 0; i < leave; i++, n++)
    addSegment(easeInOut(curve, 0, i / leave), easeInOut(startY, endY, (n + 1) / total));
}

// Посадить у сегмента n дерево/знак/арку. offset — где поперёк дороги:
// 1 = правый край асфальта, -1 — левый, дальше — трава
function addSprite(n, type, offset, dir = 0) {
  if (segments[n]) segments[n].sprites.push({ type, offset, dir, v: Math.random() });
}

// Украшаем трассу: арка на старте, растительность по теме карты,
// знаки перед поворотами
function decorateTrack(id = 0) {
  addSprite(20, "arch", 0);  // стартовая арка (чуть впереди, чтобы её
                             // было видно с места старта во всей красе)

  // «Трасса»: вместо растительности — БОЧКИ вдоль обеих обочин,
  // сплошным коридором. Настоящее гоночное ограждение!
  if (id === 5) {
    for (let n = 8; n < segments.length; n += 3) {
      addSprite(n, "cone", -1.3);
      addSprite(n, "cone", 1.3);
    }
  } else
  // Растительность зависит от карты: лес / поля / КАКТУСЫ / камни
  for (let n = 12; n < segments.length; n += 3) {
    let mk;
    if (id === 3)      mk = () => "cactus";                              // пустыня
    else if (id === 4) mk = () => (Math.random() < 0.5 ? "rock" : "pine"); // офроуд
    else if (id === 2) mk = () => (Math.random() < 0.8 ? "tree" : "pine"); // поля
    else               mk = () => (Math.random() < 0.6 ? "pine" : "tree");
    const chance = id === 3 ? 0.25 : id === 2 ? 0.3 : 0.45;
    if (Math.random() < chance)
      addSprite(n, mk(), -(1.5 + Math.random() * 2));
    if (Math.random() < chance)
      addSprite(n, mk(), 1.5 + Math.random() * 2);
  }

  // Знаки-стрелки перед КРУТЫМИ поворотами (|изгиб| >= 4), как на
  // настоящих трассах: три штуки на подъезде, на внешней стороне
  for (let n = 1; n < segments.length; n++) {
    const c = segments[n].curve;
    if (Math.abs(c) >= 4 && Math.abs(segments[n - 1].curve) < 4) {
      for (let k = 1; k <= 3; k++) {
        const at = (n - 7 * k + segments.length) % segments.length;
        addSprite(at, "sign", c > 0 ? -1.35 : 1.35, Math.sign(c));
      }
    }
  }
}

function buildTrack(id) {
  currentTrack = id;
  setTheme(id);
  segments = [];

  if (id === 5) {
    // «ТРАССА»: техничное гоночное кольцо, ОКРУЖЁННОЕ БОЧКАМИ
    // (спецификация Саши). Вылетел с дороги — собрал бочку!
    addRoad(50, 40, 50,  0,  0);
    addRoad(30, 40, 30, -3,  2);
    addRoad(20, 30, 20,  5, -2);
    addRoad(40, 70, 40,  0,  0);
    addRoad(25, 35, 25, -5,  4);
    addRoad(25, 35, 25,  5, -4);
    addRoad(30, 60, 30, -2,  0);
    addRoad(40, 50, 40,  0,  3);
    addRoad(30, 40, 30,  4, -3);
  } else if (id === 2) {
    // «ПОЛЯ»: простор, плавные повороты… и КОРОВЫ на дороге!
    addRoad(60, 60, 60,  0,  0);
    addRoad(40, 80, 40,  2,  3);
    addRoad(50, 100, 50, 0, -3);
    addRoad(40, 60, 40, -2,  0);
    addRoad(60, 120, 60, 0,  2);
    addRoad(40, 60, 40,  3, -2);
    addRoad(50, 80, 50, -1.5, 0);
  } else if (id === 3) {
    // «ПУСТЫНЯ»: дюны, кактусы и страусы. Болидам въезд запрещён!
    addRoad(50, 50, 50,  0,   0);
    addRoad(40, 60, 40,  2.5, 14);
    addRoad(40, 60, 40, -2.5, -14);
    addRoad(40, 80, 40,  0,   10);
    addRoad(30, 40, 30,  4,  -10);
    addRoad(40, 60, 40, -3,    8);
    addRoad(50, 80, 50,  0,   -8);
    addRoad(30, 40, 30,  3,    0);
  } else if (id === 4) {
    // «ОФРОУД»: стиральная доска из горок и камни. Только внедорожники!
    addRoad(30, 30, 30, 0, 0);
    for (let k = 0; k < 6; k++) {
      addRoad(10, 8, 10, k % 2 ? 2.5 : -2.5, 6);
      addRoad(10, 8, 10, 0, -6);
    }
    addRoad(30, 40, 30, -4, 12);
    addRoad(20, 20, 20,  4, -12);
    for (let k = 0; k < 5; k++) {
      addRoad(8, 6, 8, k % 2 ? -3 : 3, 4);
      addRoad(8, 6, 8, 0, -4);
    }
    addRoad(30, 40, 30, 2, 0);
  } else if (id === 0) {
    // «Зелёное кольцо» — знакомая трасса, теперь с плавными холмами
    addRoad(60, 40, 60,  0,   0);   // стартовая прямая
    addRoad(40, 60, 40,  3,  10);   // правый в горку
    addRoad(30, 40, 30,  0,  -6);   // передышка под уклон
    addRoad(40, 50, 40, -4, -14);   // левый вниз — разгонит!
    addRoad(30, 30, 30,  2,   8);   // S-связка вверх...
    addRoad(30, 30, 30, -2,  -8);   // ...и вниз
    addRoad(50, 90, 50,  0,   6);   // длиннющая прямая — газ в пол!
    addRoad(40, 60, 40, -5,  14);   // крутой левый в подъём
    addRoad(30, 40, 30,  0, -10);
    addRoad(40, 40, 40,  4,   4);   // правый
  } else {
    // «Горный серпантин» — наверх по горе и вниз со свистом!
    addRoad(40, 30, 40,  0,   0);
    addRoad(30, 40, 30,  4,  22);   // затяжной подъём с правым
    addRoad(20, 20, 20, -5,  14);   // серпантин: влево...
    addRoad(20, 20, 20,  5,  10);   // ...вправо...
    addRoad(20, 20, 20, -5,   6);   // ...влево
    addRoad(25, 25, 25,  0,   0);   // вершина — любуйся видом!
    addRoad(30, 50, 30, -6, -28);   // крутой спуск с левым! тормози!
    addRoad(20, 30, 20,  6, -14);
    addRoad(40, 60, 40,  0, -10);   // скоростной спуск
    addRoad(30, 30, 30, -3,   0);
  }

  // Замыкающая прямая плавно возвращает высоту к нулю,
  // чтобы кольцо сомкнулось без ступеньки
  addRoad(40, 40, 40, 0, -lastY() / SEG_LEN);

  // Стартовая линия — красим первые сегменты в белый
  for (let i = 0; i < 2 * RUMBLE_LEN; i++) segments[i].color = PAL.START;

  trackLength = segments.length * SEG_LEN;
  decorateTrack(id);
  setupAnimals(id);   // коровы на полях, страусы в пустыне!
  traffic = [];       // трафик живёт только на шоссе
  buildTrackMap();    // мини-карта под спидометром (идея Саши)
}

// ---------- МИНИ-КАРТА ТРАССЫ (идея Саши) ----------
// Проходим трассу сегмент за сегментом, как штурман с блокнотом:
// каждый изгиб чуть поворачивает наш «карандаш» (heading), и из
// шагов карандаша складывается контур трассы — вид сверху!
let trackMapPts = null;
function buildTrackMap() {
  const pts = [];
  let heading = 0, mpx = 0, mpy = 0;
  for (const s of segments) {
    heading += s.curve * 0.004;
    mpx += Math.sin(heading);
    mpy -= Math.cos(heading);
    pts.push([mpx, mpy]);
  }
  // Вписываем контур в квадрат 0…1, сохранив пропорции по центру
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [px, py] of pts) {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  const span = Math.max(maxX - minX, maxY - minY, 1e-6);
  const offX = (1 - (maxX - minX) / span) / 2;
  const offY = (1 - (maxY - minY) / span) / 2;
  trackMapPts = pts.map(([px, py]) =>
    [(px - minX) / span + offX, (py - minY) / span + offY]);
}

// В каком сегменте находится точка z на трассе?
function findSegment(z) {
  return segments[Math.floor(z / SEG_LEN) % segments.length];
}

// ---------- ЖИВОТНЫЕ (спецификация Саши!) ----------
// На «Полях» дорогу перебегают КОРОВЫ, в «Пустыне» — СТРАУСЫ.
// Они могут ОСТАНОВИТЬСЯ прямо на дороге — это препятствие!
let animals = [];

function setupAnimals(id) {
  animals = [];
  const type = id === 2 ? "cow" : id === 3 ? "ostrich" : null;
  if (!type) return;
  for (let i = 0; i < 8; i++) {
    animals.push({
      type,
      z: (0.08 + 0.84 * Math.random()) * trackLength,
      x: Math.random() < 0.5 ? -2.4 : 2.4,   // пасётся на обочине
      dir: 1,
      crossing: false,
      pauseUntil: 0,
    });
  }
}

function updateAnimals(dt) {
  const now = performance.now();
  for (const a of animals) {
    if (now < a.pauseUntil) continue;        // стоит и жуёт (или думает)
    if (!a.crossing) {
      // Вдруг решает перебежать на другую сторону!
      if (Math.random() < dt * 0.12) {
        a.crossing = true;
        a.dir = a.x > 0 ? -1 : 1;
      }
    } else {
      a.x += a.dir * (a.type === "ostrich" ? 1.1 : 0.5) * dt;
      // Вредная корова может встать ПРЯМО ПОСРЕДИ дороги
      if (Math.abs(a.x) < 0.9 && Math.random() < dt * 0.25)
        a.pauseUntil = now + 1200 + Math.random() * 2500;
      if ((a.dir > 0 && a.x > 2.4) || (a.dir < 0 && a.x < -2.4)) {
        a.x = clamp(a.x, -2.4, 2.4);
        a.crossing = false;
        a.pauseUntil = now + 2000 + Math.random() * 4000;
      }
    }
  }
}

// ---------- ДРАГ-ПОЛОСА (спецификация Саши: с препятствиями!) ----------
function buildDragTrack() {
  raceKind = "drag";
  setTheme(0);
  setupAnimals(-1);   // на драг-полосе коров нет!
  traffic = [];       // и трафика тоже
  segments = [];
  addRoad(20, 380, 20, 0, 0);   // идеально прямая полоса
  trackLength = segments.length * SEG_LEN;

  // Стартовая и финишная зоны — белые
  for (let i = 0; i < 2 * RUMBLE_LEN; i++) segments[i].color = PAL.START;
  for (let i = segments.length - 8; i < segments.length; i++)
    segments[i].color = PAL.START;

  // Финишная арка с шахматным баннером
  addSprite(segments.length - 6, "farch", 0);
  buildTrackMap();   // карта драг-полосы — прямая линия, но пусть будет!

  // БОЧКИ-ПРЕПЯТСТВИЯ! Начинаются после зоны разгона, стоят в
  // случайных полосах со случайными промежутками — каждый драг разный
  for (let n = 60; n < segments.length - 30; n += 12 + Math.floor(Math.random() * 10)) {
    const lane = [-0.6, 0, 0.6][Math.floor(Math.random() * 3)];
    addSprite(n, "cone", lane);
  }

  // Деревья поодаль — чтобы чувствовалась скорость
  for (let n = 10; n < segments.length; n += 4) {
    if (Math.random() < 0.6)
      addSprite(n, Math.random() < 0.5 ? "pine" : "tree", -(1.8 + Math.random() * 2));
    if (Math.random() < 0.6)
      addSprite(n, Math.random() < 0.5 ? "pine" : "tree", 1.8 + Math.random() * 2);
  }
}

// Вернуться на кольцевую трассу (после драга или шоссе)
function ensureCircuit() {
  if (raceKind !== "circuit") {
    raceKind = "circuit";
    buildTrack(currentTrack);
  }
}

// ---------- ШОССЕ: скоростная дорога города ----------
// Длинные плавные дуги, никакой гонки — просто езда. Но здесь
// расходуется БЕНЗИН (топливо есть только в городе — решение Саши)!
function buildHighwayTrack() {
  raceKind = "highway";
  setTheme(0);
  setupAnimals(-1);   // на шоссе животных не пускают
  segments = [];
  addRoad(60, 90, 60, 0, 0);      // разгонная прямая
  addRoad(50, 110, 50, 1.5, 5);   // плавная скоростная дуга
  addRoad(60, 130, 60, 0, -5);
  addRoad(50, 100, 50, -1.5, 3);
  addRoad(70, 150, 70, 0, -3);    // длиннющая прямая
  addRoad(50, 90, 50, 2, 0);
  addRoad(40, 40, 40, 0, -lastY() / SEG_LEN);
  for (let i = 0; i < 2 * RUMBLE_LEN; i++) segments[i].color = PAL.START;
  trackLength = segments.length * SEG_LEN;
  // ЗАПРАВКИ вдоль шоссе (уточнение Саши: топливо есть на заправках!)
  // Остановись рядом с колонкой — и бак наполнится за монеты
  for (const n of [150, 400, 650]) addSprite(n, "gas", -1.75);
  buildTrackMap();
  setupTraffic();   // и выпускаем на шоссе гражданские машины!
  // Редкие деревья — простор!
  for (let n = 14; n < segments.length; n += 5) {
    if (Math.random() < 0.5)
      addSprite(n, Math.random() < 0.5 ? "pine" : "tree", -(2.4 + Math.random() * 2));
    if (Math.random() < 0.5)
      addSprite(n, Math.random() < 0.5 ? "pine" : "tree", 2 + Math.random() * 2);
  }
}

// ---------- ТРАФИК на шоссе (идея Саши!) ----------
// Гражданские машины едут по своим полосам со своей скоростью —
// лавируй между ними, как в старых аркадах!
let traffic = [];

function setupTraffic() {
  traffic = [];
  const pool = CARS.filter((c) => !c.noNpc);
  for (let i = 0; i < 10; i++) {
    const c = pool[Math.floor(Math.random() * pool.length)];
    traffic.push({
      car: c,
      canvas: prerenderCar(c.id),
      z: Math.random() * trackLength,
      x: [-0.6, 0, 0.6][Math.floor(Math.random() * 3)],
      speed: KMH * (60 + Math.random() * 50),   // спокойные 60–110 км/ч
    });
  }
}

function updateTraffic(dt) {
  for (const t of traffic) {
    // Не въезжаем в машину впереди — держим её скорость
    for (const other of traffic) {
      if (other === t) continue;
      const gap = ((other.z - t.z) % trackLength + trackLength) % trackLength;
      if (gap > 0 && gap < 300 && Math.abs(other.x - t.x) < 0.4)
        t.speed = Math.min(t.speed, other.speed);
    }
    t.z = (t.z + t.speed * dt) % trackLength;
  }
}

// РАЗВОРОТ (идея Саши: кнопка Z): шоссе — дорога туда-обратно!
// Трасса перестраивается задом наперёд: повороты и холмы зеркалятся,
// деревья и заправки переезжают на другую сторону.
function reverseTrack() {
  const old = segments;
  const N = old.length;
  segments = [];
  for (let i = 0; i < N; i++) {
    const src = old[N - 1 - i];
    addSegment(-src.curve, src.p1.world.y);
  }
  for (let i = 0; i < N; i++) {
    const src = old[N - 1 - i];
    for (const spr of src.sprites)
      segments[i].sprites.push({ ...spr, offset: -spr.offset });
  }
  for (let i = 0; i < 2 * RUMBLE_LEN; i++) segments[i].color = PAL.START;
  trackLength = segments.length * SEG_LEN;
  buildTrackMap();   // после разворота карта смотрит в другую сторону
}

function doUTurn() {
  const oldPos = position;
  reverseTrack();
  position = (trackLength - oldPos + trackLength) % trackLength;
  playerX = -playerX;
  speed = Math.min(speed, KMH * 25);   // развернуться на полном ходу нельзя!
  lapMsg = { text: "🔄 Разворот!", until: performance.now() + 2000 };
}

// =====================================================================
//  СОСТОЯНИЕ ИГРЫ
// =====================================================================

let position = 0;   // где мы на трассе (метры от старта)
let speed = 0;      // текущая скорость
let playerX = 0;    // положение поперёк дороги: 0 — центр, -1/+1 — края
let steer = 0;      // куда повёрнут руль (для наклона машинки)
// Состояния игры (как главы книги: игра всегда в одной из них):
// меню → заезд → пауза/авария → снова заезд или меню
let started = false; // мы в заезде (главное меню закрыто)
let paused = false;  // пауза (Esc): время замирает
let crashed = false; // авария! время замирает, ждём "Снова заезд"
let sparks = [];     // частицы искр от удара

// ОГНЕННЫЙ СЛЕД (идея Саши): на 142 км/ч (= 88 миль/ч, как в
// "Назад в будущее"!) за колёсами вспыхивает оранжевый след на 5 секунд
let fireTrailUntil = 0;  // до какого момента горит след
let prevKmh = 0;         // скорость в прошлом кадре (ловим момент "коснулись 142")

// =====================================================================
//  ГОНКА С СОПЕРНИКАМИ!
//  Соперники — машины из нашего же гаража, с честной физикой своей
//  модели. У каждого свой "талант пилота" (skill) — поэтому каждая
//  гонка разная!
// =====================================================================

const RACE_LAPS = 3;   // кругов в гонке
const OPP_COUNT = 3;   // соперников на старте

// Вид заезда: "circuit" — кольцевая гонка, "drag" — драг-дуэль
// с препятствиями (спецификация Саши!)
let raceKind = "circuit";
const raceLaps = () => (raceKind === "drag" ? 1 : RACE_LAPS);

let raceMode = false;  // гонка или свободная езда?
let countdown = 0;     // отсчёт 3-2-1 (в секундах; > 0 — ждём старта)
let playerLap = 1;     // наш текущий круг
let raceOver = false;  // финишировали!
let finalPlace = 0;    // место на финише
let opponents = [];    // { car, canvas, z, x, speed, skill }
// ЩИТ (идея Саши): первые 5 секунд после GO столкновения не страшны —
// чтобы пережить толкучку на старте. Но от ЗИСа щит НЕ спасает!
let shieldUntil = 0;
const shieldActive = () => raceMode && performance.now() < shieldUntil;

// ---------- ПРОТИВ РЕКОРДА (time attack): обгони своего призрака! ----------
// Лучший круг каждой трассы записывается (время + путь машины), и в
// следующих заездах по трассе едет полупрозрачный ПРИЗРАК этого круга.
let taMode = false;
let lapTime = 0;        // время текущего круга
let taRecording = [];   // записываем свой путь: [время, позиция, полоса]
let ghost = null;       // призрак лучшего круга
let lapMsg = null;      // сообщение после круга { text, until }
let records = {};       // рекорды по трассам
try { records = JSON.parse(localStorage.getItem("ins1-records")) || {}; } catch {}
function saveRecords() {
  try { localStorage.setItem("ins1-records", JSON.stringify(records)); } catch {}
}
function loadGhost() {
  const rec = records[currentTrack];
  ghost = rec ? { samples: rec.samples, time: rec.time,
                  canvas: prerenderCar(rec.carId), idx: 0 } : null;
}

// Круг завершён: сравниваем с рекордом
function finishTaLap() {
  const t = lapTime;
  taRecording.push([t, trackLength, playerX]);   // финальная точка пути
  const rec = records[currentTrack];
  if (!rec || t < rec.time) {
    records[currentTrack] = { time: t, car: car.name, carId: car.id, samples: taRecording };
    saveRecords();
    money += 150;
    saveMoney();
    updateMoneyUI();
    lapMsg = { text: `🏆 НОВЫЙ РЕКОРД: ${t.toFixed(2)} с!  +150 🪙`,
               until: performance.now() + 4000 };
    loadGhost();   // призрак обновился — теперь он ещё быстрее!
  } else {
    lapMsg = { text: `Круг: ${t.toFixed(2)} с (рекорд: ${rec.time.toFixed(2)})`,
               until: performance.now() + 4000 };
  }
  lapTime = 0;
  taRecording = [];
}
// Стартовый ускоритель ЗИСа: те же 5 секунд, что и щиты у остальных
const zisBoostActive = () => raceMode && car.ram && performance.now() < shieldUntil;

// Соперника выгодно нарисовать ОДИН раз в невидимый холст, а потом
// просто уменьшать картинку по дальности — так в 100 раз быстрее!
function prerenderCar(id) {
  const c = document.createElement("canvas");
  c.width = 240;
  c.height = 150;
  const g = c.getContext("2d");
  g.translate(120, 140);   // "земля" машины — на 140-й строке холста
  CAR_DRAWERS[id](g);
  return c;
}

// Собрать стартовую решётку: 3 случайных соперника (не наша модель),
// в шахматном порядке впереди. Мы — в последнем ряду. Честно!
function setupRace() {
  opponents = [];
  // Соперникам не выдаются: наша модель, ЗЫС и болиды (noNpc)
  let pool = CARS.filter((c) => c.id !== car.id && !c.noNpc);
  // На офроуде соперники — только внедорожники (их мало — и гонка меньше!)
  if (raceKind === "circuit" && currentTrack === 4)
    pool = pool.filter((c) => c.offroadSoft);
  const count = Math.min(raceKind === "drag" ? 1 : OPP_COUNT, pool.length);
  for (let i = 0; i < count; i++) {
    const oc = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    opponents.push({
      car: oc,
      canvas: prerenderCar(oc.id),
      // Драг: бок о бок на одной линии. Кольцо: решётка впереди
      z: raceKind === "drag" ? 10 : 600 + i * 450,
      x: raceKind === "drag" ? -0.45 : (i % 2 === 0 ? -0.45 : 0.45),
      speed: 0,
      skill: 0.78 + Math.random() * 0.17,   // талант пилота: 78–95%
    });
  }
  playerX = 0.45;   // наша клетка — справа в последнем ряду
  playerLap = 1;
  raceOver = false;
  finalPlace = 0;
  countdown = 3.999;
}

// ИИ соперников: на прямой жмут газ, перед поворотом сбрасывают.
// Физика та же, что у игрока — формула разгона их машины!
function updateOpponents(dt) {
  for (const o of opponents) {
    // ДРАГ: соперник, проехавший финиш, тормозит и съезжает к обочине.
    // Раньше он ехал дальше, «наматывал» прямую полосу как круг и
    // телепортировался на старт — таранил стоящего игрока (баг Саши
    // «столкновение на ровном месте» в драг-дуэли)!
    if (o.finished) {
      o.speed = Math.max(0, o.speed - o.car.maxSpeed * 0.4 * dt);
      const edge = o.x >= 0 ? 1.0 : -1.0;
      o.x += clamp(edge - o.x, -0.8 * dt, 0.8 * dt);
      continue;
    }
    const seg = findSegment(o.z % trackLength);
    const curveSlow = 1 - Math.min(0.45, Math.abs(seg.curve) * 0.07);
    const target = o.car.maxSpeed * o.skill * curveSlow;
    if (o.speed < target) {
      const p = o.speed / o.car.maxSpeed;
      o.speed += o.car.accel * (1 - p * p) * dt;
    } else {
      // тормозим к цели (у ЗИСа-соперника тормозов тоже нет — только мотор!)
      o.speed += (o.car.noBrakes ? -KMH * 10 : o.car.brakeDecel * 0.5) * dt;
    }
    // ДРАГ: уворачиваемся от бочек! Смотрим на 14 сегментов вперёд,
    // и если в нашей полосе препятствие — плавно перестраиваемся
    if (raceKind === "drag") {
      const zz = o.z % trackLength;
      let danger = null;
      for (let n = 2; n < 14 && !danger; n++) {
        const seg2 = segments[(Math.floor(zz / SEG_LEN) + n) % segments.length];
        for (const spr of seg2.sprites)
          if (spr.type === "cone" && Math.abs(spr.offset - o.x) < 0.5) {
            danger = spr;
            break;
          }
      }
      if (danger) {
        const target = danger.offset > o.x ? danger.offset - 0.8 : danger.offset + 0.8;
        o.x += clamp(target - o.x, -1.4 * dt, 1.4 * dt);
        o.x = clamp(o.x, -0.85, 0.85);
      }
    }

    // Не наезжаем на соперника впереди: близко — едем его скоростью,
    // совсем близко — ОТСТАЁМ (раньше «95%» позволяло подкрадываться!)
    for (const other of opponents) {
      if (other === o) continue;
      const gap = other.z - o.z;
      if (gap > 0 && gap < 300 && Math.abs(other.x - o.x) < 0.4) {
        o.speed = Math.min(o.speed, Math.max(other.speed, 0));
        if (gap < 160) o.speed = Math.min(o.speed, other.speed * 0.8);
      }
    }
    // И на игрока сзади не наезжаем: держим дистанцию ПО-НАСТОЯЩЕМУ
    const playerTotal = (playerLap - 1) * trackLength + position;
    const gapP = playerTotal - o.z;
    if (gapP > 0 && gapP < 300 && Math.abs(playerX - o.x) < 0.45) {
      o.speed = Math.min(o.speed, Math.max(speed, 0));
      if (gapP < 170) o.speed = Math.min(o.speed, speed * 0.7);
    }

    o.speed = clamp(o.speed, 0, o.car.maxSpeed);
    o.z += o.speed * dt;
    // Пересёк финиш драга — гонка для него окончена, замираем на арке
    if (raceKind === "drag" && o.z >= trackLength) {
      o.z = trackLength;
      o.finished = true;
    }
  }
}

// ---------- Столкновения (спецификация Саши) ----------
// Ширина объектов для столкновений (в долях полуширины дороги).
const HIT_WIDTH = { pine: 0.20, tree: 0.25, sign: 0.15, cone: 0.13,
                    cactus: 0.16, rock: 0.28 };
const CAR_HALF_W = 0.15;
// Столбы стартовой арки — тоже объекты (уточнение Саши)!
// Стоят по обе стороны дороги на отметке ±1.16, полуширина 0.08
const ARCH_PILLAR_X = 1.16;
const ARCH_PILLAR_W = 0.08;

function crash() {
  crashed = true;
  engineOn = false;        // мотор глохнет от удара — заводи заново!
  engineStarting = false;
  speed = 0;               // мгновенная остановка
  makeSparks();            // сноп искр перед машиной
  document.getElementById("crash").classList.remove("hidden");
}

// Показать/спрятать экран по id
function show(id, on) {
  document.getElementById(id).classList.toggle("hidden", !on);
}

function restartRace() {
  crashed = false;
  paused = false;
  position = 0;
  speed = 0;
  playerX = 0;
  steer = 0;
  manualGear = 1;
  driveMode = 2;   // каждый круг начинается со СПОРТА (решение Саши)
  sparks = [];
  raceOver = false;   // важно сбрасывать ВСЕГДА, а не только в гонке
  finalPlace = 0;
  countdown = 0;
  shieldUntil = 0;
  lapTime = 0;
  taRecording = [];
  lapMsg = null;
  fuelEmptyAt = 0;
  if (taMode) {         // против рекорда: отсчёт и свежий призрак
    countdown = 3.999;
    loadGhost();
  }
  show("crash", false);
  show("pause", false);
  show("finish", false);
  if (raceMode) setupRace();  // в гонке — заново решётка и отсчёт
}

// Пускает ли текущая карта нашу машину? (спецификация Саши:
// «неправильная машина — оно скажет и не запустит»)
function trackBanReason() {
  if (currentTrack === 3 && (car.id === "fford" || car.id === "f1"))
    return "🏜 В пустыне болиды не работают: песок в моторе! Возьми другую машину.";
  if (currentTrack === 4 && !car.offroadSoft && !car.ram)
    return "⛰ Офроуд — только внедорожники и броня! Ищи в гараже вездеходы.";
  return null;
}

// Показать отказ там, где его увидит игрок
function refuseStart(text) {
  document.getElementById("races-msg").textContent = text;
  if (inCity) cityMsg(text);
  setTimeout(() => { document.getElementById("races-msg").textContent = ""; }, 4000);
}

// Из меню — в свободную езду (без соперников)
function goRace() {
  const ban = trackBanReason();
  if (ban) { refuseStart(ban); return false; }
  raceMode = false;
  taMode = false;
  opponents = [];
  ensureCircuit();
  restartRace();
  started = true;
  show("menu", false);
  initEngineSound();
  if (engine && engine.ac.state === "suspended") engine.ac.resume();
  return true;
}

// Из меню — в ГОНКУ с соперниками!
function goRaceMode() {
  const ban = trackBanReason();
  if (ban) { refuseStart(ban); return false; }
  ensureCircuit();
  taMode = false;
  raceMode = true;
  restartRace();   // внутри соберётся решётка и запустится отсчёт
  started = true;
  show("menu", false);
  initEngineSound();
  if (engine && engine.ac.state === "suspended") engine.ac.resume();
  return true;
}

// Из меню — в ДРАГ-ДУЭЛЬ с препятствиями!
function goDragMode() {
  buildDragTrack();   // прямая полоса с бочками, raceKind = "drag"
  taMode = false;
  raceMode = true;
  restartRace();      // соберёт дуэль (setupRace знает про драг)
  started = true;
  show("menu", false);
  initEngineSound();
  if (engine && engine.ac.state === "suspended") engine.ac.resume();
}

// Из меню — ПРОТИВ РЕКОРДА: один на трассе против своего призрака!
function goTimeAttack() {
  const ban = trackBanReason();
  if (ban) { refuseStart(ban); return false; }
  ensureCircuit();
  raceMode = false;
  taMode = true;
  opponents = [];
  restartRace();
  started = true;
  show("menu", false);
  initEngineSound();
  if (engine && engine.ac.state === "suspended") engine.ac.resume();
  return true;
}

// Из паузы или аварии — обратно в главное меню
function goMenu() {
  raceMode = false;
  taMode = false;
  opponents = [];
  saveFuel();       // бензин запоминается между поездками
  ensureCircuit();
  restartRace();
  started = false;
  engineOn = false;
  engineStarting = false;
  show("menu", true);
}

// Esc — пауза (только во время заезда, не на экране финиша)
function togglePause() {
  if (!started || crashed || raceOver) return;
  paused = !paused;
  show("pause", paused);
}

// Название трассы на кнопке в меню
function updateTrackButton() {
  document.getElementById("btn-track").textContent =
    "🛣️ Трасса: " + TRACK_NAMES[currentTrack];
}

// Кнопки меню. После клика снимаем фокус с кнопки (blur), иначе
// пробел и Enter будут "нажимать" её снова во время езды!
function wireButton(id, action) {
  document.getElementById(id).addEventListener("click", (e) => {
    action();
    e.currentTarget.blur();
  });
}

// Подраздел «Заезды» (структура Саши): все виды гонок в одном месте
let inRaces = false;
function openRaces() {
  inRaces = true;
  show("menu", false);
  show("races", true);
}
function closeRaces() {
  inRaces = false;
  show("races", false);
  show("menu", true);
}

// =====================================================================
//  ГОРОД (Этап 6, спецификация Саши): карта заездов, ШОССЕ и БЕНЗИН.
//  Топливо существует ТОЛЬКО здесь — в гонках его нет!
// =====================================================================

let inCity = false;
let fuel = 100;         // бак в процентах
let fuelEmptyAt = 0;    // момент, когда бензин кончился (ждём эвакуатор)
let nearGas = false;    // мы рядом с колонкой на шоссе?
let refuelAcc = 0;      // накопитель заправки (заправляем по 2%)
try {
  const f = parseFloat(localStorage.getItem("ins1-fuel"));
  if (!isNaN(f)) fuel = f;
} catch {}
function saveFuel() {
  try { localStorage.setItem("ins1-fuel", String(Math.round(fuel))); } catch {}
}

const cityCanvas = document.getElementById("city-canvas");
const cityCtx = cityCanvas.getContext("2d");

function cityMsg(text) {
  document.getElementById("fuel-line").textContent = text;
}
function updateCityUI() {
  document.getElementById("city-money").innerHTML =
    adminCode ? "🪙 <i>АДМИН</i>" : `🪙 ${money}`;
  cityMsg(`⛽ Бак: ${Math.round(fuel)}%`);
}

// Рисуем карту города: кварталы, кольцевая трасса, драг-полоса,
// заправка и шоссе понизу. Кнопки-точки стоят прямо на карте!
function renderCityMap() {
  const g = cityCtx;
  const cw = cityCanvas.width, ch = cityCanvas.height;
  // Трава и асфальт города
  g.fillStyle = "#2c6e38";
  g.fillRect(0, 0, cw, ch);
  g.fillStyle = "#343941";
  g.fillRect(30, 16, cw - 60, ch - 90);
  // Сетка улиц
  g.fillStyle = "#585e66";
  for (const y of [70, 150, 220]) g.fillRect(30, y, cw - 60, 12);
  for (const x of [150, 300, 450]) g.fillRect(x, 16, 12, ch - 90);
  // Кварталы-домики с окошками
  g.fillStyle = "#7c828c";
  for (const [bx, by] of [[52, 96], [180, 34], [330, 96], [480, 174], [180, 174], [480, 34], [52, 240], [330, 240]]) {
    g.fillRect(bx, by, 70, 44);
    g.fillStyle = "#ffd98a";
    for (let wy = 0; wy < 2; wy++)
      for (let wx = 0; wx < 4; wx++)
        g.fillRect(bx + 8 + wx * 16, by + 9 + wy * 18, 7, 9);
    g.fillStyle = "#7c828c";
  }
  // Кольцевая трасса (слева сверху)
  g.strokeStyle = "#20242b";
  g.lineWidth = 14;
  g.beginPath();
  g.ellipse(122, 88, 62, 40, 0, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = "#e03a30";
  g.setLineDash([8, 8]);
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(122, 88, 62, 40, 0, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  // Драг-полоса (справа сверху)
  g.fillStyle = "#20242b";
  g.fillRect(390, 52, 220, 22);
  g.fillStyle = "#f2f2f2";
  for (let i = 0; i < 5; i++) g.fillRect(390 + i * 44, 61, 22, 4);
  // Заправка (в центре)
  g.fillStyle = "#d5121e";
  g.fillRect(292, 138, 44, 26);
  g.fillStyle = "#f2f2f2";
  g.fillRect(300, 144, 12, 14);
  // ШОССЕ — широкая дорога понизу
  g.fillStyle = "#44484f";
  g.fillRect(0, ch - 58, cw, 44);
  g.fillStyle = "#f2f2f2";
  for (let x = 10; x < cw; x += 60) g.fillRect(x, ch - 38, 28, 5);
}

function openCity() {
  inCity = true;
  show("menu", false);
  show("city", true);
  renderCityMap();
  updateCityUI();
}
function closeCity() {
  inCity = false;
  show("city", false);
  show("menu", true);
}

// Выезд на шоссе — единственное место, где горит бензин!
function goHighway() {
  inCity = false;
  show("city", false);
  buildHighwayTrack();
  raceMode = false;
  taMode = false;
  opponents = [];
  restartRace();
  started = true;
  initEngineSound();
  if (engine && engine.ac.state === "suspended") engine.ac.resume();
}

wireButton("btn-city", openCity);
wireButton("btn-city-back", closeCity);
wireButton("poi-hw", goHighway);
wireButton("poi-race", () => { if (goRaceMode()) { inCity = false; show("city", false); } });
wireButton("poi-drag", () => { inCity = false; show("city", false); goDragMode(); });
wireButton("poi-ta",   () => { if (goTimeAttack()) { inCity = false; show("city", false); } });
wireButton("poi-fuel", () => {
  // Цены Саши: полный бак — 2 🪙 (как по кнопке V у колонки)
  if (fuel >= 99.5) { cityMsg("⛽ Бак уже полон!"); return; }
  if (!canAfford(2)) { cityMsg("⛽ Полный бак стоит 2 🪙 — не хватает!"); return; }
  pay(2);
  fuel = 100;
  saveFuel();
  updateCityUI();
  cityMsg("⛽ Полный бак за 2 🪙!");
});

// =====================================================================
//  МУЛЬТИПЛЕЕР ПИР-ТУ-ПИР (спецификация Саши!)
//  WebRTC через библиотеку PeerJS: один создаёт игру и получает код,
//  второй вводит код — и оба катаются на одной трассе, видя друг друга.
//  Данные летят НАПРЯМУЮ между компьютерами (пир-ту-пир!), сервер
//  нужен только на секунду знакомства.
// =====================================================================

let inMp = false;
let peer = null;
let conn = null;
let mpRemote = null;    // машина друга: { z, x, carId, canvas }
let mpTimer = null;

function mpStatus(t) {
  document.getElementById("mp-status").textContent = t;
}

function openMp() {
  inMp = true;
  show("menu", false);
  show("mp", true);
  if (typeof Peer === "undefined")
    mpStatus("❌ Мультиплеер не загрузился — проверь интернет и обнови страницу.");
}
function closeMp() {
  inMp = false;
  show("mp", false);
  show("menu", true);
}

// Хозяин: создаёт игру и получает код для друга
function mpHost() {
  if (typeof Peer === "undefined") { mpStatus("❌ Нет интернета — мультиплеер недоступен."); return; }
  const code = "ins1-" + Math.random().toString(36).slice(2, 6);
  mpStatus("Создаём игру…");
  peer = new Peer(code);
  peer.on("open", () => mpStatus(`Код игры: ${code.toUpperCase()} — продиктуй другу и жди!`));
  peer.on("connection", (c) => { conn = c; mpSetup(true); });
  peer.on("error", (e) => mpStatus("❌ Ошибка: " + e.type));
}

// Гость: вводит код друга
function mpJoin() {
  if (typeof Peer === "undefined") { mpStatus("❌ Нет интернета — мультиплеер недоступен."); return; }
  const code = document.getElementById("mp-code").value.trim().toLowerCase();
  if (!code) { mpStatus("Сначала введи код друга!"); return; }
  mpStatus("Подключаемся…");
  peer = new Peer();
  peer.on("open", () => {
    conn = peer.connect(code);
    mpSetup(false);
  });
  peer.on("error", (e) => mpStatus("❌ Ошибка: " + e.type));
}

function mpSetup(isHost) {
  conn.on("open", () => {
    mpStatus("✅ Подключено! Выезжаем вместе…");
    if (isHost) conn.send({ t: "hello", track: currentTrack });
    mpStartDrive();
  });
  conn.on("data", onMpData);
  conn.on("close", () => {
    mpRemote = null;
    if (mpTimer) clearInterval(mpTimer);
    mpStatus("Друг отключился.");
  });
}

function onMpData(d) {
  if (!d || typeof d !== "object") return;   // чужие данные — только данные!
  if (d.t === "hello") {
    // Гость получает трассу хозяина, чтобы ехать по одной дороге
    if (typeof d.track === "number" && d.track !== currentTrack
        && d.track >= 0 && d.track < TRACK_NAMES.length) {
      currentTrack = d.track;
      buildTrack(d.track);
      updateTrackButton();
    }
  } else if (d.t === "s") {
    if (!mpRemote || mpRemote.carId !== d.carId) {
      const known = CAR_DRAWERS[d.carId] ? d.carId : "aveo";
      mpRemote = { carId: known, canvas: prerenderCar(known), z: 0, x: 0 };
    }
    if (typeof d.z === "number") mpRemote.z = d.z;
    if (typeof d.x === "number") mpRemote.x = clamp(d.x, -3, 3);
  }
}

// Оба игрока выезжают в совместную свободную езду
function mpStartDrive() {
  inMp = false;
  show("mp", false);
  raceMode = false;
  taMode = false;
  opponents = [];
  ensureCircuit();
  restartRace();
  started = true;
  show("menu", false);
  initEngineSound();
  if (engine && engine.ac.state === "suspended") engine.ac.resume();
  // 10 раз в секунду шлём другу, где мы (и слушаем его)
  if (mpTimer) clearInterval(mpTimer);
  mpTimer = setInterval(() => {
    if (conn && conn.open)
      conn.send({ t: "s", z: position, x: playerX, carId: car.id });
  }, 100);
}

wireButton("btn-mp", openMp);
wireButton("btn-mp-back", closeMp);
wireButton("btn-mp-host", mpHost);
wireButton("btn-mp-join", mpJoin);

wireButton("btn-go", () => { if (goRace()) { inRaces = false; show("races", false); } });
wireButton("btn-races", openRaces);
wireButton("btn-races-back", closeRaces);
// Если карта не пускает машину — остаёмся в «Заездах» и читаем, почему
wireButton("btn-race", () => { if (goRaceMode()) { inRaces = false; show("races", false); } });
wireButton("btn-drag", () => { inRaces = false; show("races", false); goDragMode(); });
wireButton("btn-ta",   () => { if (goTimeAttack()) { inRaces = false; show("races", false); } });
wireButton("btn-finish-again", restartRace);
wireButton("btn-finish-menu", goMenu);
wireButton("btn-track", () => {
  buildTrack((currentTrack + 1) % TRACK_NAMES.length);
  restartRace();
  updateTrackButton();
});
wireButton("btn-restart", restartRace);
wireButton("btn-crash-menu", goMenu);
wireButton("btn-pause-restart", restartRace);
wireButton("btn-pause-menu", goMenu);

// Сноп искр: летят вверх-в стороны, падают под тяжестью, гаснут.
// Можно передать свои цвета — например, щепки для тарана дерева!
function makeSparks(colors) {
  const palette = colors || ["#ffd23f", "#ff8c1a", "#ffffff", "#ff5030"];
  for (let i = 0; i < 34; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
    const sp = 160 + Math.random() * 480;
    sparks.push({
      x: W / 2 + (Math.random() - 0.5) * 60,
      y: H - 140,   // перед носом машины (она теперь меньше и выше)
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.5 + Math.random() * 0.6,
      color: palette[Math.floor(Math.random() * palette.length)],
    });
  }
}

function updateSparks(dt) {
  for (const s of sparks) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += 900 * dt;   // "гравитация" — искры падают
    s.life -= dt;
  }
  sparks = sparks.filter((s) => s.life > 0);
}

function renderSparks() {
  for (const s of sparks) {
    ctx.globalAlpha = Math.min(1, s.life * 2);
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x, s.y, 4, 4);
  }
  ctx.globalAlpha = 1;
}

// ---------- Клавиатура и НАСТРОЙКИ УПРАВЛЕНИЯ ----------
// Используем e.code — он не зависит от языка раскладки,
// поэтому WASD работает даже с включённой русской клавиатурой!
const keys = {};

// Спецификация Саши: у каждой функции ДВЕ клавиши, игрок может
// переназначить их в настройках. Пустая строка = слот свободен.
const DEFAULT_BINDS = {
  gas:      ["KeyW", "ArrowUp"],
  brake:    ["KeyS", "ArrowDown"],
  left:     ["KeyA", "ArrowLeft"],
  right:    ["KeyD", "ArrowRight"],
  engine:   ["KeyF", ""],
  gearbox:  ["KeyN", ""],
  gearDown: ["KeyQ", ""],
  gearUp:   ["KeyE", ""],
  mode:       ["KeyB", ""],
  uturn:      ["KeyZ", ""],
  refuelFull: ["KeyV", ""],
  refuelHalf: ["KeyC", ""],
};
const BIND_NAMES = {
  gas:      "Газ",
  brake:    "Тормоз",
  left:     "Руль влево",
  right:    "Руль вправо",
  engine:   "Мотор (завести/заглушить)",
  gearbox:  "Коробка: автомат/ручная",
  gearDown: "Передача ниже",
  gearUp:   "Передача выше",
  mode:       "Режим поездки (Эко/Норма/Спорт)",
  uturn:      "Разворот (на шоссе)",
  refuelFull: "Заправка: полный бак — 2 🪙",
  refuelHalf: "Заправка: полбака — 1 🪙",
};
// Эти клавиши заняты игрой — их переназначать нельзя
const RESERVED_KEYS = ["Escape", "Enter", "KeyR", "KeyT", "KeyM",
                       "Minus", "Equal", "NumpadSubtract", "NumpadAdd"];

let binds = JSON.parse(JSON.stringify(DEFAULT_BINDS));
let listening = null;   // { fn, slot } — ждём, какую клавишу нажмёт игрок
let inSettings = false; // открыт ли экран настроек

// Настройки запоминаются в браузере (localStorage) — переживут закрытие!
function saveBinds() {
  try { localStorage.setItem("ins1-binds", JSON.stringify(binds)); } catch {}
}
function loadBinds() {
  try {
    const b = JSON.parse(localStorage.getItem("ins1-binds"));
    if (b) for (const fn in DEFAULT_BINDS)
      if (Array.isArray(b[fn])) binds[fn] = [b[fn][0] || "", b[fn][1] || ""];
  } catch {}
}
loadBinds();

// Человеческое имя клавиши для кнопок в настройках
function keyLabel(code) {
  if (!code) return "—";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const map = {
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
    Space: "Пробел", ShiftLeft: "Shift", ShiftRight: "Shift пр.",
    ControlLeft: "Ctrl", ControlRight: "Ctrl пр.", AltLeft: "Alt",
    Backspace: "Backspace", Tab: "Tab", CapsLock: "Caps",
  };
  return map[code] || code;
}

// Назначить клавишу. Если она уже занята другой функцией — забираем
// её оттуда, чтобы одна клавиша не делала два дела сразу!
function setBind(fn, slot, code) {
  for (const f in binds)
    for (let s = 0; s < 2; s++)
      if (binds[f][s] === code) binds[f][s] = "";
  binds[fn][slot] = code;
  saveBinds();
}

// Нарисовать таблицу клавиш на экране настроек
function renderBinds() {
  const box = document.getElementById("binds");
  box.innerHTML = "";
  for (const fn in DEFAULT_BINDS) {
    const row = document.createElement("div");
    row.className = "bind-row";
    const label = document.createElement("span");
    label.textContent = BIND_NAMES[fn];
    row.appendChild(label);
    for (let slot = 0; slot < 2; slot++) {
      const b = document.createElement("button");
      b.className = "keybtn";
      const isListening = listening && listening.fn === fn && listening.slot === slot;
      b.textContent = isListening ? "нажми..." : keyLabel(binds[fn][slot]);
      if (isListening) b.classList.add("listening");
      b.addEventListener("click", (ev) => {
        listening = { fn, slot };
        renderBinds();
        ev.currentTarget.blur();
      });
      row.appendChild(b);
    }
    box.appendChild(row);
  }
}

function openSettings() {
  inSettings = true;
  listening = null;
  renderBinds();
  show("menu", false);
  show("settings", true);
}

function closeSettings() {
  inSettings = false;
  listening = null;
  show("settings", false);
  show("menu", true);
}

wireButton("btn-settings", openSettings);
wireButton("btn-back", closeSettings);

// Сброс прогресса (решение Саши) — с защитой от случайного клика:
// первый клик спрашивает, второй (в течение 3 секунд) — сбрасывает.
// Деньги → 100, тюнинг стирается, машина — снова Авео.
// Управление НЕ трогаем: клавиши — это настройки, а не прогресс.
let resetArm = null;
document.getElementById("btn-reset-progress").addEventListener("click", (e) => {
  const b = e.currentTarget;
  if (!resetArm) {
    b.textContent = "⚠️ Точно? Кликни ещё раз!";
    resetArm = setTimeout(() => {
      resetArm = null;
      b.textContent = "🗑 Сбросить прогресс";
    }, 3000);
  } else {
    clearTimeout(resetArm);
    resetArm = null;
    money = 100;
    saveMoney();
    tuning = {};
    saveTuning();
    records = {};   // рекорды и призраки — тоже прогресс
    ghost = null;
    owned = ["aveo"];   // куплены только... то есть только Авио и осталась
    saveOwned();
    zisCode = false;    // и секретные коды придётся вводить заново!
    adminCode = false;
    refreshCodeStatus();
    try { localStorage.removeItem("ins1-records"); } catch {}
    try { localStorage.removeItem("ins1-code"); } catch {}
    try { localStorage.removeItem("ins1-admin"); } catch {}
    try { localStorage.removeItem("ins1-car"); } catch {}
    applyCar(0);
    updateMoneyUI();
    b.textContent = "✅ Прогресс сброшен!";
    setTimeout(() => { b.textContent = "🗑 Сбросить прогресс"; }, 2000);
  }
  b.blur();
});
wireButton("btn-defaults", () => {
  binds = JSON.parse(JSON.stringify(DEFAULT_BINDS));
  saveBinds();
  renderBinds();
});

// =====================================================================
//  ЭКРАН ГАРАЖА: листаем машины, смотрим характеристики, выбираем
// =====================================================================

let inGarage = false;
let garageIndex = 0;   // какую машину сейчас разглядываем (не обязательно выбрана)

const gCanvas = document.getElementById("garage-canvas");
const gctx = gCanvas.getContext("2d");

// Применить машину: она становится текущей и запоминается в браузере
function applyCar(index) {
  carIndex = (index + CARS.length) % CARS.length;
  car = CARS[carIndex];
  manualMode = car.gearbox === "М";  // категория М — сразу механика!
  manualGear = 1;
  driveMode = 2;                     // начинаем в СПОРТЕ (решение Саши)
  try { localStorage.setItem("ins1-car", car.id); } catch {}
  // В меню — только имя машины (коробка видна в гараже и в заезде)
  document.getElementById("menu-car").textContent = car.name;
}

// Вспомнить машину из прошлого запуска (только если она куплена!).
// applyCar вызывается ВСЕГДА — чтобы надпись в меню была свежей
try {
  const savedId = localStorage.getItem("ins1-car");
  const idx = CARS.findIndex((c) => c.id === savedId);
  applyCar(idx >= 0 && isOwned(savedId) ? idx : 0);
} catch {
  applyCar(0);
}

// ---------- СЕКРЕТНЫЙ КОД (спецификация Саши) ----------
// «вечная ностальгия» открывает ЗЫС-115. После ввода отметка об
// активации видна в настройках; не ввёл — её там нет.
let zisCode = false;
try { zisCode = localStorage.getItem("ins1-code") === "1"; } catch {}
function refreshCodeStatus() {
  const st = document.getElementById("code-status");
  if (zisCode) {
    st.textContent = "✨ Код «вечная ностальгия» активен — ЗИС-115 открыт!";
    st.classList.remove("hidden");
  } else {
    st.classList.add("hidden");
  }
  // Админский код — отметка рядом с ностальгическим (появляется
  // только после ввода — не ввёл, её нет!)
  const sa = document.getElementById("code-status-admin");
  if (adminCode) {
    sa.innerHTML = "🛡 Код «админский код секрет» активен — все машины (кроме ЗИСа!) и <i>бесконечные деньги</i>";
    sa.classList.remove("hidden");
  } else {
    sa.classList.add("hidden");
  }
}
refreshCodeStatus();

document.getElementById("btn-code").addEventListener("click", (e) => {
  const raw = document.getElementById("code-input").value;
  const norm = raw.replace(/[*«»"'!.]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  const btn = e.currentTarget;
  // Коды принимаем ЩЕДРО: порядок слов и мелочи не важны, лишь бы
  // ключевые слова были на месте (фикс по жалобе Саши: он помнил
  // код чуть иначе, а игра требовала слово в слово)
  const isNostalgia = norm.includes("ностальг");
  // Слово «код» — обязательное (правка Саши)!
  const isAdmin = norm.includes("админ") && norm.includes("код")
    && (norm.includes("секрет") || norm.includes("супер"));
  if (isNostalgia) {
    zisCode = true;
    try { localStorage.setItem("ins1-code", "1"); } catch {}
    if (!owned.includes("zis")) {
      owned.push("zis");
      saveOwned();
    }
    refreshCodeStatus();
    document.getElementById("code-input").value = "";
    btn.textContent = "✅ Принято!";
  } else if (isAdmin) {
    // АДМИН: все машины разблокированы, деньги бесконечны!
    // НО ЗИС даже админу не даётся (правка Саши) — только ностальгия!
    adminCode = true;
    try { localStorage.setItem("ins1-admin", "1"); } catch {}
    owned = CARS.filter((c) => c.id !== "zis").map((c) => c.id);
    if (zisCode) owned.push("zis");   // если ностальгия уже введена — оставляем
    saveOwned();
    refreshCodeStatus();
    updateMoneyUI();
    document.getElementById("code-input").value = "";
    btn.textContent = "🛡 АДМИН!";
  } else {
    btn.textContent = "❌ Неверный код";
  }
  setTimeout(() => { btn.textContent = "✨ Активировать"; }, 2000);
  btn.blur();
});

// БЕЛЫЙ КУБ-подиум (правка Саши): машина стоит на кубе, как на
// выставке! Рисуем три грани — верхнюю, переднюю и боковую
function drawCube(g, cx, topY, half, frontH, depth) {
  g.fillStyle = "#ffffff";                       // верхняя грань
  g.beginPath();
  g.moveTo(cx - half, topY);
  g.lineTo(cx - half + depth, topY - depth);
  g.lineTo(cx + half + depth, topY - depth);
  g.lineTo(cx + half, topY);
  g.closePath();
  g.fill();
  g.fillStyle = "#eceef2";                       // передняя грань
  g.fillRect(cx - half, topY, half * 2, frontH);
  g.fillStyle = "#d5d9e0";                       // боковая грань
  g.beginPath();
  g.moveTo(cx + half, topY);
  g.lineTo(cx + half + depth, topY - depth);
  g.lineTo(cx + half + depth, topY + frontH - depth);
  g.lineTo(cx + half, topY + frontH);
  g.closePath();
  g.fill();
}

// Нарисовать машину на подиуме гаража
function renderGaragePreview() {
  const c = CARS[garageIndex];
  gctx.clearRect(0, 0, gCanvas.width, gCanvas.height);
  const cx = gCanvas.width / 2;
  const topY = gCanvas.height - 46;
  drawCube(gctx, cx, topY, 128, 40, 16);
  // Машина крупным планом — стоит на кубе
  gctx.save();
  gctx.translate(cx + 8, topY - 6);
  gctx.scale(1.28, 1.28);
  drawCarTuned(gctx, c.id, getTun(c.id));   // подиум показывает тюнинг
  gctx.restore();
}

// Полоска-характеристика: насколько машина крута (0..1)
function statBar(label, fraction, text) {
  return `<div class="stat"><span>${label}</span>` +
         `<div class="bar"><div style="width:${Math.round(fraction * 100)}%"></div></div>` +
         `<b>${text}</b></div>`;
}

const GEARBOX_FULL = { "А": "А — автомат", "М": "М — механика",
                       "С": "С — смешанная", "Э": "Э — электро (без коробки!)" };

// ---------- КАТЕГОРИИ И СОРТИРОВКА ГАРАЖА (заказ Саши) ----------
// Гараж вырос до 50 машин — листаем по цене (дешёвые сначала),
// а кнопка «Категория» показывает только один раздел
const CATEGORIES = [
  ["all",   "Все"],
  ["city",  "Городские"],
  ["sport", "Спорт"],
  ["lux",   "Люкс"],
  ["suv",   "Вездеходы"],
  ["ussr",  "СССР"],
  ["hyper", "Болиды и гиперкары"],
];
const CAR_CATEGORY = {
  aveo: "city", picanto: "city", corsa: "city", focus: "city", cruze: "city",
  pejo308: "city",
  camaro70: "sport", camaroNew: "sport", vetteC1: "sport", vetteC8: "sport",
  shelby: "sport", darkhorse: "sport", challenger: "sport", charger14: "sport",
  charger69: "sport", merc190: "sport", amggt53: "sport", delorean: "sport",
  maybach: "lux", continental17: "lux", mark5: "lux", lincoln60: "lux",
  zephyr: "lux", mkz: "lux", sixteen: "lux",
  disco: "suv", hilux: "suv", rav4: "suv", durango: "suv", escalade: "suv",
  kuga: "suv", ecosport: "suv", navigator: "suv", nautilus: "suv", gle: "suv",
  zis: "ussr", buhanka: "ussr", raf: "ussr", kopeyka: "ussr", semerka: "ussr",
  chetverka: "ussr", volga21: "ussr", volga24: "ussr", volga3110: "ussr",
  fford: "hyper", f1: "hyper", fordgt: "hyper", gemera: "hyper",
  wayra: "hyper", tuatara: "hyper",
  sportage: "suv", k5: "city", sonata: "city", tucson: "suv", i30: "city",
};
// Марка каждой машины — для вкладки «По марке» (заказ Саши)
const CAR_BRAND = {
  aveo: "Chevalet", camaro70: "Chevalet", camaroNew: "Chevalet",
  vetteC1: "Chevalet", vetteC8: "Chevalet", cruze: "Chevalet",
  picanto: "Kiwi", sportage: "Kiwi", k5: "Kiwi",
  sonata: "Hyondai", tucson: "Hyondai", i30: "Hyondai",
  corsa: "Opal", delorean: "TMC", shelby: "Shelbee",
  focus: "Fjord", darkhorse: "Fjord", fford: "Fjord", ecosport: "Fjord",
  kuga: "Fjord", fordgt: "Fjord",
  disco: "Sand Hover", hilux: "Tayoda", rav4: "Tayoda",
  kopeyka: "ВАЗ", semerka: "ВАЗ", chetverka: "ВАЗ",
  volga21: "Волга", volga24: "Волга", volga3110: "Волга",
  buhanka: "УАЗ", raf: "РАФ", zis: "ЗИС", f1: "Нет марки",
  challenger: "Dodgee", charger14: "Dodgee", charger69: "Dodgee",
  durango: "Dodgee",
  escalade: "Kadillark", sixteen: "Kadillark",
  nautilus: "Linkorn", continental17: "Linkorn", mark5: "Linkorn",
  lincoln60: "Linkorn", navigator: "Linkorn", zephyr: "Linkorn",
  mkz: "Linkorn",
  merc190: "Merzedes", amggt53: "Merzedes", maybach: "Merzedes",
  gle: "Merzedes",
  pejo308: "Pejo", gemera: "Konisegg", wayra: "Paganny", tuatara: "ZSC",
};
let garageCat = 0;      // номер выбранной категории в CATEGORIES
let garageBrand = null; // выбранная марка (null = фильтруем по типу)

// Список индексов CARS для текущей категории, по цене (ЗИС — в конец:
// его цена −1 означает «бесценный», такому место последнее)
function garageList() {
  const [key] = CATEGORIES[garageCat];
  return CARS
    .map((c, i) => i)
    .filter((i) => garageBrand
      ? CAR_BRAND[CARS[i].id] === garageBrand
      : key === "all" || CAR_CATEGORY[CARS[i].id] === key)
    .sort((a, b) => {
      const pa = CAR_PRICES[CARS[a].id], pb = CAR_PRICES[CARS[b].id];
      return (pa === -1 ? Infinity : pa) - (pb === -1 ? Infinity : pb);
    });
}

function renderGarage() {
  const c = CARS[garageIndex];
  const list = garageList();
  const pos = list.indexOf(garageIndex);
  document.getElementById("garage-name").textContent =
    `${c.name}  (${pos + 1}/${list.length})`;
  const catBtn = document.getElementById("btn-cat");
  if (catBtn) catBtn.textContent =
    "📂 Категория: " + (garageBrand || CATEGORIES[garageCat][1]);
  document.getElementById("garage-desc").textContent = c.desc;
  document.getElementById("garage-stats").innerHTML =
    statBar("Максималка", c.topKmh / 360, c.topKmh + " км/ч") +
    statBar("Разгон 0–100", Math.min(1, 4 / c.zeroTo100 + 0.25), c.zeroTo100 + " сек") +
    (c.noBrakes
      // У ЗИСа тормозной путь — 9999…9 секунд, и слово «сек» видно
      // на любом экране (шрифт поменьше, чтобы хвост не обрезало)
      ? statBar("Тормоза 100–0", 0.03,
          "<span style='font-size:10px'>" + "9".repeat(32) + " сек</span>")
      : statBar("Тормоза 100–0", Math.max(0.08, (6 - c.brake100) / 4.8), c.brake100 + " сек")) +
    statBar("Коробка", 1, GEARBOX_FULL[c.gearbox]);
  // Кнопка: выбрана / выбрать / купить / нужен секретный код
  const btn = document.getElementById("btn-select");
  btn.classList.remove("soon");
  if (garageIndex === carIndex) {
    btn.textContent = "✅ Уже выбрана!";
    btn.classList.add("soon");
  } else if (isOwned(c.id)) {
    btn.textContent = "✅ Выбрать эту машину";
  } else if (CAR_PRICES[c.id] === -1) {
    btn.textContent = "🔒 Только по секретному коду!";
    btn.classList.add("soon");
  } else {
    btn.textContent = `💰 Купить за ${CAR_PRICES[c.id]} 🪙`;
  }
  renderGaragePreview();
}

function openGarage() {
  inGarage = true;
  garageCat = 0;         // открываем всегда с раздела «Все»
  garageBrand = null;
  garageIndex = carIndex;
  renderGarage();
  show("menu", false);
  show("garage", true);
}

function closeGarage() {
  inGarage = false;
  show("garage", false);
  show("menu", true);
}

wireButton("btn-garage", openGarage);
wireButton("btn-garage-back", closeGarage);
// Листаем ПО СПИСКУ КАТЕГОРИИ (он отсортирован по цене)
function garageStep(dir) {
  const list = garageList();
  let pos = list.indexOf(garageIndex);
  if (pos === -1) pos = 0;           // сменили категорию — с начала
  else pos = (pos + dir + list.length) % list.length;
  garageIndex = list[pos];
  renderGarage();
}
wireButton("btn-prev", () => garageStep(-1));
wireButton("btn-next", () => garageStep(1));
// Кнопка «Категория» открывает ОТДЕЛЬНЫЙ ЭКРАН выбора раздела
// (правка Саши) — как настоящее меню, а не список под кнопкой
const CAT_COLORS = ["", "btn-violet", "btn-green", "btn-blue",
                    "btn-orange", "btn-slate", "btn-dark"];
let catsMode = "type";   // какая вкладка открыта: "type" или "brand"

function pickAndReturn() {
  garageIndex = garageList()[0];  // раздел начинается с самой дешёвой
  show("cats", false);
  show("garage", true);
  renderGarage();
}

function renderCats() {
  document.getElementById("cats-tab-type").classList
    .toggle("active", catsMode === "type");
  document.getElementById("cats-tab-brand").classList
    .toggle("active", catsMode === "brand");
  const grid = document.getElementById("cats-grid");
  grid.innerHTML = "";
  if (catsMode === "type") {
    // Вкладка «По типу»: 7 больших цветных кнопок
    grid.className = "menu-grid";
    grid.removeAttribute("style");
    CATEGORIES.forEach(([key, label], i) => {
      const count = CARS.filter(
        (c) => key === "all" || CAR_CATEGORY[c.id] === key).length;
      const b = document.createElement("button");
      b.className = CAT_COLORS[i % CAT_COLORS.length];
      b.textContent = (!garageBrand && i === garageCat ? "✅ " : "")
        + `${label} — ${count}`;
      b.addEventListener("click", () => {
        garageBrand = null;
        garageCat = i;
        pickAndReturn();
      });
      grid.appendChild(b);
    });
  } else {
    // Вкладка «По марке»: компактные кнопки-фишки, марок-то много!
    grid.className = "settings-btns";
    grid.style.flexWrap = "wrap";
    grid.style.justifyContent = "center";
    grid.style.maxWidth = "640px";
    // «Нет марки» (безымянные болиды) — всегда в конце списка
    const brands = [...new Set(Object.values(CAR_BRAND))]
      .sort((a, b) => (a === "Нет марки") - (b === "Нет марки"));
    for (const brand of brands) {
      const count = CARS.filter((c) => CAR_BRAND[c.id] === brand).length;
      const b = document.createElement("button");
      b.className = "chip" + (garageBrand === brand ? " active" : "");
      b.textContent = `${brand} — ${count}`;
      b.addEventListener("click", () => {
        garageBrand = brand;
        pickAndReturn();
      });
      grid.appendChild(b);
    }
  }
}

function openCats() {
  renderCats();
  show("garage", false);
  show("cats", true);
}
wireButton("btn-cat", openCats);
wireButton("cats-tab-type",  () => { catsMode = "type";  renderCats(); });
wireButton("cats-tab-brand", () => { catsMode = "brand"; renderCats(); });
wireButton("btn-cats-back", () => {
  show("cats", false);
  show("garage", true);
});
wireButton("btn-select", () => {
  const c = CARS[garageIndex];
  if (garageIndex === carIndex) return;
  if (isOwned(c.id)) {
    applyCar(garageIndex);            // своя — просто пересаживаемся
  } else if (CAR_PRICES[c.id] === -1) {
    return;                           // ЗЫС продаётся только за код!
  } else if (canAfford(CAR_PRICES[c.id])) {
    pay(CAR_PRICES[c.id]);            // ПОКУПКА! 💰 (админу — бесплатно)
    owned.push(c.id);
    saveOwned();
    applyCar(garageIndex);            // сразу садимся в новенькую
  } else {
    const btn = document.getElementById("btn-select");
    btn.textContent = `Не хватает ${CAR_PRICES[c.id] - money} 🪙 — выиграй заезд!`;
    setTimeout(renderGarage, 1800);
    return;
  }
  renderGarage();
});

// =====================================================================
//  ТЮНИНГ (Этап 4, план Саши): 🎨 цвет · 🏁 винилы · 🔩 детали · ⚙️ железо
//  У каждой машины свой тюнинг, всё запоминается в браузере.
// =====================================================================

// «Краска» каждой машины: какие цвета в её рисунке — это кузов.
// При перекраске мы подменяем ИМЕННО их, сохраняя светотень
// (крыша темнее, кузов светлее — как в жизни).
const PAINT_SLOTS = {
  aveo:      ["#17191c", "#101214", "#0d0f11", "#0c0e10"],
  picanto:   ["#ded23a", "#cfc233", "#c5b92e"],
  focus:     ["#1f5fd6", "#1a4fb2", "#173f8c", "#122f68"],
  delorean:  ["#8b9299", "#6d747c"],
  corsa:     ["#8f979e"],
  camaro70:  ["#e8641f", "#c9561a"],
  camaroNew: ["#eef0f2"],
  vetteC1:   ["#7e1428", "#5d0f1e"],
  vetteC8:   ["#e33a17"],
  shelby:    ["#f2f3f0", "#e4e5e2"],
  darkhorse: ["#8d9296", "#7d8286"],
  fford:     ["#2a5fd4"],
  f1:        ["#b3131b"],
  zis:       ["#16181c", "#101214", "#0d0f11"],
  disco:     ["#9aa0a6", "#8a9096"],
  hilux:     ["#b3202a", "#a01b24", "#8f171f"],
  rav4:      ["#4a4f57", "#42474e", "#3d4249"],
  buhanka:   ["#c9ccd1", "#b8bcc2"],
  raf:       ["#f2f3f0", "#e2e4e0"],
  kopeyka:   ["#a51e24", "#8f171f"],
  semerka:   ["#f2f3f0", "#e4e6e2"],
  chetverka: ["#c5342c", "#ad2b25"],
  challenger: ["#a8d426", "#93bd1e"],
  charger14: ["#17191c", "#101214"],
  charger69: ["#e8c11c", "#d1ab12"],
  durango: ["#f0f1f3", "#dfe1e5"],
  escalade: ["#101214", "#0b0d0f"],
  sixteen: ["#6d747c", "#5d636b"],
  cruze: ["#a51e28", "#8f171f"],
  ecosport: ["#2b57c9", "#2149ad"],
  kuga: ["#141618", "#0e1012"],
  fordgt: ["#1a55c4", "#1345a5"],
  nautilus: ["#1d2f45", "#162538"],
  continental17: ["#101214", "#0b0d0f"],
  mark5: ["#9db4c9", "#89a2b8"],
  lincoln60: ["#f2f3f0", "#e2e4e0"],
  navigator: ["#5c6166", "#4d5257"],
  zephyr: ["#c9ccd1", "#b8bcc2"],
  mkz: ["#e8e6df", "#d8d6cf"],
  gemera: ["#2e3436", "#262b2d"],
  wayra: ["#c9ccd1", "#b8bcc2"],
  tuatara: ["#f2f3f0", "#e2e4e0"],
  merc190: ["#1a1c20", "#131519"],
  amggt53: ["#5a5e63", "#4d5156"],
  maybach: ["#ece9e2", "#dcd9d2"],
  gle: ["#f2f3f0", "#e2e4e0"],
  pejo308: ["#4d5156", "#42464b"],
  volga3110: ["#f2f3f0", "#e2e4e0"],
  volga24: ["#c9ccd1", "#b8bcc2"],
  volga21: ["#e8a8c8", "#d897b8"],
  sportage: ["#c5232c", "#ad1e26"],
  k5: ["#1d3f96", "#173482"],
  sonata: ["#17191c", "#101214"],
  tucson: ["#5c6a68", "#4e5a58"],
  i30: ["#c9ccd1", "#b8bcc2"],
};

const PAINT_PALETTE = ["#d5121e", "#ff8c1a", "#ffd23f", "#57d977", "#1f8f4d",
  "#39c2d7", "#1f5fd6", "#7a4fd6", "#ff5fa2", "#f2f3f0", "#8f979e", "#17191c"];
const NEON_COLORS = { "нет": null, "синий": "#39c2ff", "розовый": "#ff5fd2", "зелёный": "#57ff8a" };
const VINYLS = ["нет", "полосы", "пламя", "номер"];
const HW_NAMES = { engine: "Мотор", brakes: "Тормоза", tires: "Шины" };
// Где у каждой машины колёса (для золотых дисков)
const RIM_X = { aveo: 66, picanto: 56, corsa: 59, focus: 73, delorean: 75,
  camaro70: 77, camaroNew: 78, vetteC1: 73, vetteC8: 79, shelby: 75,
  darkhorse: 76, fford: 84, f1: 85, zis: 66, disco: 68, hilux: 67, rav4: 67,
  buhanka: 62, raf: 64, kopeyka: 64, semerka: 64, chetverka: 64,
  challenger: 78, charger14: 74, charger69: 78, durango: 68,
  escalade: 68, sixteen: 76, cruze: 68, ecosport: 63, kuga: 67,
  fordgt: 80, nautilus: 68, continental17: 73, mark5: 72,
  lincoln60: 74, navigator: 68, zephyr: 69, mkz: 72,
  gemera: 80, wayra: 82, tuatara: 80,
  merc190: 70, amggt53: 76, maybach: 72, gle: 70,
  pejo308: 68, volga3110: 66, volga24: 66, volga21: 64,
  sportage: 66, k5: 71, sonata: 71, tucson: 66, i30: 65 };

// ---------- ИГРОВАЯ ВАЛЮТА 🪙 ----------
// Зарабатывается в гонках (по месту на финише), тратится на железо.
// Косметика — бесплатно: красота принадлежит народу!
const PLACE_REWARD = [500, 300, 150, 50];   // 🥇 🥈 🥉 и 4-е место
const HW_PRICE = [300, 600, 1000];          // цена уровней железа 1 / 2 / 3

let money = 100;   // стартовый капитал (решение Саши: сурово, но честно!)
try {
  const m = parseInt(localStorage.getItem("ins1-money"));
  if (!isNaN(m)) money = m;
} catch {}
function saveMoney() {
  try { localStorage.setItem("ins1-money", String(money)); } catch {}
}

function updateMoneyUI() {
  const text = adminCode ? "🪙 <i>АДМИН</i>" : `🪙 ${money}`;
  document.getElementById("menu-money").innerHTML = text;
  document.getElementById("tuning-money").innerHTML = text;
}

let tuning = {};
try { tuning = JSON.parse(localStorage.getItem("ins1-tuning")) || {}; } catch {}
function saveTuning() {
  try { localStorage.setItem("ins1-tuning", JSON.stringify(tuning)); } catch {}
}
function getTun(id) {
  if (!tuning[id]) tuning[id] = { paint: null, vinyl: "нет", spoiler: false,
                                  rims: false, neon: "нет", engine: 0, brakes: 0, tires: 0 };
  return tuning[id];
}

// --- Перекраска: яркость каждого оттенка сохраняем через светимость ---
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255);
}
function scaleColor(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(n >> 16 & 255)}, ${c(n >> 8 & 255)}, ${c(n & 255)})`;
}

// Хитрость: "обёртка" вокруг кисти. Когда рисунок машины ставит цвет
// краски — обёртка тихонько подменяет его на выбранный игроком!
function paintedContext(g, map) {
  return new Proxy(g, {
    get(t, k) {
      const v = t[k];
      return typeof v === "function" ? v.bind(t) : v;
    },
    set(t, k, v) {
      if (k === "fillStyle" && typeof v === "string" && map[v]) v = map[v];
      t[k] = v;
      return true;
    },
  });
}

// Нарисовать машину СО ВСЕМ тюнингом: неон → кузов (в цвете) → винил/детали
function drawCarTuned(g, id, t) {
  if (t && NEON_COLORS[t.neon]) {
    const nc = NEON_COLORS[t.neon];
    g.save();
    g.globalAlpha = 0.35;
    g.fillStyle = nc;
    g.beginPath(); g.ellipse(0, 7, 108, 15, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.7;
    g.beginPath(); g.ellipse(0, 7, 80, 8, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  let gg = g;
  if (t && t.paint && PAINT_SLOTS[id]) {
    const slots = PAINT_SLOTS[id];
    const baseLum = Math.max(10, lum(slots[0]));
    const map = {};
    for (const s of slots)
      map[s] = scaleColor(t.paint, Math.max(0.3, Math.min(1.5, lum(s) / baseLum)));
    gg = paintedContext(g, map);
  }
  CAR_DRAWERS[id](gg);
  if (t) drawMods(g, id, t);
}

// Винилы и детали — поверх кузова
// «Примерочная» тюнинга (ревизия реалистики, заказ Саши): украшения
// рисовались по меркам седана — на фургонах спойлер висел посреди
// дверей, а полосы шли по стёклам. Здесь мерки нестандартных машин:
// spoilerY — где крыша, stripeTop — откуда начинать полосы,
// noSpoiler — у машины УЖЕ есть заводское крыло.
const MOD_FIT = {
  buhanka: { spoilerY: -132, stripeTop: -70 },
  raf: { spoilerY: -128, stripeTop: -70 },
  escalade: { spoilerY: -126, stripeTop: -62 },
  durango: { spoilerY: -120, stripeTop: -64 },
  navigator: { spoilerY: -122, stripeTop: -62 },
  disco: { spoilerY: -120, stripeTop: -58 },
  hilux: { spoilerY: -108, stripeTop: -56 },
  rav4: { spoilerY: -124, stripeTop: -62 },
  kuga: { spoilerY: -118, stripeTop: -60 },
  gle: { spoilerY: -108, stripeTop: -58 },
  sportage: { spoilerY: -110, stripeTop: -60 },
  tucson: { spoilerY: -120, stripeTop: -58 },
  ecosport: { spoilerY: -116, stripeTop: -58 },
  chetverka: { spoilerY: -116, stripeTop: -64 },
  i30: { spoilerY: -108, stripeTop: -60 },
  zis: { spoilerY: -112, stripeTop: -64 },
  gemera: { spoilerY: -86, stripeTop: -74 },
  wayra: { noSpoiler: true, stripeTop: -74 },
  fordgt: { noSpoiler: true, stripeTop: -70 },
  tuatara: { noSpoiler: true, stripeTop: -72 },
  f1: { noSpoiler: true },
  fford: { noSpoiler: true },
  vetteC8: { noSpoiler: true },
};

function drawMods(g, id, t) {
  const fit = MOD_FIT[id] || {};
  if (t.vinyl === "полосы") {
    const top = fit.stripeTop ?? -98;
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.fillRect(-19, top, 12, -8 - top);
    g.fillRect(  7, top, 12, -8 - top);
  } else if (t.vinyl === "пламя") {
    const flame = (h1, h2, color) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(-70, -8);
      let up = true;
      for (let x = -70; x < 70; x += 14) {
        g.lineTo(x + 7, up ? h1 : h2);
        g.lineTo(x + 14, -8);
        up = !up;
      }
      g.closePath();
      g.fill();
    };
    flame(-36, -25, "#d5121e");
    flame(-28, -19, "#ff8c1a");
  } else if (t.vinyl === "номер") {
    g.fillStyle = "#f2f3f0";
    g.beginPath(); g.arc(-44, -42, 13, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#17191c";
    g.lineWidth = 2;
    g.beginPath(); g.arc(-44, -42, 13, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#17191c";
    g.font = "bold 15px Verdana";
    g.textAlign = "center";
    g.fillText("7", -44, -36);
  }
  if (t.spoiler && !fit.noSpoiler) {
    const sy = fit.spoilerY ?? -72;
    g.fillStyle = "#101214";
    g.fillRect(-34, sy + 6, 5, 12);
    g.fillRect( 29, sy + 6, 5, 12);
    roundRect(g, -58, sy, 116, 7, 3, "#101214");
  }
  if (t.rims) {
    const x = RIM_X[id] || 66;
    for (const s of [-1, 1]) {
      circle(g, s * x, -11, 6.5, "#e8b40c");
      circle(g, s * x, -11, 3, "#3a2f05");
    }
  }
}

// ---------- Экран тюнинга ----------
let inTuning = false;
const tCanvas = document.getElementById("tuning-canvas");
const tctx = tCanvas.getContext("2d");

function chip(label, active, onClick) {
  const b = document.createElement("button");
  b.className = "chip" + (active ? " active" : "");
  b.textContent = label;
  b.addEventListener("click", () => { onClick(); saveTuning(); renderTuning(); });
  return b;
}

function renderTuning() {
  const c = CARS[garageIndex];
  const t = getTun(c.id);
  document.getElementById("tuning-name").textContent = c.name;

  // Белый куб-подиум с живым предпросмотром (как в гараже)
  tctx.clearRect(0, 0, tCanvas.width, tCanvas.height);
  drawCube(tctx, 150, 146, 110, 32, 13);
  tctx.save();
  tctx.translate(156, 141);
  tctx.scale(1.1, 1.1);
  drawCarTuned(tctx, c.id, t);
  tctx.restore();

  // 🎨 Краски (+ кнопка "завод")
  const paints = document.getElementById("paints");
  paints.innerHTML = "";
  paints.appendChild(chip("завод", !t.paint, () => { t.paint = null; }));
  for (const col of PAINT_PALETTE) {
    const b = document.createElement("button");
    b.className = "paint-swatch" + (t.paint === col ? " active" : "");
    b.style.background = col;
    b.addEventListener("click", () => { t.paint = col; saveTuning(); renderTuning(); });
    paints.appendChild(b);
  }

  // 🏁 Винилы
  const vin = document.getElementById("vinyls");
  vin.innerHTML = "";
  for (const v of VINYLS)
    vin.appendChild(chip(v, t.vinyl === v, () => { t.vinyl = v; }));

  // 🔩 Детали
  const det = document.getElementById("details");
  det.innerHTML = "";
  if (MOD_FIT[c.id] && MOD_FIT[c.id].noSpoiler) {
    const b = chip("крыло уже есть!", false, () => {});
    b.classList.add("locked");
    det.appendChild(b);
  } else {
    det.appendChild(chip("спойлер", t.spoiler, () => { t.spoiler = !t.spoiler; }));
  }
  det.appendChild(chip("золотые диски", t.rims, () => { t.rims = !t.rims; }));
  const neons = Object.keys(NEON_COLORS);
  det.appendChild(chip("неон: " + t.neon, t.neon !== "нет", () => {
    t.neon = neons[(neons.indexOf(t.neon) + 1) % neons.length];
  }));

  // ⚙️ Железо: покупается за монеты! Клик = купить следующий уровень.
  // Ревизия реалистики (заказ Саши): ЗИСу тормоза не продаются
  // (их НЕТ — платить не за что!), а болидам и гиперкарам не
  // продаётся мотор — он и так выжат заводом до предела.
  const hw = document.getElementById("hardware");
  hw.innerHTML = "";
  for (const key of ["engine", "brakes", "tires"]) {
    if (key === "brakes" && c.noBrakes) {
      const b = chip("тормоза: НЕТ (и не будет!)", false, () => {});
      b.classList.add("locked");
      hw.appendChild(b);
      continue;
    }
    if (key === "engine" && c.noNpc) {
      const b = chip("мотор: заводской максимум", false, () => {});
      b.classList.add("locked");
      hw.appendChild(b);
      continue;
    }
    const lvl = t[key];
    const bars = "▮".repeat(lvl) + "▯".repeat(3 - lvl);
    let label, locked = false;
    if (lvl >= 3) {
      label = `${HW_NAMES[key]}: ${bars} MAX`;
    } else {
      label = `${HW_NAMES[key]}: ${bars} · ${HW_PRICE[lvl]} 🪙`;
      locked = !canAfford(HW_PRICE[lvl]);
    }
    const b = chip(label, lvl > 0, () => {
      if (t[key] >= 3 || !canAfford(HW_PRICE[t[key]])) return; // нет денег/максимум
      pay(HW_PRICE[t[key]]);
      t[key]++;
    });
    if (locked) b.classList.add("locked");
    hw.appendChild(b);
  }
  updateMoneyUI();
}

function openTuning() {
  inTuning = true;
  show("garage", false);
  show("tuning", true);
  renderTuning();
}
function closeTuning() {
  inTuning = false;
  show("tuning", false);
  show("garage", true);
  renderGarage();
}
wireButton("btn-tuning", openTuning);
wireButton("btn-tuning-back", closeTuning);
wireButton("btn-paint-reset", () => {
  const id = CARS[garageIndex].id;
  // Честный возврат: деньги за купленное железо возвращаются!
  const t = tuning[id];
  if (t) {
    for (const key of ["engine", "brakes", "tires"])
      for (let lvl = 0; lvl < (t[key] || 0); lvl++) money += HW_PRICE[lvl];
    saveMoney();
  }
  delete tuning[id];
  saveTuning();
  renderTuning();
});

addEventListener("keydown", (e) => {
  // Печатаешь в текстовом поле (код, мультиплеер)? Игра не вмешивается!
  // Enter в поле = нажать соседнюю кнопку (фикс по жалобе Саши)
  if (e.target && e.target.tagName === "INPUT") {
    if (e.code === "Escape") e.target.blur();
    if (e.code === "Enter" || e.code === "NumpadEnter") {
      if (e.target.id === "code-input") document.getElementById("btn-code").click();
      if (e.target.id === "mp-code") document.getElementById("btn-mp-join").click();
    }
    return;
  }

  // --- Режим "поймай клавишу": игрок выбирает клавишу в настройках ---
  if (listening) {
    e.preventDefault();
    if (e.code !== "Escape" && !RESERVED_KEYS.includes(e.code))
      setBind(listening.fn, listening.slot, e.code);
    listening = null;   // Esc или запретная клавиша = отмена
    renderBinds();
    return;
  }

  keys[e.code] = true;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code))
    e.preventDefault(); // чтобы страница не прокручивалась стрелками

  // Совпадает ли клавиша с одной из двух, назначенных на функцию?
  const hit = (fn) => !e.repeat && binds[fn].includes(e.code);

  // --- Эти клавиши работают везде ---
  if (e.code === "KeyM" && !e.repeat) muted = !muted; // M — вкл/выкл звук
  // − и + (в том числе на цифровом блоке) — громкость мотора
  if (e.code === "Minus" || e.code === "NumpadSubtract")
    soundVolume = Math.max(0, +(soundVolume - 0.1).toFixed(1));
  if (e.code === "Equal" || e.code === "NumpadAdd")
    soundVolume = Math.min(1, +(soundVolume + 0.1).toFixed(1));
  if (e.code === "Escape" && !e.repeat) {
    if (inSettings) closeSettings();     // Esc в настройках — назад в меню
    else if (inTuning) closeTuning();    // Esc в тюнинге — назад в гараж
    else if (inGarage) closeGarage();    // Esc в гараже — назад в меню
    else if (inRaces) closeRaces();      // Esc в заездах — назад в меню
    else if (inCity) closeCity();        // Esc в городе — назад в меню
    else if (inMp) closeMp();            // Esc в мультиплеере — назад в меню
    else togglePause();                  // Esc в заезде — ПАУЗА
  }
  // Enter в главном меню = "Свободная езда"
  if (e.code === "Enter" && !started && !inSettings && !inGarage
      && !inRaces && !inCity && !inMp)
    goRace();
  // Стрелки листают машины в гараже
  if (inGarage && e.code === "ArrowLeft" && !e.repeat)
    document.getElementById("btn-prev").click();
  if (inGarage && e.code === "ArrowRight" && !e.repeat)
    document.getElementById("btn-next").click();

  // --- Эти — только во время заезда (не в меню/паузе/аварии) ---
  const racing = started && !paused && !crashed;
  if (racing) {
    // Коробка: автомат/ручная. Работает ТОЛЬКО у машин со смешанной
    // коробкой (категория С)! У А всегда автомат, у М — всегда механика.
    if (hit("gearbox") && car.gearbox === "С") {
      manualMode = !manualMode;
      if (manualMode)
        manualGear = clamp(Math.floor(speed / tunedMaxSpeed() * GEARS) + 1, 1, GEARS);
    }
    // Передачи (работают только на ручной)
    if (hit("gearDown") && manualMode)
      manualGear = Math.max(1, manualGear - 1);
    if (hit("gearUp") && manualMode)
      manualGear = Math.min(GEARS, manualGear + 1);

    // Режим поездки — по кругу: Эко → Норма → Спорт (только у машин
    // с режимами, пока это Корса)
    if (hit("mode") && car.modes)
      driveMode = (driveMode + 1) % 3;

    // Z — разворот (только на шоссе: это дорога туда-обратно!)
    if (hit("uturn") && raceKind === "highway")
      doUTurn();

    // Заправка у колонки (цены Саши: V — полный бак 2 🪙, C — полбака 1 🪙)
    if (raceKind === "highway" && nearGas && speed < KMH * 5) {
      if (hit("refuelFull")) {
        if (fuel >= 99.5)
          lapMsg = { text: "⛽ Бак уже полон!", until: performance.now() + 2000 };
        else if (!canAfford(2))
          lapMsg = { text: "⛽ Нужно 2 🪙 — не хватает!", until: performance.now() + 2500 };
        else {
          pay(2);
          fuel = 100;
          saveFuel();
          lapMsg = { text: "⛽ Полный бак за 2 🪙!", until: performance.now() + 2500 };
        }
      }
      if (hit("refuelHalf")) {
        if (fuel >= 99.5)
          lapMsg = { text: "⛽ Бак уже полон!", until: performance.now() + 2000 };
        else if (!canAfford(1))
          lapMsg = { text: "⛽ Нужна 1 🪙 — кошелёк пуст!", until: performance.now() + 2500 };
        else {
          pay(1);
          fuel = Math.min(100, fuel + 50);
          saveFuel();
          lapMsg = { text: "⛽ Полбака за 1 🪙!", until: performance.now() + 2500 };
        }
      }
    }

    // T — сменить трассу (только на кольце, драг-полоса одна)
    if (e.code === "KeyT" && !e.repeat && raceKind === "circuit") {
      buildTrack((currentTrack + 1) % TRACK_NAMES.length);
      restartRace();
      updateTrackButton();
    }

    // Ключ зажигания: заводит мотор, а если работает — глушит.
    // Без бензина на шоссе мотор не заведётся — жди эвакуатор!
    if (hit("engine")) {
      if (engineOn) {
        engineOn = false;                             // заглушили
      } else if (!engineStarting && !(raceKind === "highway" && fuel <= 0)) {
        engineStarting = true;                        // крутим стартер!
        engineStartAt = performance.now();
      }
    }
  }

  // R — снова заезд (в заезде, на паузе или после аварии)
  if (e.code === "KeyR" && !e.repeat && started) restartRace();

  // Звук можно создавать только после нажатия клавиши — правило браузера,
  // чтобы сайты не могли гудеть сами по себе
  initEngineSound();
  if (engine && engine.ac.state === "suspended") engine.ac.resume();
});
addEventListener("keyup", (e) => { keys[e.code] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

// Нажата ли функция: проверяем ОБЕ назначенные клавиши И сенсорные кнопки
const down = (fn) => !!(keys[binds[fn][0]] || (binds[fn][1] !== "" && keys[binds[fn][1]]));
const pressGas   = () => down("gas") || touchState.gas;
const pressBrake = () => down("brake") || touchState.brake;
const pressLeft  = () => down("left") || touchState.left;
const pressRight = () => down("right") || touchState.right;

// =====================================================================
//  СЕНСОРНОЕ УПРАВЛЕНИЕ (для телефонов — идея Саши: показать друзьям!)
//  Газ/тормоз/руль — кнопки-держалки. Остальные кнопки — контекстные:
//  появляются только когда нужны (Q/E на механике, Z на шоссе…)
// =====================================================================

const touchState = { gas: false, brake: false, left: false, right: false };
// Телефон или комп? Анкеты («умеешь касания?», «какой главный
// указатель?») компы Саши заполняли враньём — то всё телефонное на
// компе, то наоборот. Новый принцип: СМОТРИМ, ЧЕМ ИГРАЮТ на самом
// деле. Коснулся экрана пальцем — телефонный режим. Нажал клавишу
// на клавиатуре — компьютерный. Само исправляется в обе стороны!
let isTouchDevice = window.matchMedia("(pointer: coarse) and (hover: none)").matches;
function setTouchMode(on) {
  isTouchDevice = on;
  // На телефонах игра ВСЕГДА горизонтальная (решение Саши): если
  // телефон держат вертикально — CSS повернёт игру на 90°!
  document.body.classList.toggle("touch-device", on);
}
setTouchMode(isTouchDevice);
window.addEventListener("touchstart", () => {
  if (!isTouchDevice) setTouchMode(true);
}, { passive: true });
window.addEventListener("keydown", (e) => {
  // e.isTrusted отсеивает «поддельные» нажатия от наших же
  // сенсорных кнопок — они тоже шлют события клавиш!
  if (isTouchDevice && e.isTrusted) setTouchMode(false);
});

// Кнопка-держалка: жмёшь — работает, отпустил — перестала
function bindHold(id, prop) {
  const el = document.getElementById(id);
  const on = (e) => { e.preventDefault(); touchState[prop] = true; };
  const off = (e) => { e.preventDefault(); touchState[prop] = false; };
  el.addEventListener("touchstart", on, { passive: false });
  el.addEventListener("touchend", off);
  el.addEventListener("touchcancel", off);
  el.addEventListener("mousedown", on);
  el.addEventListener("mouseup", off);
  el.addEventListener("mouseleave", off);
}
bindHold("t-gas", "gas");
bindHold("t-brake", "brake");
bindHold("t-left", "left");
bindHold("t-right", "right");

// Кнопка-нажималка: работает как нажатие клавиши (переиспользуем
// ВСЮ клавиатурную логику — сенсор просто «жмёт клавиши»!)
function bindTap(el, getCode) {
  const fire = (e) => {
    e.preventDefault();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: getCode() }));
  };
  el.addEventListener("touchstart", fire, { passive: false });
  el.addEventListener("mousedown", fire);
}
bindTap(document.getElementById("t-pause"), () => "Escape");

// Контекстные кнопки: каждая знает, КОГДА ей показываться
const CTX_BUTTONS = [
  { label: "🔑",  code: () => binds.engine[0],     show: () => true },
  { label: "Q▼", code: () => binds.gearDown[0],   show: () => manualMode },
  { label: "E▲", code: () => binds.gearUp[0],     show: () => manualMode },
  { label: "🎚",  code: () => binds.mode[0],       show: () => !!car.modes },
  { label: "🔄",  code: () => binds.uturn[0],      show: () => raceKind === "highway" },
  { label: "⛽V", code: () => binds.refuelFull[0], show: () => raceKind === "highway" && nearGas },
  { label: "⛽C", code: () => binds.refuelHalf[0], show: () => raceKind === "highway" && nearGas },
];
const ctxBox = document.getElementById("t-context");
for (const def of CTX_BUTTONS) {
  const b = document.createElement("button");
  b.className = "tbtn";
  b.textContent = def.label;
  bindTap(b, def.code);
  def.el = b;
  ctxBox.appendChild(b);
}

// Каждые 150 мс решаем, что показывать: весь слой — только в заезде,
// контекстные кнопки — по обстановке
setInterval(() => {
  const layer = document.getElementById("touch");
  // Во время отсчёта кнопки тоже нужны — заводиться и газовать!
  const active = isTouchDevice && started && !paused && !crashed && !raceOver;
  layer.classList.toggle("hidden", !active);
  if (!active) return;
  for (const def of CTX_BUTTONS)
    def.el.style.display = def.show() ? "" : "none";
}, 150);

// =====================================================================
//  ЗВУК МОТОРА — синтезируем сами через Web Audio API!
//  Никаких файлов: звук рождается из математики, как на старых приставках.
//
//  Схема нашего "мотора":
//    осциллятор 1 (пила)  ──┐
//                            ├──► фильтр НЧ ──► громкость ──► колонки
//    осциллятор 2 (квадрат) ─┘
//
//  "Пила" даёт злой рык, "квадрат" октавой ниже — густой рокот.
//  Фильтр низких частот приглушает писк — получается именно мотор.
// =====================================================================

let engine = null;   // здесь будут жить все звуковые узлы
let muted = false;   // клавиша M — вкл/выкл звук
const GEARS = 5;     // 5 передач, как у настоящей Авео!

// Зажигание (идея Саши): пока не нажмёшь F — мотор молчит и машина
// не едет. F крутит стартер ~1 секунду, потом мотор оживает.
let engineOn = false;
let engineStarting = false;
let engineStartAt = 0;

// Громкость в руках игрока: клавиши − и + (0% … 100%).
// 30% — уровень по умолчанию, подобранный Сашей на слух.
let soundVolume = 0.3;

// ---------- Коробка передач (спецификация Саши) ----------
// КАТЕГОРИИ КОРОБОК (придумал Саша, у каждой машины своя):
//   А — только автоматическая (Пиканто, Фокус)
//   М — только механическая  (как у Шелби — будет позже)
//   С — смешанная: можно переключаться клавишей N (как у Авео)
// Категория теперь лежит в машине: car.gearbox

// На ручной передача честно влияет на разгон: у каждой свой
// диапазон скоростей (внутри максималки ТЕКУЩЕЙ машины)!
// (manualMode и manualGear объявлены наверху, рядом с машинами —
// они нужны applyCar уже при загрузке!)

// Максималка С УЧЁТОМ прокачки мотора (ревизия реалистики, заказ
// Саши): чип-тюнинг даёт +2.5% максималки за уровень — как в жизни
// (+8% мощности ≈ +2.5% скорости: воздух сопротивляется в кубе!).
// Болидам и гиперкарам (noNpc) бонуса нет: их моторы уже выжаты.
function tunedMaxSpeed() {
  const bonus = car.noNpc ? 0 : 0.025 * getTun(car.id).engine;
  return car.maxSpeed * (1 + bonus);
}

// Диапазон скоростей передачи g: от gearLow(g) до gearHigh(g)
const gearLow  = (g) => (g - 1) / GEARS * tunedMaxSpeed();
const gearHigh = (g) =>  g      / GEARS * tunedMaxSpeed();

// Какая сейчас передача и "обороты" (0..1, на отсечке чуть больше 1)
function getGearAndRpm() {
  const p = speed / tunedMaxSpeed();
  // Электромобиль (Э): передач нет, "обороты" растут плавно со скоростью
  if (car.gearbox === "Э") return { gear: 1, rpm: clamp(p, 0, 1) };
  if (manualMode) {
    const lo = (manualGear - 1) / GEARS;
    const hi =  manualGear      / GEARS;
    const rpm = clamp((p - lo) / (hi - lo), 0, 1.15); // >1 — рёв отсечки!
    return { gear: manualGear, rpm };
  }
  // Автомат сам держит обороты в рабочей зоне
  const g = Math.min(GEARS - 1, Math.floor(p * GEARS));
  return { gear: g + 1, rpm: p * GEARS - g };
}

function initEngineSound() {
  if (engine) return; // уже создан
  const ac = new (window.AudioContext || window.webkitAudioContext)();

  const master = ac.createGain();          // общая громкость
  master.gain.value = 0;
  master.connect(ac.destination);

  const filter = ac.createBiquadFilter();  // фильтр низких частот
  filter.type = "lowpass";
  filter.frequency.value = 800;
  filter.Q.value = 1;
  filter.connect(master);

  // v3 (по слуху Саши): "пила" слишком колючая и раздражает.
  // Теперь основной голос — мягкий "треугольник", а капелька "пилы"
  // октавой ниже добавляет лишь лёгкую шершавость мотора.
  const osc1 = ac.createOscillator();      // "треугольник" — мягкий гул
  osc1.type = "triangle";
  const osc2 = ac.createOscillator();      // чуть-чуть "пилы" для текстуры
  osc2.type = "sawtooth";

  const g1 = ac.createGain(); g1.gain.value = 0.55;
  const g2 = ac.createGain(); g2.gain.value = 0.08;
  osc1.connect(g1); g1.connect(filter);
  osc2.connect(g2); g2.connect(filter);
  osc1.start();
  osc2.start();

  engine = { ac, master, filter, osc1, osc2 };
}

// Каждый кадр подстраиваем звук под скорость.
// Хитрость с ПЕРЕДАЧАМИ: делим шкалу скорости на 5 кусков. Внутри куска
// "обороты" растут от малых к максимальным, на границе — передача
// переключается и обороты падают. Слышно то самое "взззз-ВЖУХ-взззз"!
function updateEngineSound() {
  if (!engine) return;
  const t = engine.ac.currentTime;

  // --- Стартер: F нажата, мотор ещё "прокручивается" ---
  if (engineStarting) {
    const e = (performance.now() - engineStartAt) / 1000;
    // Электромобиль не крутит стартер — он ВКЛЮЧАЕТСЯ: короткий
    // чистый писк вверх, и готово (0.35 с вместо секунды!)
    if (car.gearbox === "Э") {
      if (e > 0.35) {
        engineStarting = false;
        engineOn = true;
      }
      engine.osc1.frequency.setTargetAtTime(500 + e * 900, t, 0.02);
      engine.osc2.frequency.setTargetAtTime(1000 + e * 1800, t, 0.02);
      engine.filter.frequency.setTargetAtTime(2400, t, 0.03);
      engine.master.gain.setTargetAtTime(muted ? 0 : 0.05 * soundVolume, t, 0.03);
      return;
    }
    if (e > 1.1) {              // секунда прокрутки — и мотор ожил!
      engineStarting = false;
      engineOn = true;
    }
    // Тарахтение стартера: высота дрожит (sin) и понемногу растёт
    const f = 65 + e * 55 + Math.sin(e * 50) * 22;
    engine.osc1.frequency.setTargetAtTime(f, t, 0.02);
    engine.osc2.frequency.setTargetAtTime(f * 0.75, t, 0.02);
    engine.filter.frequency.setTargetAtTime(420 + e * 320, t, 0.03);
    engine.master.gain.setTargetAtTime(muted ? 0 : 0.12 * soundVolume, t, 0.05);
    return;
  }

  // --- Мотор не заведён: затихаем. Частота сползает вниз —
  //     слышно, как мотор "выдыхает" при глушении ---
  if (!engineOn) {
    engine.osc1.frequency.setTargetAtTime(40, t, 0.1);
    engine.osc2.frequency.setTargetAtTime(20, t, 0.1);
    engine.master.gain.setTargetAtTime(0, t, 0.09);
    return;
  }

  // --- Электромотор (Э): не рычит, а ПОЁТ — чистый свист, растущий
  //     со скоростью, с лёгким "биением" двух частот ---
  if (car.gearbox === "Э") {
    const p = speed / car.maxSpeed;
    const freq = 160 + p * 1100;
    engine.osc1.frequency.setTargetAtTime(freq, t, 0.04);
    engine.osc2.frequency.setTargetAtTime(freq * 2.01, t, 0.04); // биение!
    engine.filter.frequency.setTargetAtTime(1200 + p * 2400 + (pressGas() ? 400 : 0), t, 0.05);
    const evVol = (muted || !started || paused) ? 0
                : (0.02 + p * 0.05 + (pressGas() ? 0.015 : 0)) * soundVolume;
    engine.master.gain.setTargetAtTime(evVol, t, 0.1);
    return;
  }

  // --- Мотор работает ---
  // Обороты берём из коробки передач: на ручной слышно и низкие
  // обороты ("затупил" на высокой передаче), и рёв отсечки (rpm > 1)
  const drive = getGearAndRpm();
  const rpm = 0.25 + drive.rpm * 0.75;

  // Высота звука: подняли тон (было басовитее — Саше не понравилось)
  const freq = 80 + rpm * 180 + (drive.gear - 1) * 12;
  engine.osc1.frequency.setTargetAtTime(freq, t, 0.03);
  engine.osc2.frequency.setTargetAtTime(freq / 2, t, 0.03);

  // На газу мотор звучит ярче (открываем фильтр), на накате — глуше.
  // В СПОРТЕ фильтр открыт сильнее (злее звук), в ЭКО — прикрыт
  const modeFilter = car.modes ? [-120, 0, 300][driveMode] : 0;
  engine.filter.frequency.setTargetAtTime(
    300 + rpm * 500 + (pressGas() ? 200 : 0) + modeFilter, t, 0.05);

  // Громкость = базовая кривая × регулятор игрока (клавиши − и +).
  // В меню и на паузе мотор молчит. СПОРТ чуть громче, ЭКО тише
  const modeVol = car.modes ? [0.85, 1, 1.15][driveMode] : 1;
  const vol = (muted || !started || paused) ? 0
            : (0.06 + rpm * 0.07 + (pressGas() ? 0.03 : 0)) * soundVolume * modeVol;
  engine.master.gain.setTargetAtTime(vol, t, 0.1);
}

// =====================================================================
//  ОБНОВЛЕНИЕ (физика) — вызывается каждый кадр
// =====================================================================

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function update(dt) {
  // Меню, пауза, авария или финиш = стоп-кадр, физика спит
  if (!started || paused || crashed || raceOver) return;

  // Страховка коробки (баг нашёл Саша: у ЗИСа показывало «А5»!):
  // категория машины — закон. М — всегда механика, А и Э — всегда
  // автомат, и только С разрешает переключаться.
  if (car.gearbox === "М") manualMode = true;
  else if (car.gearbox !== "С") manualMode = false;

  // Отсчёт 3-2-1: все стоят на решётке, можно только заводиться и газовать
  if ((raceMode || taMode) && countdown > -2) {
    const beforeGo = countdown > 0;
    countdown -= dt;
    if (beforeGo && countdown <= 0 && raceMode)
      shieldUntil = performance.now() + 5000;  // GO! Щиты на 5 секунд!
    if (countdown > 0) {
      speed = 0;
      return;
    }
  }

  // Против рекорда: тикает секундомер и записывается путь машины
  // (10 точек в секунду — из них потом получится призрак!)
  if (taMode && countdown <= 0) {
    lapTime += dt;
    const last = taRecording[taRecording.length - 1];
    if (!last || lapTime - last[0] >= 0.1)
      taRecording.push([lapTime, position, playerX]);
  }

  const seg = findSegment(position);
  const speedPercent = speed / tunedMaxSpeed();
  // Чем быстрее едем, тем резче реагирует руль (как в жизни!)
  const dx = dt * 2 * speedPercent;

  // Руль
  let steerInput = 0;
  if (pressLeft())  { playerX -= dx; steerInput -= 1; }
  if (pressRight()) { playerX += dx; steerInput += 1; }
  steer += (steerInput - steer) * Math.min(1, dt * 12); // плавный наклон машинки

  // Центробежная сила: в повороте машину выносит наружу.
  // Прокачанные шины держат лучше: −8% выноса за уровень!
  playerX -= dx * speedPercent * seg.curve * CENTRIFUGAL
           * (1 - 0.08 * getTun(car.id).tires);

  // Газ и тормоз.
  // Разгон "как в жизни": чем ближе к максималке, тем слабее тяга.
  // (1 - p²) на нуле даёт полную мощность, на максималке — ноль.
  // В повороте разгон слабее (TURN_ACCEL_FACTOR), а накат чуть заметнее.
  // Газ работает, только если мотор заведён (F)!
  const turning = pressLeft() || pressRight();
  // ШОССЕ: горит бензин! Расход зависит от скорости, режима поездки
  // (вот где ЭКО наконец пригодился!) и веса машины. Топливо есть
  // ТОЛЬКО в городе — в гонках его нет (решение Саши).
  if (raceKind === "highway" && engineOn) {
    const modeF = car.modes ? [0.6, 1, 1.6][driveMode] : 1;
    const heavy = car.ram ? 1.7 : 1;
    fuel = Math.max(0, fuel - (0.35 + (speed / car.maxSpeed) * 1.1) * modeF * heavy * dt);
    if (fuel <= 0 && !fuelEmptyAt) {
      fuelEmptyAt = performance.now();
      engineOn = false;   // мотор заглох — бак пуст!
      saveFuel();
    }
  }
  // ЗАПРАВКА на шоссе: стоишь рядом с колонкой — бак наполняется,
  // монеты списываются (1.5 🪙 за 1%). Уточнение Саши: топливо — на заправках!
  if (raceKind === "highway") {
    nearGas = false;
    const segIdx = Math.floor(position / SEG_LEN);
    for (let n = -4; n <= 6 && !nearGas; n++) {
      const seg2 = segments[(segIdx + n + segments.length) % segments.length];
      if (seg2.sprites.some((s) => s.type === "gas")) nearGas = true;
    }
    // У колонки эвакуатор не нужен — заправься кнопками V или C!
    if (nearGas && speed < KMH * 5) fuelEmptyAt = 0;
  }

  // Эвакуатор приезжает через 3 секунды: −50 🪙 и 20% бензина
  if (raceKind === "highway" && fuelEmptyAt
      && performance.now() - fuelEmptyAt > 3000) {
    fuelEmptyAt = 0;
    if (!adminCode) {
      money = Math.max(0, money - 50);
      saveMoney();
    }
    updateMoneyUI();
    fuel = 20;
    saveFuel();
    lapMsg = { text: "🚛 Эвакуатор: −50 🪙, в баке 20%. Заведи мотор!",
               until: performance.now() + 5000 };
  }

  const tun = getTun(car.id);   // тюнинг-железо влияет на физику!
  if (pressGas() && engineOn) {
    // Прокачанный мотор: +8% тяги за уровень
    let thrust = car.accel * (1 + 0.08 * tun.engine)
               * (1 - speedPercent * speedPercent);
    // Режим поездки: ЭКО придерживает мотор, СПОРТ выжимает всё
    if (car.modes) thrust *= MODE_ACCEL[driveMode];
    if (manualMode) {
      // Ручная коробка: тяга зависит от того, попал ли ты в диапазон
      // передачи. Выше диапазона — ОТСЕЧКА (тяги нет, переключайся!).
      // Ниже диапазона — мотор "тупит" (передача слишком высокая).
      if (speed >= gearHigh(manualGear))     thrust = 0;
      else if (speed < gearLow(manualGear))  thrust *= 0.25;
    }
    // СТАРТОВЫЙ УСКОРИТЕЛЬ ЗИСа (идея Саши): первые 5 секунд после GO
    // броневик разгоняется как 0–100 за 4 секунды вместо 22! Ракете
    // плевать на передачи и отсечки — поэтому считаем ПОСЛЕ коробки
    if (zisBoostActive())
      thrust = car.maxSpeed * Math.atanh(100 / car.topKmh) / 4
             * (1 - speedPercent * speedPercent);
    speed += thrust * (turning ? TURN_ACCEL_FACTOR : 1) * dt;
  } else if (pressBrake()) {
    // Прокачанные тормоза: +10% силы за уровень (ЗИСу не поможет: 0 × что угодно = 0)
    speed += car.brakeDecel * (1 + 0.10 * tun.brakes) * dt;
  } else {
    speed += (turning ? COAST_DECEL_TURN : COAST_DECEL) * dt;
  }

  // Торможение двигателем: на ручной, если скорость выше диапазона
  // передачи, мотор ревёт и осаживает машину. Гоночный приём —
  // тормозить понижением передачи!
  if (manualMode && engineOn && speed > gearHigh(manualGear) && !zisBoostActive())
    speed += ENGINE_BRAKE * dt;

  // Выехал на траву на большой скорости? Держись, будет трясти и
  // тормозить! Уточнение Саши: броневик (ram) И внедорожники
  // (offroadSoft) по траве едут как по асфальту — совсем без потерь.
  // Разница: аварии внедорожники НЕ прощают, а броневик таранит.
  if ((playerX < -1 || playerX > 1) && speed > OFFROAD_LIMIT
      && !car.ram && !car.offroadSoft)
    speed += OFFROAD_DECEL * dt;

  playerX = clamp(playerX, -2.2, 2.2);
  speed = clamp(speed, 0, tunedMaxSpeed());   // максималка своя + чип-тюнинг!

  // Едем вперёд! Трасса — кольцо, поэтому после финиша снова старт
  const prevPosForHit = position;   // откуда стартовал этот кадр (для столкновений)
  position += speed * dt;
  while (position >= trackLength) {
    position -= trackLength;
    if (raceMode) playerLap++;   // пересекли стартовую черту — новый круг!
    if (taMode) finishTaLap();   // против рекорда: круг завершён!
  }

  // 88 миль/ч! Пересекли отметку 142 км/ч снизу вверх — поджигаем след.
  // Решение Саши: огонь — ЭКСКЛЮЗИВ Делориана, машины времени!
  const kmhNow = speed / KMH;
  if (car.id === "delorean" && prevKmh < 142 && kmhNow >= 142)
    fireTrailUntil = performance.now() + 5000;
  prevKmh = kmhNow;

  // Столкновения: проверяем объекты на сегменте, где сейчас машина.
  // Врезаемся, только если реально едем (быстрее 5 км/ч).
  // В ГОРОДЕ (на шоссе) столкновений нет вообще — решение Саши!
  if (speed > KMH * 5 && raceKind !== "highway") {
    // Гиперкары (Гемера — 400 км/ч!) пролетают за кадр БОЛЬШЕ одного
    // сегмента. Проверяем каждый пройденный сегмент, а не только
    // текущий — иначе можно проскочить СКВОЗЬ бочку, не заметив её!
    const fromSeg = Math.floor(prevPosForHit / SEG_LEN);
    const passedSegs = Math.max(0,
      Math.floor((prevPosForHit + speed * dt) / SEG_LEN) - fromSeg);
    for (let k = 0; k <= passedSegs && !crashed; k++) {
    const here = segments[(fromSeg + k) % segments.length];
    // Идём с конца, чтобы можно было БЕЗОПАСНО удалять снесённые объекты
    for (let i = here.sprites.length - 1; i >= 0; i--) {
      const spr = here.sprites[i];
      let collided = false;
      // Столбы арок (стартовой и финишной): два столба по бокам
      if (spr.type === "arch" || spr.type === "farch") {
        collided = Math.abs(Math.abs(playerX) - ARCH_PILLAR_X) < ARCH_PILLAR_W + CAR_HALF_W;
      } else {
        const w = HIT_WIDTH[spr.type];
        collided = !!w && Math.abs(playerX - spr.offset) < w + CAR_HALF_W;
      }
      if (!collided) continue;

      if (car.ram) {
        // ТАРАН (спецспособность ЗИСа): объект снесён и исчезает,
        // летят щепки, а мы едем дальше, даже не притормозив!
        here.sprites.splice(i, 1);
        makeSparks(["#ffd23f", "#8b5a2b", "#2f9e41", "#ff8c1a"]);
        continue;
      }
      crash();
      break;
    }
    }   // конец прохода по сегментам, пройденным за кадр
  }

  // ---------- Трафик на шоссе: просто едет рядом ----------
  // Решение Саши: в городе СТОЛКНОВЕНИЙ НЕТ ВООБЩЕ — езда спокойная,
  // сквозь трафик можно проезжать. Аварии остаются только в заездах!
  if (raceKind === "highway" && traffic.length)
    updateTraffic(dt);

  // ---------- Животные: бегают, стоят и попадают под ЗЫС ----------
  if (animals.length) {
    updateAnimals(dt);
    if (speed > KMH * 5 && !crashed) {
      for (const a of animals) {
        const relZ = ((a.z % trackLength) - position + trackLength) % trackLength;
        // Окно 240 (было 200): гиперкары проезжают 200+ единиц за кадр
        const near = relZ < 240 || relZ > trackLength - 240;
        if (near && Math.abs(a.x - playerX) < 0.45) {
          if (car.ram) {
            // ЗЫС! Животное в шоке отпрыгивает на обочину (не пострадало!)
            a.x = a.x >= playerX ? 2.4 : -2.4;
            a.crossing = false;
            a.pauseUntil = performance.now() + 4000;
            makeSparks(["#f2ede4", "#8b5a2b", "#ffd23f"]);
          } else {
            crash();
            break;
          }
        }
      }
    }
  }

  // ---------- Гонка: соперники, столкновения, финиш ----------
  if (raceMode) {
    updateOpponents(dt);

    const playerTotal = (playerLap - 1) * trackLength + position;

    // Столкновение с соперником: ТОЛЬКО если он ВПЕРЕДИ (его видно
    // и можно объехать!). Удар сзади не ломает игрока — фикс бага
    // Саши «авария на ровном месте»: НПС подкрадывался сзади невидимо
    for (const o of opponents) {
      if (o.finished) continue;   // припаркованный за финишем — не помеха
      const relZ = ((o.z % trackLength) - position + trackLength) % trackLength;
      const near = relZ < 240;
      if (near && Math.abs(o.x - playerX) < 0.33 && !crashed) {
        if (car.ram) {
          // ЗИС расшвыривает соперников! Даже их щиты не спасают —
          // соперник теряет скорость и отлетает в сторону
          if (o.speed > KMH * 20) {
            o.speed *= 0.2;
            o.x = clamp(o.x + (o.x >= playerX ? 0.5 : -0.5), -1.6, 1.6);
            makeSparks();
          }
        } else if (shieldActive() && !o.car.ram) {
          // Щит! Первые 5 секунд контакт не страшен…
          // …но если соперник — ЗИС, щит НЕ спасает (см. else ниже)
        } else {
          crash();
        }
      }
    }

    // ФИНИШ: проехали все круги (в драге круг один)!
    if (!crashed && playerTotal >= raceLaps() * trackLength) {
      raceOver = true;
      finalPlace = 1 + opponents.filter((o) => o.z >= raceLaps() * trackLength).length;
      const medal = ["🥇", "🥈", "🥉", "🏁"][finalPlace - 1];
      // Призовые монеты — по месту! В драге свои ставки
      const reward = (raceKind === "drag" ? [400, 50] : PLACE_REWARD)[finalPlace - 1];
      money += reward;
      saveMoney();
      updateMoneyUI();
      document.getElementById("finish-text").textContent =
        `${medal} Место: ${finalPlace} из ${opponents.length + 1}!   Приз: +${reward} 🪙 (всего: ${adminCode ? "АДМИН" : money})`;
      show("finish", true);
    }
  }
}

// =====================================================================
//  ПРОЕКЦИЯ: превращаем 3D-точку в точку на экране
// =====================================================================

function project(p, cameraX, cameraY, cameraZ) {
  // Шаг 1: где точка ОТНОСИТЕЛЬНО камеры
  p.camera.x = (p.world.x || 0) - cameraX;
  p.camera.y = (p.world.y || 0) - cameraY;
  p.camera.z = (p.world.z || 0) - cameraZ;
  // Шаг 2: чем дальше точка (больше z), тем меньше масштаб
  p.screen.scale = CAM_DEPTH / p.camera.z;
  // Шаг 3: координаты на экране
  p.screen.x = Math.round(W / 2 + p.screen.scale * p.camera.x * W / 2);
  p.screen.y = Math.round(H / 2 - p.screen.scale * p.camera.y * H / 2);
  p.screen.w = Math.round(p.screen.scale * ROAD_WIDTH * W / 2);
}

// =====================================================================
//  РИСОВАНИЕ
// =====================================================================

function polygon(x1, y1, x2, y2, x3, y3, x4, y4, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

// Один кусочек дороги = полоса травы + бордюры + асфальт + разметка
function renderSegment(seg) {
  const p1 = seg.p1.screen, p2 = seg.p2.screen;
  const c = seg.color;

  const r1 = p1.w / Math.max(6, 2 * LANES);  // ширина бордюра вблизи
  const r2 = p2.w / Math.max(6, 2 * LANES);  // и вдали

  // Трава — во всю ширину экрана
  ctx.fillStyle = c.grass;
  ctx.fillRect(0, p2.y, W, p1.y - p2.y);

  // Бордюры слева и справа
  polygon(p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - r2, p2.y, c.rumble);
  polygon(p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + r2, p2.y, c.rumble);

  // Асфальт
  polygon(p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, c.road);

  // Прерывистая разметка (только на "светлых" полосах — так она мигает)
  if (c.lane) {
    const l1 = p1.w / 32, l2 = p2.w / 32;
    const lw1 = p1.w * 2 / LANES, lw2 = p2.w * 2 / LANES;
    let lx1 = p1.x - p1.w + lw1, lx2 = p2.x - p2.w + lw2;
    for (let lane = 1; lane < LANES; lane++) {
      polygon(lx1 - l1 / 2, p1.y, lx1 + l1 / 2, p1.y, lx2 + l2 / 2, p2.y, lx2 - l2 / 2, p2.y, c.lane);
      lx1 += lw1; lx2 += lw2;
    }
  }
}

// ---------- Небо, солнце, горы ----------
function renderBackground() {
  // Небо — градиент от синего к светлому у горизонта
  const sky = ctx.createLinearGradient(0, 0, 0, H / 2);
  sky.addColorStop(0, COLORS.SKY_TOP);
  sky.addColorStop(1, COLORS.SKY_BOT);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H / 2);

  // Нижняя половина — цвет дымки. Раньше между небом и самым дальним
  // сегментом дороги оставалась незакрашенная полоска (сквозь неё
  // просвечивал тёмный фон страницы — та самая чёрная линия!).
  // Теперь под дорогой всегда лежит светлая дымка, и стык невидим.
  ctx.fillStyle = `rgb(${PAL.FOG})`;
  ctx.fillRect(0, H / 2, W, H / 2);

  // Солнце
  ctx.fillStyle = "#ffe45e";
  ctx.beginPath();
  ctx.arc(W - 150, 84, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 228, 94, 0.35)";
  ctx.beginPath();
  ctx.arc(W - 150, 84, 58, 0, Math.PI * 2);
  ctx.fill();

  // Облака
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  drawCloud(140, 80, 1.0);
  drawCloud(430, 130, 0.7);
  drawCloud(720, 60, 0.85);

  // Далёкие горы (цвет зависит от карты: горы, дюны или скалы!)
  ctx.fillStyle = PAL.hillFar;
  drawHill(100, H / 2, 260, 90);
  drawHill(500, H / 2, 320, 70);
  drawHill(840, H / 2, 280, 100);
  // Холмы поближе
  ctx.fillStyle = PAL.hillNear;
  drawHill(260, H / 2, 300, 48);
  drawHill(700, H / 2, 360, 55);
}

function drawCloud(x, y, s) {
  ctx.beginPath();
  ctx.ellipse(x, y, 46 * s, 16 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 30 * s, y - 10 * s, 30 * s, 14 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 28 * s, y - 6 * s, 26 * s, 12 * s, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawHill(cx, baseY, w, h) {
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, baseY);
  ctx.quadraticCurveTo(cx, baseY - h * 2, cx + w / 2, baseY);
  ctx.closePath();
  ctx.fill();
}

// ---------- Дорога ----------
function renderRoad() {
  const baseSeg = findSegment(position);
  const basePercent = (position % SEG_LEN) / SEG_LEN;

  // Высота дороги ПОД МАШИНОЙ: камера едет по холмам вместе с нами.
  // Берём высоту между началом и концом сегмента — плавно, без ступенек
  const playerY = baseSeg.p1.world.y
                + (baseSeg.p2.world.y - baseSeg.p1.world.y) * basePercent;

  // x и dx — хитрость поворотов: каждый следующий сегмент сдвигается
  // вбок чуть сильнее предыдущего. Так прямые трапеции складываются в дугу!
  let x = 0;
  let dx = -(baseSeg.curve * basePercent);
  let maxY = H; // рисуем только то, что выше уже нарисованного (без наложений)

  for (let n = 0; n < DRAW_DIST; n++) {
    const seg = segments[(baseSeg.index + n) % segments.length];
    // Если сегмент "за кольцом" (мы у финиша, а он уже у старта) —
    // делаем поправку, чтобы он рисовался ВПЕРЕДИ, а не позади
    const loopFix = seg.index < baseSeg.index ? trackLength : 0;

    project(seg.p1, playerX * ROAD_WIDTH - x,      CAM_HEIGHT + playerY, position - loopFix);
    project(seg.p2, playerX * ROAD_WIDTH - x - dx, CAM_HEIGHT + playerY, position - loopFix);

    x += dx;
    dx += seg.curve;

    // Запоминаем "линию гребня": всё, что у этого сегмента ниже неё
    // (в том числе его деревья), прячется за холмом впереди
    seg.clip = maxY;

    if (seg.p1.camera.z <= CAM_DEPTH          // сегмент за спиной камеры
     || seg.p2.screen.y >= seg.p1.screen.y    // скрыт за гребнем холма
     || seg.p2.screen.y >= maxY) continue;    // закрыт более близким

    renderSegment(seg);

    // Туман: дальние сегменты слегка растворяются в дымке
    const fog = Math.exp(-((n / DRAW_DIST) ** 2) * FOG_DENSITY);
    if (fog < 1) {
      ctx.fillStyle = `rgba(${PAL.FOG}, ${1 - fog})`;
      ctx.fillRect(0, seg.p2.screen.y, W, seg.p1.screen.y - seg.p2.screen.y);
    }

    maxY = seg.p2.screen.y;
  }

  renderSprites(baseSeg);
}

// ---------- Деревья, знаки, арка и СОПЕРНИКИ ----------
// Рисуем от ДАЛЬНИХ к БЛИЖНИМ, чтобы близкие заслоняли далёкие
function renderSprites(baseSeg) {
  // Раскладываем соперников И трафик по сегментам, где они сейчас едут
  const oppByN = {};
  for (const o of opponents.concat(traffic)) {
    const relZ = ((o.z % trackLength) - position + trackLength) % trackLength;
    const n = Math.floor(relZ / SEG_LEN);
    if (n > 0 && n < DRAW_DIST) (oppByN[n] = oppByN[n] || []).push(o);
  }

  // ПРИЗРАК лучшего круга: где он был на этой секунде рекордного круга?
  let ghostDraw = null;
  if (taMode && ghost && countdown <= 0 && lapTime <= ghost.time) {
    const s = ghost.samples;
    let i = ghost.idx || 0;
    if (i >= s.length || s[i][0] > lapTime) i = 0;   // новый круг — с начала
    while (i < s.length - 1 && s[i + 1][0] <= lapTime) i++;
    ghost.idx = i;
    const a = s[i];
    const b = s[Math.min(i + 1, s.length - 1)];
    const f = b[0] > a[0] ? (lapTime - a[0]) / (b[0] - a[0]) : 0;
    const gpos = a[1] + (b[1] - a[1]) * f;
    const gx = a[2] + (b[2] - a[2]) * f;
    const relZ = ((gpos % trackLength) - position + trackLength) % trackLength;
    const n = Math.floor(relZ / SEG_LEN);
    if (n > 0 && n < DRAW_DIST) ghostDraw = { n, relZ, x: gx };
  }

  // Животные — тоже по сегментам
  const aniByN = {};
  for (const a of animals) {
    const relZ = ((a.z % trackLength) - position + trackLength) % trackLength;
    const n = Math.floor(relZ / SEG_LEN);
    if (n > 0 && n < DRAW_DIST) (aniByN[n] = aniByN[n] || []).push(a);
  }

  for (let n = DRAW_DIST - 1; n > 0; n--) {
    const seg = segments[(baseSeg.index + n) % segments.length];
    if (seg.p1.camera.z <= CAM_DEPTH) continue;
    for (const spr of seg.sprites) {
      const scale = seg.p1.screen.scale;
      const sx = seg.p1.screen.x + scale * spr.offset * ROAD_WIDTH * W / 2;
      const sy = seg.p1.screen.y;
      drawSprite(spr, sx, sy, scale, seg.clip);
    }
    if (aniByN[n]) for (const a of aniByN[n]) drawAnimal(a, seg);
    if (oppByN[n]) for (const o of oppByN[n]) drawOpponent(o, seg);
    if (ghostDraw && ghostDraw.n === n) drawGhostCar(seg, ghostDraw);
    if (mpRemote) {
      const relZ = ((mpRemote.z % trackLength) - position + trackLength) % trackLength;
      if (Math.floor(relZ / SEG_LEN) === n) drawFriend(seg, relZ);
    }
  }
}

// Машина ДРУГА в мультиплеере — с табличкой над крышей!
function drawFriend(seg, relZ) {
  const f = (relZ % SEG_LEN) / SEG_LEN;
  const scale = seg.p1.screen.scale + (seg.p2.screen.scale - seg.p1.screen.scale) * f;
  const cx    = seg.p1.screen.x + (seg.p2.screen.x - seg.p1.screen.x) * f;
  const sy    = seg.p1.screen.y + (seg.p2.screen.y - seg.p1.screen.y) * f;
  const sx = cx + scale * mpRemote.x * ROAD_WIDTH * W / 2;
  const w = scale * ROAD_WIDTH * (W / 2) * 0.23;
  const h = w * (150 / 240);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, seg.clip);
  ctx.clip();
  ctx.drawImage(mpRemote.canvas, sx - w / 2, sy - h * (140 / 150), w, h);
  if (w > 24) {
    ctx.fillStyle = "#57d977";
    ctx.font = `bold ${Math.max(9, w * 0.1)}px Verdana`;
    ctx.textAlign = "center";
    ctx.fillText("ДРУГ", sx, sy - h - w * 0.04);
  }
  ctx.restore();
}

// Корова или страус: рисуем сбоку (они же ПЕРЕБЕГАЮТ дорогу!),
// мордой в сторону движения
function drawAnimal(a, seg) {
  const scale = seg.p1.screen.scale;
  const sx = seg.p1.screen.x + scale * a.x * ROAD_WIDTH * W / 2;
  const sy = seg.p1.screen.y;
  const s = scale * ROAD_WIDTH * (W / 2) * (a.type === "cow" ? 0.0016 : 0.0013);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, seg.clip);
  ctx.clip();
  ctx.translate(sx, sy);
  ctx.scale(s * (a.dir >= 0 ? 1 : -1), s);
  if (a.type === "cow") {
    // Ноги, тело в пятнах, голова с ушами
    ctx.fillStyle = "#3a3028";
    for (const lx of [-32, -14, 10, 28]) ctx.fillRect(lx, -26, 8, 26);
    ctx.fillStyle = "#f2ede4";
    ctx.beginPath(); ctx.ellipse(0, -44, 46, 24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2a2a2a";
    ctx.beginPath(); ctx.ellipse(-16, -50, 13, 9, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(14, -38, 10, 8, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f2ede4";
    ctx.beginPath(); ctx.ellipse(46, -58, 15, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e8a8b8";                       // розовый нос
    ctx.fillRect(52, -54, 10, 7);
    ctx.fillStyle = "#2a2a2a";                       // глаз и ухо
    ctx.fillRect(46, -62, 4, 4);
    ctx.fillRect(38, -68, 8, 5);
  } else {
    // Страус: длинные ноги, пушистое тело, шея-перископ
    ctx.strokeStyle = "#c9a06a";
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-8, -34); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(10, -34); ctx.stroke();
    ctx.fillStyle = "#5a5f66";
    ctx.beginPath(); ctx.ellipse(0, -46, 26, 18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#c9a06a";
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(18, -54); ctx.quadraticCurveTo(30, -80, 28, -96); ctx.stroke();
    ctx.fillStyle = "#8a8f96";                       // голова
    ctx.beginPath(); ctx.ellipse(28, -100, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e8b40c";                       // клюв
    ctx.fillRect(35, -102, 12, 5);
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(28, -103, 3, 3);
  }
  ctx.restore();
}

// Призрак: полупрозрачная машина рекордного круга. Сквозь него можно
// проезжать — он же призрак!
function drawGhostCar(seg, gd) {
  const f = (gd.relZ % SEG_LEN) / SEG_LEN;
  const scale = seg.p1.screen.scale + (seg.p2.screen.scale - seg.p1.screen.scale) * f;
  const cx    = seg.p1.screen.x + (seg.p2.screen.x - seg.p1.screen.x) * f;
  const sy    = seg.p1.screen.y + (seg.p2.screen.y - seg.p1.screen.y) * f;
  const sx = cx + scale * gd.x * ROAD_WIDTH * W / 2;
  const w = scale * ROAD_WIDTH * (W / 2) * 0.23;
  const h = w * (150 / 240);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, seg.clip);
  ctx.clip();
  ctx.globalAlpha = 0.45;
  ctx.drawImage(ghost.canvas, sx - w / 2, sy - h * (140 / 150), w, h);
  ctx.restore();
}

// Соперник: берём его заранее нарисованную картинку и уменьшаем
// по дальности. Позицию считаем ПЛАВНО между началом и концом
// сегмента (без этого близкие машины прыгали и ломались — фикс
// по багрепорту Саши). Гребень холма прячет их так же, как деревья!
function drawOpponent(o, seg) {
  const relZ = ((o.z % trackLength) - position + trackLength) % trackLength;
  const f = (relZ % SEG_LEN) / SEG_LEN;   // где внутри сегмента: 0…1
  const scale = seg.p1.screen.scale + (seg.p2.screen.scale - seg.p1.screen.scale) * f;
  const cx    = seg.p1.screen.x + (seg.p2.screen.x - seg.p1.screen.x) * f;
  const sy    = seg.p1.screen.y + (seg.p2.screen.y - seg.p1.screen.y) * f;
  const sx = cx + scale * o.x * ROAD_WIDTH * W / 2;
  const w = scale * ROAD_WIDTH * (W / 2) * 0.23;
  const h = w * (150 / 240);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, seg.clip);
  ctx.clip();
  ctx.drawImage(o.canvas, sx - w / 2, sy - h * (140 / 150), w, h);
  // Пузырь щита у соперников (кроме ЗИСа — броне щит ни к чему)
  if (shieldActive() && !o.car.ram) {
    ctx.strokeStyle = "rgba(90, 190, 255, 0.8)";
    ctx.fillStyle = "rgba(90, 190, 255, 0.10)";
    ctx.lineWidth = Math.max(1, w * 0.015);
    ctx.beginPath();
    ctx.ellipse(sx, sy - h * 0.42, w * 0.62, h * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawSprite(spr, x, y, scale, clipY) {
  // Переводим "мировые" размеры в пиксели: чем дальше — тем мельче
  const px = (units) => scale * units * W / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, clipY);  // всё, что ниже гребня холма, — отрезается
  ctx.clip();

  if (spr.type === "pine") {
    // Ёлка: ствол и три треугольника
    const h = px(1700), w = px(700);
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(x - px(60), y - px(260), px(120), px(260));
    ctx.fillStyle = spr.v < 0.5 ? "#1c7a35" : "#20894a";
    for (let i = 0; i < 3; i++) {
      const ty = y - px(220) - (h - px(220)) * (i / 3);
      const tw = w * (1 - i * 0.26);
      ctx.beginPath();
      ctx.moveTo(x - tw / 2, ty);
      ctx.lineTo(x + tw / 2, ty);
      ctx.lineTo(x, ty - (h - px(200)) * 0.45);
      ctx.closePath();
      ctx.fill();
    }
  } else if (spr.type === "tree") {
    // Лиственное: ствол и пышная крона с бликом
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(x - px(70), y - px(520), px(140), px(520));
    ctx.fillStyle = spr.v < 0.5 ? "#2f9e41" : "#43a832";
    ctx.beginPath();
    ctx.arc(x, y - px(920), px(520), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.arc(x - px(170), y - px(1060), px(200), 0, Math.PI * 2);
    ctx.fill();
  } else if (spr.type === "sign") {
    // Жёлтый щит со стрелками в сторону поворота
    const bw = px(560), bh = px(380), poleH = px(430);
    ctx.fillStyle = "#777";
    ctx.fillRect(x - px(35), y - poleH, px(70), poleH);
    ctx.fillStyle = "#ffcf1f";
    ctx.fillRect(x - bw / 2, y - poleH - bh, bw, bh);
    ctx.strokeStyle = "#141414";
    ctx.lineWidth = Math.max(1, px(60));
    const dir = spr.dir || 1;
    const cw = bw * 0.2, ch = bh * 0.5, cy = y - poleH - bh / 2;
    for (let k = -1; k <= 0; k++) {
      const cx = x + dir * (k * cw * 1.6 + cw * 0.3);
      ctx.beginPath();
      ctx.moveTo(cx - dir * cw / 2, cy - ch / 2);
      ctx.lineTo(cx + dir * cw / 2, cy);
      ctx.lineTo(cx - dir * cw / 2, cy + ch / 2);
      ctx.stroke();
    }
  } else if (spr.type === "cone") {
    // Полосатая бочка — препятствие драг-полосы!
    const w = px(360), h = px(430);
    ctx.fillStyle = "#ff7518";
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = "#f2f2f2";
    ctx.fillRect(x - w / 2, y - h * 0.72, w, h * 0.16);
    ctx.fillRect(x - w / 2, y - h * 0.40, w, h * 0.16);
    ctx.fillStyle = "#c25510";
    ctx.beginPath();
    ctx.ellipse(x, y - h, w / 2, w / 6, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (spr.type === "cactus") {
    // Кактус: столб с двумя руками (пустыня!)
    ctx.fillStyle = spr.v < 0.5 ? "#2e8b57" : "#3aa06a";
    ctx.fillRect(x - px(80), y - px(1100), px(160), px(1100));
    ctx.fillRect(x - px(330), y - px(760), px(280), px(120));
    ctx.fillRect(x - px(330), y - px(980), px(120), px(320));
    ctx.fillRect(x + px(60), y - px(620), px(270), px(120));
    ctx.fillRect(x + px(210), y - px(860), px(120), px(360));
  } else if (spr.type === "rock") {
    // Валун на офроуде — о него разбиваются даже внедорожники!
    ctx.fillStyle = spr.v < 0.5 ? "#7d8087" : "#8d9096";
    ctx.beginPath();
    ctx.moveTo(x - px(420), y);
    ctx.lineTo(x - px(260), y - px(520));
    ctx.lineTo(x + px(60), y - px(640));
    ctx.lineTo(x + px(400), y - px(300));
    ctx.lineTo(x + px(430), y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.moveTo(x - px(260), y - px(520));
    ctx.lineTo(x + px(60), y - px(640));
    ctx.lineTo(x + px(120), y - px(430));
    ctx.closePath();
    ctx.fill();
  } else if (spr.type === "gas") {
    // Заправка у шоссе: навес, колонка и большая буква ⛽
    const w = px(900), h = px(1100);
    ctx.fillStyle = "#c9cdd4";                       // стойки навеса
    ctx.fillRect(x - w / 2, y - h, px(60), h);
    ctx.fillRect(x + w / 2 - px(60), y - h, px(60), h);
    ctx.fillStyle = "#d5121e";                       // крыша-навес
    ctx.fillRect(x - w / 2 - px(80), y - h, w + px(160), px(180));
    ctx.fillStyle = "#f2f2f2";
    ctx.fillRect(x - w / 2 - px(80), y - h + px(180), w + px(160), px(60));
    ctx.fillStyle = "#e03a30";                       // колонка
    ctx.fillRect(x - px(90), y - px(420), px(180), px(420));
    ctx.fillStyle = "#f2f2f2";
    ctx.fillRect(x - px(60), y - px(380), px(120), px(140));
    ctx.font = `bold ${px(260)}px Verdana`;
    ctx.textAlign = "center";
    ctx.fillText("⛽", x, y - h - px(60));
  } else if (spr.type === "farch") {
    // ФИНИШНАЯ арка: шахматный баннер над полосой!
    const half = px(ROAD_WIDTH * 1.12);
    const pillarW = px(170), archH = px(2400), bannerH = px(540);
    ctx.fillStyle = "#c9cdd4";
    ctx.fillRect(x - half - pillarW, y - archH, pillarW, archH);
    ctx.fillRect(x + half, y - archH, pillarW, archH);
    const totalW = half * 2 + pillarW * 2;
    const cell = bannerH / 4;
    for (let ry = 0; ry < 4; ry++)
      for (let cx = 0; cx * cell < totalW; cx++) {
        ctx.fillStyle = (ry + cx) % 2 ? "#141414" : "#f2f2f2";
        ctx.fillRect(x - half - pillarW + cx * cell, y - archH + ry * cell,
                     Math.min(cell, totalW - cx * cell) + 0.5, cell + 0.5);
      }
    ctx.font = `bold ${px(300)}px Verdana`;
    ctx.textAlign = "center";
    ctx.strokeStyle = "#f2f2f2";
    ctx.lineWidth = Math.max(1, px(70));
    ctx.strokeText("ФИНИШ", x, y - archH + bannerH * 0.7);
    ctx.fillStyle = "#d5121e";
    ctx.fillText("ФИНИШ", x, y - archH + bannerH * 0.7);
  } else if (spr.type === "arch") {
    // Стартовая арка над всей дорогой!
    const half = px(ROAD_WIDTH * 1.12);
    const pillarW = px(170), archH = px(2400), bannerH = px(540);
    ctx.fillStyle = "#c9cdd4";
    ctx.fillRect(x - half - pillarW, y - archH, pillarW, archH);
    ctx.fillRect(x + half, y - archH, pillarW, archH);
    ctx.fillStyle = "#d5121e";
    ctx.fillRect(x - half - pillarW, y - archH, half * 2 + pillarW * 2, bannerH);
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${px(330)}px Verdana`;
    ctx.textAlign = "center";
    ctx.fillText("I NEED SPEED 1", x, y - archH + bannerH * 0.74);
  }

  ctx.restore();
}

// =====================================================================
//  РИСОВАНИЕ МАШИН (вид сзади)
//  Каждая машина — своя функция. Все принимают g (контекст рисования),
//  чтобы одну и ту же машину можно было рисовать И в игре, И в гараже!
// =====================================================================

function roundRect(g, x, y, w, h, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fill();
}

function circle(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

// --- Chevrolet Aveo 2013: чёрный седан по спецификации Саши ---
// (клиренс повыше, колёса внутри кузова, круглые фонари "двоеточием")
function drawAveo(g) {
  // Тень
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath(); g.ellipse(0, 8, 96, 12, 0, 0, Math.PI * 2); g.fill();
  // Колёса внутри кузова, виден клиренс
  roundRect(g, -80, -34, 28, 40, 7, "#151515");
  roundRect(g,  52, -34, 28, 40, 7, "#151515");
  g.fillStyle = "#3a3a3a";
  g.fillRect(-78, -2, 24, 3);
  g.fillRect( 54, -2, 24, 3);
  // Кузов
  roundRect(g, -84, -56, 168, 44, 10, "#17191c");
  g.fillStyle = "rgba(255,255,255,0.10)";
  g.fillRect(-76, -55, 152, 3);
  // Нижняя рама стекла на багажнике → стекло → крыша (сборка седана!)
  roundRect(g, -58, -62, 116, 8, 3, "#0d0f11");
  g.fillStyle = "#26333f";
  g.beginPath();
  g.moveTo(-54, -60); g.lineTo(54, -60); g.lineTo(44, -90); g.lineTo(-44, -90);
  g.closePath(); g.fill();
  g.fillStyle = "rgba(255,255,255,0.15)";
  g.beginPath();
  g.moveTo(-42, -64); g.lineTo(-10, -64); g.lineTo(-20, -86); g.lineTo(-38, -86);
  g.closePath(); g.fill();
  roundRect(g, -50, -98, 100, 12, 6, "#101214");
  // Круглые фонари "двоеточием"
  for (const side of [-1, 1]) {
    const x = side * 66;
    circle(g, x, -46, 7.5, "#3a0505");
    circle(g, x, -46, 6,   "#ff2a1e");
    circle(g, x, -30, 7.5, "#3a0505");
    circle(g, x, -30, 6,   "#ff2a1e");
    circle(g, x - 2, -48, 2, "#ffd9d0");
    circle(g, x - 2, -32, 2, "#ffd9d0");
  }
  roundRect(g, -9, -44, 18, 7, 2, "#e8b40c");
  // Бампер и номер
  roundRect(g, -84, -22, 168, 10, 5, "#0c0e10");
  roundRect(g, -24, -21, 48, 10, 2, "#f5f5f5");
  g.fillStyle = "#222";
  g.font = "bold 8px Verdana";
  g.textAlign = "center";
  g.fillText("САША", 0, -13);
}

// --- Kia Picanto 2018: жёлтый городской малыш (коробка А) ---
// Дизайн v2 — по фотографии-референсу от Саши! Лаймово-жёлтый кузов,
// огромное тёмное стекло, фонари-«бумеранги» по бокам, значок KIA,
// надпись picanto, жёлтый номер, серебристая накладка и две трубы.
function drawPicanto(g) {
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath(); g.ellipse(0, 8, 80, 11, 0, 0, Math.PI * 2); g.fill();
  // Колёсики — маленькие, как у городской малолитражки
  roundRect(g, -68, -28, 24, 34, 6, "#151515");
  roundRect(g,  44, -28, 24, 34, 6, "#151515");
  // Кузов — лаймово-жёлтый, как на фото
  roundRect(g, -70, -52, 140, 46, 12, "#ded23a");
  // Дверь багажника (высокая, почти вся из стекла)
  roundRect(g, -60, -100, 120, 52, 14, "#ded23a");
  g.fillStyle = "rgba(255,255,255,0.16)";
  g.fillRect(-52, -51, 104, 3);
  // Крыша и плавник-антенна
  roundRect(g, -54, -108, 108, 10, 5, "#cfc233");
  g.fillStyle = "#c5b92e";
  g.beginPath();
  g.moveTo(10, -108); g.lineTo(16, -114); g.lineTo(20, -108);
  g.closePath(); g.fill();
  // Огромное тёмное стекло с закруглёнными углами
  roundRect(g, -50, -96, 100, 40, 10, "#1d242e");
  g.fillStyle = "rgba(255,255,255,0.13)";
  g.fillRect(-42, -90, 32, 30);
  // Стоп-сигнал — красная полоска под крышей (видна на фото!)
  roundRect(g, -16, -99, 32, 4, 2, "#b81616");
  // Фонари v3 (правка Саши: не «сосиски»!): почти квадратные блоки
  // ПОД задним стеклом, на плечах кузова — как у настоящей.
  // Секции сверху вниз: стоп-сигнал, поворотник, задний ход.
  for (const side of [-1, 1]) {
    const x = side * 57;
    roundRect(g, x - 9, -56, 18, 27, 5, "#4d0a0a");   // тёмная окантовка
    roundRect(g, x - 8, -55, 16, 25, 4, "#c81a1a");   // корпус фонаря
    roundRect(g, x - 6, -53, 12, 9, 2, "#ff5a45");    // стоп-секция
    roundRect(g, x - 6, -43, 12, 6, 2, "#ffb35c");    // янтарный поворотник
    roundRect(g, x - 6, -36, 12, 4, 1, "#e8e6df");    // белая секция
  }
  // Надпись picanto — маленькая и СЕРЕБРЯНАЯ (правка Саши)
  g.fillStyle = "#c9cdd4";
  g.font = "italic 7px Georgia";
  g.textAlign = "center";
  g.fillText("pikanto", -30, -41);
  g.fillStyle = "#15161a";
  g.beginPath(); g.ellipse(0, -44, 11, 6.5, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#c8ccd4";
  g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(0, -44, 11, 6.5, 0, 0, Math.PI * 2); g.stroke();
  // Жёлтый номер (как английский на фото), но наш — САША
  roundRect(g, -24, -34, 48, 12, 2, "#f5c518");
  g.fillStyle = "#111";
  g.font = "bold 8px Verdana";
  g.fillText("САША", 0, -25);
  // Бампер: тёмно-серый низ + серебристая накладка + ДВЕ хром-трубы
  roundRect(g, -70, -20, 140, 12, 5, "#43464c");
  roundRect(g, -34, -16, 68, 8, 4, "#b9bec6");
  for (const side of [-1, 1]) {
    roundRect(g, side * 46 - 10, -15, 20, 8, 3, "#d7dbe0");
    roundRect(g, side * 46 - 7, -13, 14, 4, 2, "#2a2d31");
    roundRect(g, side * 62 - 3, -19, 6, 4, 1, "#c0392b");  // красный катафот
  }
  g.lineCap = "butt";  // вернуть настройку линий, чтобы не влиять на других
}

// --- Ford Focus: синий хэтчбек, быстрый середняк (коробка А) ---
// Шире, ниже, спортивнее: покатая крыша, спойлер и две выхлопные трубы
function drawFocus(g) {
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath(); g.ellipse(0, 8, 100, 12, 0, 0, Math.PI * 2); g.fill();
  // Широкие колёса
  roundRect(g, -88, -30, 30, 36, 7, "#131313");
  roundRect(g,  58, -30, 30, 36, 7, "#131313");
  // Кузов — синий, посажен ниже (спорт!)
  roundRect(g, -92, -50, 184, 42, 11, "#1f5fd6");
  g.fillStyle = "rgba(255,255,255,0.14)";
  g.fillRect(-84, -49, 168, 3);
  // Дверь багажника со стеклом-трапецией
  g.fillStyle = "#1a4fb2";
  g.beginPath();
  g.moveTo(-62, -50); g.lineTo(62, -50); g.lineTo(50, -92); g.lineTo(-50, -92);
  g.closePath(); g.fill();
  g.fillStyle = "#22303d";
  g.beginPath();
  g.moveTo(-52, -54); g.lineTo(52, -54); g.lineTo(43, -88); g.lineTo(-43, -88);
  g.closePath(); g.fill();
  g.fillStyle = "rgba(255,255,255,0.15)";
  g.fillRect(-40, -84, 34, 26);
  // Покатая крыша со спойлером
  roundRect(g, -54, -98, 108, 10, 5, "#173f8c");
  roundRect(g, -58, -102, 116, 6, 3, "#122f68");   // спойлер!
  // Фонари — широкие "запятые" от углов к центру
  for (const side of [-1, 1]) {
    const x = side * 62;
    roundRect(g, x - 18, -46, 36, 13, 6, "#7a1010");
    roundRect(g, x - 15, -44, 30, 9, 4, "#ff3b2a");
    roundRect(g, x - 15, -44, 30, 4, 2, "#ffd0c0");
  }
  // Овальный значок
  g.fillStyle = "#dfe6f2";
  g.beginPath(); g.ellipse(0, -40, 11, 6, 0, 0, Math.PI * 2); g.fill();
  // Бампер, диффузор и ДВЕ выхлопные трубы
  roundRect(g, -92, -20, 184, 11, 5, "#14181f");
  circle(g, -70, -6, 5, "#0a0a0a");
  circle(g,  70, -6, 5, "#0a0a0a");
  circle(g, -70, -6, 3, "#333");
  circle(g,  70, -6, 3, "#333");
  roundRect(g, -24, -19, 48, 10, 2, "#f5f5f5");
  g.fillStyle = "#222";
  g.font = "bold 8px Verdana";
  g.textAlign = "center";
  g.fillText("САША", 0, -11);
}

// --- DMC DeLorean DMC-12: легенда из нержавейки (по фото Саши!) ---
// Жалюзи на заднем стекле, фонари-сетки из квадратиков, надпись
// DeLorean на нижней панели, чёрный бампер и две выхлопные трубы.
function drawDelorean(g) {
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath(); g.ellipse(0, 8, 102, 12, 0, 0, Math.PI * 2); g.fill();
  // Широкие колёса — машина низкая и приземистая
  roundRect(g, -90, -26, 30, 32, 6, "#131313");
  roundRect(g,  60, -26, 30, 32, 6, "#131313");
  // Кузов из НЕРЖАВЕЙКИ: серый металл, углы почти острые (клин!)
  roundRect(g, -94, -52, 188, 46, 5, "#8b9299");
  g.fillStyle = "rgba(255,255,255,0.18)";      // холодный блик металла
  g.fillRect(-86, -51, 172, 3);
  // ЖАЛЮЗИ вместо заднего стекла — фишка Делориана!
  // (стекло НИЖЕ, чем у других машин — правка Саши: клин же!)
  g.fillStyle = "#1c1f23";
  g.beginPath();
  g.moveTo(-72, -52); g.lineTo(72, -52); g.lineTo(50, -92); g.lineTo(-50, -92);
  g.closePath(); g.fill();
  // Сами планки жалюзи (сужаются кверху вместе с корпусом)
  for (let i = 0; i < 5; i++) {
    const y = -59 - i * 6.4;
    const half = 66 - i * 3.4;
    g.fillStyle = "#3d434a";
    g.fillRect(-half, y, half * 2, 3);
  }
  // Крыша — низкая и плоская
  roundRect(g, -48, -98, 96, 8, 3, "#6d747c");
  // Фонари-СЕТКИ: панели с квадратными ячейками (как на фото).
  // Слева: белые и красные. Справа: красные и ЯНТАРНАЯ колонка снаружи.
  const cellColorsL = ["#e6e6e6", "#d92020", "#b81818", "#e6e6e6"];
  const cellColorsR = ["#e6e6e6", "#b81818", "#d92020", "#ffa21f"];
  for (const side of [-1, 1]) {
    const x0 = side === -1 ? -88 : 30;
    roundRect(g, x0, -48, 58, 24, 3, "#101114");   // тёмная панель
    const cols = side === -1 ? cellColorsL : cellColorsR;
    for (let cIdx = 0; cIdx < 4; cIdx++)
      for (let row = 0; row < 2; row++)
        roundRect(g, x0 + 3 + cIdx * 13.5, -45 + row * 9.5, 11, 7.5, 1.5,
                  cols[side === -1 ? cIdx : cIdx]);
  }
  // Номер по центру между фонарями (на фото — Калифорния, у нас — САША)
  roundRect(g, -26, -47, 52, 22, 2, "#0d0e10");
  roundRect(g, -22, -44, 44, 15, 2, "#f2f2f2");
  g.fillStyle = "#1a1a1a";
  g.font = "bold 9px Verdana";
  g.textAlign = "center";
  g.fillText("САША", 0, -33);
  // Надпись DeLorean — выдавлена на нижней панели
  g.fillStyle = "#6f767e";
  g.font = "italic bold 11px Georgia";
  g.fillText("TimeLorean", 0, -11);
  // Чёрный нижний бампер и две выхлопные трубы
  roundRect(g, -94, -8, 188, 8, 3, "#1a1c1f");
  circle(g, -34, 2, 4.5, "#26282c");
  circle(g,  34, 2, 4.5, "#26282c");
  circle(g, -34, 2, 2.5, "#000");
  circle(g,  34, 2, 2.5, "#000");
}

// --- Opel Corsa (новейшая): по фото-референсу Саши ---
// Серо-графитовый кузов, чёрное покатое стекло со спойлером, узкие
// тёмные фонари с красной "скобкой" LED, надпись C O R S A вразрядку,
// молния Опеля в круге, красные катафоты и красный противотуманник.
function drawCorsa(g) {
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath(); g.ellipse(0, 8, 84, 11, 0, 0, Math.PI * 2); g.fill();
  // Колёса
  roundRect(g, -72, -28, 26, 34, 6, "#141414");
  roundRect(g,  46, -28, 26, 34, 6, "#141414");
  // Кузов — серый графит, гладкий и строгий
  roundRect(g, -76, -54, 152, 48, 12, "#8f979e");
  g.fillStyle = "rgba(255,255,255,0.15)";
  g.fillRect(-68, -53, 136, 3);
  // Чёрное покатое стекло, сверху козырёк-спойлер (всё чёрное, как на фото)
  roundRect(g, -58, -102, 116, 50, 16, "#15181c");
  roundRect(g, -54, -106, 108, 8, 4, "#1d2126");
  g.fillStyle = "rgba(255,255,255,0.10)";      // блик на стекле
  g.fillRect(-46, -96, 36, 34);
  // Тонкая антенна на крыше
  g.strokeStyle = "#15181c";
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(6, -106); g.lineTo(12, -116); g.stroke();
  // Узкие тёмные фонари с красной LED-скобкой внутри (смотрят наружу)
  for (const side of [-1, 1]) {
    const x = side * 55;
    roundRect(g, x - 15, -60, 30, 13, 5, "#1a1d21");       // тёмный корпус
    // красная "скобка": вертикальная палочка у внешнего края + горизонтальная
    roundRect(g, x + side * 8 - 2, -58, 4, 9, 2, "#e0231c");
    roundRect(g, x - side * 6 - 5, -58, 10, 3.5, 1.5, "#e0231c");
  }
  // Надпись C O R S A — вразрядку, как на фото
  g.fillStyle = "#2a2d31";
  g.font = "bold 8px Verdana";
  g.textAlign = "center";
  g.fillText("C  O  R  Z  A", 0, -38);
  // Молния Опеля в круге — на стекле снизу по центру
  g.strokeStyle = "#c9cdd4";
  g.lineWidth = 1.8;
  g.beginPath(); g.arc(0, -57, 7, 0, Math.PI * 2); g.stroke();
  g.beginPath();
  g.moveTo(-4, -57); g.lineTo(0, -60); g.lineTo(0, -54); g.lineTo(4, -57);
  g.stroke();
  // Номер (низко на бампере, как на фото)
  roundRect(g, -26, -30, 52, 13, 2, "#f5f5f5");
  g.fillStyle = "#1a1a1a";
  g.font = "bold 9px Verdana";
  g.fillText("САША", 0, -20);
  // Красные вертикальные катафоты по углам бампера
  roundRect(g, -73, -36, 5, 15, 2, "#d23b2f");
  roundRect(g,  68, -36, 5, 15, 2, "#d23b2f");
  // Тёмный диффузор и красный противотуманник по центру
  roundRect(g, -76, -13, 152, 8, 4, "#3a3e43");
  roundRect(g, -16, -11, 32, 4, 2, "#c02418");
}

// --- Chevrolet Camaro SS 1970: оранжевый маслкар с белыми полосами ---
function drawCamaro70(g) {
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath(); g.ellipse(0, 8, 104, 12, 0, 0, Math.PI * 2); g.fill();
  roundRect(g, -92, -28, 30, 34, 7, "#131313");
  roundRect(g,  62, -28, 30, 34, 7, "#131313");
  // Широченный оранжевый кузов
  roundRect(g, -96, -52, 192, 46, 9, "#e8641f");
  g.fillStyle = "rgba(255,255,255,0.15)";
  g.fillRect(-88, -51, 176, 3);
  // Покатое стекло фастбэка и крыша
  g.fillStyle = "#20262e";
  g.beginPath();
  g.moveTo(-58, -52); g.lineTo(58, -52); g.lineTo(42, -94); g.lineTo(-42, -94);
  g.closePath(); g.fill();
  roundRect(g, -46, -100, 92, 10, 5, "#c9561a");
  // ДВЕ белые гоночные полосы — через крышу, стекло и багажник
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.fillRect(-17, -100, 11, 70);
  g.fillRect(  6, -100, 11, 70);
  // Чёрная панель с тонкими фонарями
  roundRect(g, -80, -46, 160, 14, 4, "#17181b");
  for (const side of [-1, 1]) {
    roundRect(g, side * 50 - 26, -44, 52, 10, 3, "#d42323");
    g.fillStyle = "#17181b";                     // перегородки секций
    g.fillRect(side * 50 - 9, -44, 3, 10);
    g.fillRect(side * 50 + 8, -44, 3, 10);
  }
  circle(g, 0, -39, 5, "#2a52be");               // синий кружок-значок RS
  // Хромовый бампер, номер, две трубы
  roundRect(g, -96, -24, 192, 9, 4, "#cfd6dd");
  roundRect(g, -24, -22, 48, 11, 2, "#f0f0f0");
  g.fillStyle = "#222";
  g.font = "bold 8px Verdana";
  g.textAlign = "center";
  g.fillText("САША", 0, -13.5);
  circle(g, -42, 2, 4, "#26282c"); circle(g, 42, 2, 4, "#26282c");
}

// --- Chevrolet Camaro SS (новый): белый, злой, четыре трубы ---
function drawCamaroNew(g) {
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath(); g.ellipse(0, 8, 104, 12, 0, 0, Math.PI * 2); g.fill();
  roundRect(g, -94, -28, 32, 34, 7, "#111");
  roundRect(g,  62, -28, 32, 34, 7, "#111");
  // Белый кузов с высокой кормой
  roundRect(g, -96, -54, 192, 48, 10, "#eef0f2");
  g.fillStyle = "rgba(0,0,0,0.06)";
  g.fillRect(-88, -34, 176, 3);
  // Чёрное стекло-клин и крыша
  g.fillStyle = "#101418";
  g.beginPath();
  g.moveTo(-60, -54); g.lineTo(60, -54); g.lineTo(38, -98); g.lineTo(-38, -98);
  g.closePath(); g.fill();
  roundRect(g, -42, -104, 84, 9, 4, "#0c0f12");
  // Чёрный спойлер на кромке багажника
  roundRect(g, -66, -60, 132, 7, 3, "#191b1e");
  // Раздвоенные тонкие фонари (по два с каждой стороны)
  for (const side of [-1, 1]) {
    for (const off of [30, 60]) {
      roundRect(g, side * off + (side < 0 ? -26 : 0), -50, 26, 9, 3, "#1a1c20");
      roundRect(g, side * off + (side < 0 ? -23 : 3), -48, 20, 4, 2, "#e02020");
    }
  }
  roundRect(g, -8, -46, 16, 6, 2, "#d8b23a");    // золотой значок
  // Чёрный диффузор с ЧЕТЫРЬМЯ трубами
  roundRect(g, -96, -22, 192, 14, 5, "#141518");
  for (const x of [-72, -56, 56, 72]) {
    circle(g, x, -14, 4.5, "#c9ced4");
    circle(g, x, -14, 2.8, "#232629");
  }
  roundRect(g, -22, -20, 44, 10, 2, "#f0f0f0");
  g.fillStyle = "#222";
  g.font = "bold 8px Verdana";
  g.textAlign = "center";
  g.fillText("САША", 0, -12);
}

// --- Chevrolet Corvette 1959: вишнёвая классика с хромом ---
function drawVetteC1(g) {
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath(); g.ellipse(0, 8, 100, 12, 0, 0, Math.PI * 2); g.fill();
  roundRect(g, -88, -28, 30, 34, 7, "#141414");
  roundRect(g,  58, -28, 30, 34, 7, "#141414");
  // Плавный вишнёвый кузов с круглыми "плечами"-крыльями
  g.fillStyle = "#7e1428";
  g.beginPath(); g.ellipse(-56, -50, 32, 16, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse( 56, -50, 32, 16, 0, 0, Math.PI * 2); g.fill();
  roundRect(g, -92, -50, 184, 44, 16, "#7e1428");
  g.fillStyle = "rgba(255,255,255,0.20)";        // глянец полированного лака
  g.fillRect(-80, -49, 160, 4);
  // Основание кабины — соединяет стекло с кузовом (раньше тут была
  // ДЫРА, её нашёл Саша, когда подиум стал белым!)
  roundRect(g, -44, -64, 88, 22, 8, "#7e1428");
  // Маленькое округлое стекло и крыша
  roundRect(g, -36, -88, 72, 30, 12, "#232b33");
  roundRect(g, -40, -94, 80, 10, 5, "#5d0f1e");
  // Круглые фонари, утопленные в крылья + белый круглый значок
  for (const side of [-1, 1]) {
    circle(g, side * 58, -42, 8, "#d7dee5");     // хром-кольцо
    circle(g, side * 58, -42, 6, "#c01820");
    circle(g, side * 58 - 2, -44, 2, "#ffd9d0");
  }
  circle(g, 0, -58, 8, "#f2f2f2");
  circle(g, 0, -58, 3, "#c01820");
  // Хромовый бампер и вертикальные клыки у номера
  roundRect(g, -92, -22, 184, 8, 4, "#d7dee5");
  roundRect(g, -34, -27, 8, 15, 3, "#d7dee5");
  roundRect(g,  26, -27, 8, 15, 3, "#d7dee5");
  roundRect(g, -22, -24, 44, 12, 2, "#dfe8f0");
  g.fillStyle = "#22303f";
  g.font = "bold 8px Verdana";
  g.textAlign = "center";
  g.fillText("САША", 0, -14.5);
  circle(g, -76, 0, 3.5, "#26282c"); circle(g, 76, 0, 3.5, "#26282c");
}

// --- Chevrolet Corvette Stingray (C8): суперкар с крылом ---
function drawVetteC8(g) {
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath(); g.ellipse(0, 8, 106, 12, 0, 0, Math.PI * 2); g.fill();
  roundRect(g, -96, -26, 34, 32, 7, "#0e0e0e");
  roundRect(g,  62, -26, 34, 32, 7, "#0e0e0e");
  // Огненно-оранжевый угловатый кузов
  roundRect(g, -96, -56, 192, 50, 6, "#e33a17");
  g.fillStyle = "rgba(255,255,255,0.14)";
  g.fillRect(-86, -55, 172, 3);
  // Чёрное стекло-клин над мотором
  g.fillStyle = "#111417";
  g.beginPath();
  g.moveTo(-52, -56); g.lineTo(52, -56); g.lineTo(30, -98); g.lineTo(-30, -98);
  g.closePath(); g.fill();
  // КРЫЛО на пилонах через всю корму. Пилоны доходят ДО КУЗОВА —
  // раньше крыло «летало» в воздухе (нашёл Саша на белом кубе!)
  roundRect(g, -42, -100, 6, 48, 2, "#101214");
  roundRect(g,  36, -100, 6, 48, 2, "#101214");
  roundRect(g, -78, -106, 156, 7, 3, "#101214");
  // Двойные фонари-«скобки» с каждой стороны
  for (const side of [-1, 1]) {
    for (const off of [36, 62]) {
      const x = side * off;
      roundRect(g, x - 10, -52, 20, 13, 3, "#15171a");
      roundRect(g, x - 8, -50, 16, 9, 3, "#e02020");
      roundRect(g, x - 4, -47, 8, 4, 2, "#15171a");   // вырез — получается «C»
    }
  }
  // Надпись CORVETTE и номер с флажками
  g.fillStyle = "#2a1008";
  g.font = "bold 7px Verdana";
  g.textAlign = "center";
  g.fillText("C O R V E T T E", 0, -53);
  roundRect(g, -20, -46, 40, 13, 2, "#e8e8e8");
  g.fillStyle = "#1a1a1a";
  g.font = "bold 8px Verdana";
  g.fillText("САША", 0, -36);
  // Боковые сетки-воздуховоды
  roundRect(g, -92, -46, 16, 16, 3, "#1a1d20");
  roundRect(g,  76, -46, 16, 16, 3, "#1a1d20");
  // Огромный чёрный диффузор с ДВУМЯ ПАРАМИ квадратных труб
  roundRect(g, -96, -28, 192, 22, 6, "#131417");
  g.fillStyle = "#0a0b0d";
  for (let x = -80; x <= 80; x += 20) g.fillRect(x, -24, 3, 16);
  for (const side of [-1, 1]) {
    for (const off of [34, 50]) {
      roundRect(g, side * off - 6, -20, 12, 9, 2, "#c9ced4");
      roundRect(g, side * off - 4, -18, 8, 5, 1, "#232629");
    }
  }
}

// --- Shelby Mustang GT500 1967: белый с синими полосами Ле-Мана ---
function drawShelby(g) {
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath(); g.ellipse(0, 8, 102, 12, 0, 0, Math.PI * 2); g.fill();
  roundRect(g, -90, -28, 30, 34, 7, "#131313");
  roundRect(g,  60, -28, 30, 34, 7, "#131313");
  // Белый кузов-фастбэк
  roundRect(g, -94, -52, 188, 46, 8, "#f2f3f0");
  g.fillStyle = "rgba(0,0,0,0.06)";
  g.fillRect(-86, -32, 172, 3);
  // Покатое стекло и крыша
  g.fillStyle = "#1d242c";
  g.beginPath();
  g.moveTo(-56, -52); g.lineTo(56, -52); g.lineTo(36, -96); g.lineTo(-36, -96);
  g.closePath(); g.fill();
  roundRect(g, -40, -102, 80, 10, 5, "#e4e5e2");
  // ДВЕ синие полосы Ле-Мана: по крыше и по багажнику
  g.fillStyle = "#2244aa";
  g.fillRect(-19, -102, 13, 10);  g.fillRect(6, -102, 13, 10);   // крыша
  g.fillRect(-19, -52, 13, 30);   g.fillRect(6, -52, 13, 30);    // багажник
  // Широкие фонари в хромовых рамках
  for (const side of [-1, 1]) {
    roundRect(g, side * 50 - 24, -47, 48, 13, 3, "#c9ced4");
    roundRect(g, side * 50 - 22, -45, 44, 9, 2, "#d42323");
    g.fillStyle = "#7c1212";
    g.fillRect(side * 50 - 2, -45, 3, 9);
  }
  // Круглая крышка бензобака с "коброй" по центру
  circle(g, 0, -40, 8, "#c9ced4");
  circle(g, 0, -40, 5.5, "#2244aa");
  circle(g, 0, -40, 2, "#f2f3f0");
  // Хромовый бампер, номер, две трубы
  roundRect(g, -94, -23, 188, 9, 4, "#d7dee5");
  roundRect(g, -22, -21, 44, 11, 2, "#f0f0f0");
  g.fillStyle = "#222";
  g.font = "bold 8px Verdana";
  g.textAlign = "center";
  g.fillText("САША", 0, -12.5);
  circle(g, -38, 2, 4, "#26282c"); circle(g, 38, 2, 4, "#26282c");
}

// --- Ford Mustang Dark Horse: Тёмный Конь с фонарями-трёхполосками ---
function drawDarkHorse(g) {
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath(); g.ellipse(0, 8, 102, 12, 0, 0, Math.PI * 2); g.fill();
  roundRect(g, -92, -28, 32, 34, 7, "#101010");
  roundRect(g,  60, -28, 32, 34, 7, "#101010");
  // Серый кузов
  roundRect(g, -94, -54, 188, 48, 9, "#8d9296");
  g.fillStyle = "rgba(255,255,255,0.13)";
  g.fillRect(-86, -53, 172, 3);
  // Стекло-клин, крыша и спойлер-утиный хвост
  g.fillStyle = "#14171b";
  g.beginPath();
  g.moveTo(-56, -54); g.lineTo(56, -54); g.lineTo(34, -98); g.lineTo(-34, -98);
  g.closePath(); g.fill();
  roundRect(g, -38, -104, 76, 9, 4, "#7d8286");
  roundRect(g, -62, -58, 124, 6, 3, "#1a1c1f");
  // Чёрная панель фонарей
  roundRect(g, -80, -51, 160, 19, 4, "#1a1b1e");
  // Фирменные ТРИ вертикальные полосы с каждой стороны!
  for (const side of [-1, 1])
    for (let k = 0; k < 3; k++) {
      const x = side * (38 + k * 14);
      roundRect(g, x - 4, -49, 8, 15, 2, "#e0231c");
      roundRect(g, x - 3, -48, 6, 5, 1, "#ff6a55");
    }
  // Тёмный конь-значок (силуэт в круге)
  circle(g, 0, -41, 7, "#3a3d41");
  circle(g, 0, -41, 5, "#26282c");
  // Чёрный диффузор с ЧЕТЫРЬМЯ круглыми трубами
  roundRect(g, -94, -24, 188, 16, 5, "#111316");
  for (const x of [-62, -46, 46, 62]) {
    circle(g, x, -15, 5, "#3f4348");
    circle(g, x, -15, 3, "#191a1c");
  }
  roundRect(g, -22, -21, 44, 11, 2, "#f0f0f0");
  g.fillStyle = "#222";
  g.font = "bold 8px Verdana";
  g.textAlign = "center";
  g.fillText("САША", 0, -12.5);
}

// --- Болид Формулы Форд: открытые колёса! (корма — по боковому фото) ---
function drawFFord(g) {
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath(); g.ellipse(0, 8, 108, 12, 0, 0, Math.PI * 2); g.fill();
  // Рычаги подвески — тянутся от тела к колёсам
  g.strokeStyle = "#23262a";
  g.lineWidth = 3;
  for (const side of [-1, 1]) {
    g.beginPath(); g.moveTo(side * 38, -30); g.lineTo(side * 80, -32); g.stroke();
    g.beginPath(); g.moveTo(side * 38, -14); g.lineTo(side * 82, -12); g.stroke();
  }
  // ОТКРЫТЫЕ колёса — огромные слики без кузова вокруг!
  roundRect(g, -102, -46, 36, 58, 11, "#0d0d0d");
  roundRect(g,  66, -46, 36, 58, 11, "#0d0d0d");
  circle(g, -84, -17, 7, "#8f979e"); circle(g, 84, -17, 7, "#8f979e");
  // Узкое тело-сигара: синий верх, белое брюхо
  roundRect(g, -40, -48, 80, 42, 14, "#2a5fd4");
  roundRect(g, -40, -24, 80, 16, 9, "#eef1f4");
  // Дуга безопасности и подголовник над телом
  roundRect(g, -13, -80, 26, 36, 9, "#2a5fd4");
  roundRect(g, -9, -74, 18, 15, 5, "#15171a");
  // Овал Ford и имя пилота
  g.fillStyle = "#1244a8";
  g.beginPath(); g.ellipse(0, -38, 13, 7.5, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#dfe6f2";
  g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(0, -38, 13, 7.5, 0, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#dfe6f2";
  g.font = "italic bold 7px Georgia";
  g.textAlign = "center";
  g.fillText("Fjord", 0, -35.5);
  g.fillStyle = "#ffffff";
  g.font = "bold 6px Verdana";
  g.fillText("САША", 0, -18);          // имя пилота на брюхе, как у настоящих
  // Маленький диффузор и дождевой огонёк
  roundRect(g, -30, -10, 60, 7, 3, "#15171a");
  circle(g, 0, -13, 3, "#ff2020");
}

// --- Болид F1: огромное крыло, гигантские слики, король скорости ---
function drawF1(g) {
  g.fillStyle = "rgba(0,0,0,0.4)";
  g.beginPath(); g.ellipse(0, 8, 112, 12, 0, 0, Math.PI * 2); g.fill();
  // Рычаги подвески — крепятся К КОРПУСУ (к бокам диффузора)!
  // Раньше начинались в воздухе — нашёл Саша на белом кубе
  g.strokeStyle = "#1c1e22";
  g.lineWidth = 4;
  for (const side of [-1, 1]) {
    g.beginPath(); g.moveTo(side * 56, -24); g.lineTo(side * 82, -34); g.stroke();
    g.beginPath(); g.moveTo(side * 56, -10); g.lineTo(side * 84, -14); g.stroke();
  }
  // ГИГАНТСКИЕ слики
  roundRect(g, -106, -50, 42, 62, 12, "#0b0b0b");
  roundRect(g,  64, -50, 42, 62, 12, "#0b0b0b");
  g.fillStyle = "#2a2d31";
  g.fillRect(-100, -46, 30, 4); g.fillRect(70, -46, 30, 4);
  // Днище-диффузор с рёбрами
  roundRect(g, -64, -28, 128, 24, 6, "#141416");
  g.fillStyle = "#0a0b0d";
  for (let x = -52; x <= 52; x += 13) g.fillRect(x, -24, 3, 18);
  // Узкий моторный кожух — красный клин кверху
  g.fillStyle = "#b3131b";
  g.beginPath();
  g.moveTo(-26, -28); g.lineTo(26, -28); g.lineTo(9, -88); g.lineTo(-9, -88);
  g.closePath(); g.fill();
  // Дождевой фонарь — мигающая вертикальная полоска на коробке передач
  roundRect(g, -4, -46, 8, 18, 3, "#3a0808");
  roundRect(g, -2.5, -44, 5, 14, 2, "#ff2020");
  // ОГРОМНОЕ ЗАДНЕЕ КРЫЛО на пилоне: два этажа + боковые пластины
  roundRect(g, -5, -100, 10, 14, 3, "#101214");
  roundRect(g, -86, -110, 172, 9, 3, "#16181a");
  roundRect(g, -86, -120, 172, 8, 3, "#b3131b");
  roundRect(g, -90, -124, 8, 28, 2, "#101214");
  roundRect(g,  82, -124, 8, 28, 2, "#101214");
  // Спонсор на крыле — конечно же, САША!
  g.fillStyle = "#ffffff";
  g.font = "italic bold 9px Verdana";
  g.textAlign = "center";
  g.fillText("SASHA RACING", 0, -113);
  // Выхлоп по центру над диффузором
  circle(g, 0, -22, 4.5, "#26282c");
  circle(g, 0, -22, 2.5, "#0a0a0a");
}

// --- ЗИС-115: чёрный бронированный лимузин (референс Саши) ---
// Высокий, важный, с хромовыми полосками на крыльях и массивным
// бампером. Его спецспособность — ТАРАН — живёт в физике (car.ram).
function drawZis(g) {
  g.fillStyle = "rgba(0,0,0,0.4)";
  g.beginPath(); g.ellipse(0, 8, 98, 12, 0, 0, Math.PI * 2); g.fill();
  // Колёса с белыми боками (мода той эпохи!)
  roundRect(g, -80, -30, 28, 36, 7, "#131313");
  roundRect(g,  52, -30, 28, 36, 7, "#131313");
  g.fillStyle = "#d9d9d2";
  g.fillRect(-78, -6, 24, 4);
  g.fillRect( 54, -6, 24, 4);
  // Высоченный чёрный кузов
  roundRect(g, -88, -66, 176, 60, 12, "#16181c");
  g.fillStyle = "rgba(255,255,255,0.12)";        // глянец чёрного лака
  g.fillRect(-78, -65, 156, 4);
  // Округлая крыша-купол и маленькое заднее окно (броня же!)
  // (кабина продлена вниз до кузова — раньше "висела в воздухе",
  // баг нашёл Саша!)
  roundRect(g, -54, -110, 108, 20, 10, "#101214");
  roundRect(g, -46, -98, 92, 36, 8, "#0d0f11");
  roundRect(g, -28, -94, 56, 20, 6, "#39434e");
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.fillRect(-22, -91, 20, 14);
  // Хромовые полоски на крыльях — три с каждой стороны, как на фото
  for (const side of [-1, 1])
    for (let k = 0; k < 3; k++)
      roundRect(g, side * 60 + (side < 0 ? -26 : 0), -40 + k * 7, 26, 3, 1.5, "#c9d0d7");
  // Маленькие круглые фонарики
  circle(g, -62, -48, 4.5, "#7c1212");
  circle(g,  62, -48, 4.5, "#7c1212");
  circle(g, -62, -48, 2.5, "#d42323");
  circle(g,  62, -48, 2.5, "#d42323");
  // МАССИВНЫЙ хромовый бампер с клыками — главный инструмент тарана!
  roundRect(g, -92, -22, 184, 13, 6, "#cfd6dd");
  roundRect(g, -40, -27, 9, 18, 3, "#c9d0d7");
  roundRect(g,  31, -27, 9, 18, 3, "#c9d0d7");
  // Номер
  roundRect(g, -20, -19, 40, 10, 2, "#f0f0f0");
  g.fillStyle = "#222";
  g.font = "bold 7px Verdana";
  g.textAlign = "center";
  g.fillText("САША", 0, -11.5);
}

// --- Land Rover Discovery: большой серый внедорожник ---
function drawDisco(g) {
  g.fillStyle = "rgba(0,0,0,0.38)";
  g.beginPath(); g.ellipse(0, 8, 96, 12, 0, 0, Math.PI * 2); g.fill();
  // Большие колёса вездехода
  roundRect(g, -84, -32, 32, 38, 8, "#111");
  roundRect(g,  52, -32, 32, 38, 8, "#111");
  // Высокий квадратный кузов
  roundRect(g, -88, -72, 176, 66, 10, "#9aa0a6");
  g.fillStyle = "rgba(255,255,255,0.16)";
  g.fillRect(-80, -71, 160, 3);
  // Огромное вертикальное стекло багажника и крыша с рейлингами.
  // Стекло доходит до кузова — раньше висело в воздухе (нашёл Саша!)
  roundRect(g, -56, -110, 112, 40, 8, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)";
  g.fillRect(-48, -104, 38, 26);
  roundRect(g, -60, -116, 120, 8, 4, "#8a9096");
  roundRect(g, -54, -120, 20, 5, 2, "#5c6166");
  roundRect(g,  34, -120, 20, 5, 2, "#5c6166");
  // Надпись DISCOVERY через весь багажник (как на фото!)
  g.fillStyle = "#5c6166";
  g.font = "bold 8px Verdana";
  g.textAlign = "center";
  g.fillText("D I S C O V E R R Y", 0, -62);
  // Тонкие горизонтальные фонари
  for (const side of [-1, 1]) {
    roundRect(g, side * 59 - 19, -58, 38, 10, 3, "#1c1f23");
    roundRect(g, side * 59 - 16, -56, 32, 5, 2, "#d42323");
  }
  // Номер высоко на двери багажника
  roundRect(g, -24, -54, 48, 13, 2, "#f2f2f2");
  g.fillStyle = "#1a1a1a";
  g.font = "bold 8px Verdana";
  g.fillText("САША", 0, -44);
  // Массивный чёрный бампер с серебристой защитой
  roundRect(g, -88, -26, 176, 18, 6, "#26292d");
  roundRect(g, -30, -18, 60, 9, 4, "#b9bec6");
}

// --- Toyota Hilux: красный пикап-работяга ---
function drawHilux(g) {
  g.fillStyle = "rgba(0,0,0,0.38)";
  g.beginPath(); g.ellipse(0, 8, 96, 12, 0, 0, Math.PI * 2); g.fill();
  roundRect(g, -82, -30, 30, 36, 7, "#121212");
  roundRect(g,  52, -30, 30, 36, 7, "#121212");
  // Кабина — выше и уже кузова, с задним окном
  roundRect(g, -52, -100, 104, 44, 8, "#a01b24");
  roundRect(g, -42, -94, 84, 22, 5, "#39434e");
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.fillRect(-36, -91, 30, 16);
  roundRect(g, -48, -104, 96, 8, 4, "#8f171f");
  // Открытый КУЗОВ: высокий плоский борт
  roundRect(g, -86, -58, 172, 52, 6, "#b3202a");
  g.fillStyle = "rgba(0,0,0,0.15)";              // рёбра жёсткости борта
  g.fillRect(-78, -46, 156, 3);
  g.fillRect(-78, -32, 156, 3);
  g.fillStyle = "rgba(255,255,255,0.14)";
  g.fillRect(-78, -57, 156, 3);
  // Надпись TOYOTA на борту
  g.fillStyle = "#f0f0f0";
  g.font = "bold 9px Verdana";
  g.textAlign = "center";
  g.fillText("T A Y O D A", 0, -36);
  // Вертикальные фонари по углам кузова: красный/янтарный/белый
  for (const side of [-1, 1]) {
    const x = side * 80;
    roundRect(g, x - 6, -56, 12, 26, 3, "#1a1c1f");
    roundRect(g, x - 4, -54, 8, 8, 2, "#d42323");
    roundRect(g, x - 4, -45, 8, 6, 2, "#ffb35c");
    roundRect(g, x - 4, -38, 8, 5, 2, "#e8e6df");
  }
  // Хромовый бампер-ступенька и номер
  roundRect(g, -90, -20, 180, 11, 4, "#cfd6dd");
  roundRect(g, -22, -18, 44, 10, 2, "#f0f0f0");
  g.fillStyle = "#222";
  g.font = "bold 7px Verdana";
  g.textAlign = "center";
  g.fillText("САША", 0, -10.5);
}

// --- Toyota RAV4: тёмно-серый кроссовер (по фото Саши) ---
function drawRav4(g) {
  g.fillStyle = "rgba(0,0,0,0.38)";
  g.beginPath(); g.ellipse(0, 8, 94, 12, 0, 0, Math.PI * 2); g.fill();
  // Колёса с чёрными пластиковыми арками
  roundRect(g, -82, -30, 30, 36, 7, "#121212");
  roundRect(g,  52, -30, 30, 36, 7, "#121212");
  // Стекло багажника со спойлером-козырьком и стоп-сигналом в нём
  roundRect(g, -54, -112, 108, 42, 8, "#161b20");
  g.fillStyle = "rgba(255,255,255,0.10)";
  g.fillRect(-46, -106, 36, 26);
  roundRect(g, -62, -119, 124, 9, 4, "#3d4249");
  roundRect(g, -16, -116, 32, 3, 1, "#d42323");   // стоп-сигнал в спойлере
  // Рейлинги на крыше
  roundRect(g, -56, -123, 20, 5, 2, "#5c6166");
  roundRect(g,  36, -123, 20, 5, 2, "#5c6166");
  // Высокий кузов графитового цвета, плечи чуть шире стёкол
  roundRect(g, -86, -76, 172, 70, 10, "#4a4f57");
  g.fillStyle = "rgba(255,255,255,0.14)";
  g.fillRect(-78, -75, 156, 3);
  // Узкие фонари, СОЕДИНЁННЫЕ серебристой планкой (фишка RAV4!)
  roundRect(g, -42, -64, 84, 7, 3, "#c9d0d7");
  for (const side of [-1, 1]) {
    roundRect(g, side * 62 - 22, -68, 44, 14, 4, "#1c1f23");
    roundRect(g, side * 62 - 19, -65, 38, 8, 3, "#d42323");
  }
  // Эмблема по центру планки
  g.fillStyle = "#8a9096";
  g.beginPath(); g.ellipse(0, -60.5, 8, 5, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#4a4f57";
  g.beginPath(); g.ellipse(0, -60.5, 5, 2.6, 0, 0, Math.PI * 2); g.fill();
  // Название модели на двери багажника
  g.fillStyle = "#c9d0d7";
  g.font = "bold 8px Verdana";
  g.textAlign = "center";
  g.fillText("R E V 4", 0, -46);
  // Номер
  roundRect(g, -22, -42, 44, 12, 2, "#f0f0f0");
  g.fillStyle = "#222";
  g.font = "bold 7px Verdana";
  g.fillText("САША", 0, -33);
  // Чёрный бампер с серебристой защитой и катафотами
  roundRect(g, -86, -26, 172, 18, 6, "#1d2023");
  roundRect(g, -32, -16, 64, 8, 4, "#b9bec6");
  roundRect(g, -78, -22, 6, 10, 2, "#a11c1c");
  roundRect(g,  72, -22, 6, 10, 2, "#a11c1c");
}

// --- УАЗ «Буханка»: светло-серый фургон-кубик (по фото Саши) ---
function drawBuhanka(g) {
  g.fillStyle = "rgba(0,0,0,0.38)";
  g.beginPath(); g.ellipse(0, 8, 88, 12, 0, 0, Math.PI * 2); g.fill();
  // Колёсики — маленькие, как у настоящей
  roundRect(g, -74, -26, 26, 32, 6, "#121212");
  roundRect(g,  48, -26, 26, 32, 6, "#121212");
  // Высоченный кузов-«буханка» со скруглённой крышей
  roundRect(g, -78, -128, 156, 122, 14, "#c9ccd1");
  g.fillStyle = "rgba(255,255,255,0.35)";
  g.fillRect(-70, -126, 140, 4);
  g.fillStyle = "rgba(0,0,0,0.08)";
  g.fillRect(-78, -52, 156, 3);   // штамповка по низу
  // Две задние двери: щель посередине и петли по краям
  g.fillStyle = "#9aa0a6";
  g.fillRect(-1.5, -120, 3, 100);
  for (const y of [-110, -80, -46]) {
    roundRect(g, -76, y, 5, 10, 2, "#b0b4ba");
    roundRect(g,  71, y, 5, 10, 2, "#b0b4ba");
  }
  // Два окна в дверях
  roundRect(g, -64, -118, 55, 34, 5, "#1a2026");
  roundRect(g,   9, -118, 55, 34, 5, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.fillRect(-58, -113, 24, 24);
  g.fillRect(15, -113, 24, 24);
  // Ручки дверей
  roundRect(g, -14, -74, 9, 4, 2, "#5c6166");
  roundRect(g,   5, -74, 9, 4, 2, "#5c6166");
  // Фонарики-кругляши по углам
  for (const side of [-1, 1]) {
    g.fillStyle = "#d42323";
    g.beginPath(); g.arc(side * 66, -40, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#ffb35c";
    g.beginPath(); g.arc(side * 66, -30, 4, 0, Math.PI * 2); g.fill();
  }
  // Номер и чёрный бампер-труба
  roundRect(g, -21, -40, 42, 11, 2, "#f0f0f0");
  g.fillStyle = "#222";
  g.font = "bold 7px Verdana";
  g.textAlign = "center";
  g.fillText("САША", 0, -31.5);
  roundRect(g, -80, -20, 160, 10, 5, "#26292d");
}

// --- РАФ-2203: белый рижский микроавтобус (по фото Саши) ---
function drawRaf(g) {
  g.fillStyle = "rgba(0,0,0,0.38)";
  g.beginPath(); g.ellipse(0, 8, 88, 12, 0, 0, Math.PI * 2); g.fill();
  roundRect(g, -74, -26, 26, 32, 6, "#121212");
  roundRect(g,  48, -26, 26, 32, 6, "#121212");
  // Белый кузов с покатой крышей
  roundRect(g, -76, -124, 152, 118, 12, "#f2f3f0");
  g.fillStyle = "rgba(0,0,0,0.06)";
  g.fillRect(-76, -50, 152, 3);
  // Огромное заднее стекло во всю ширину
  roundRect(g, -62, -114, 124, 38, 6, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.fillRect(-54, -108, 46, 26);
  // Фирменная оранжевая полоса с надписью RAF-2203 (как на фото!)
  roundRect(g, -76, -70, 152, 14, 2, "#f0a11c");
  g.fillStyle = "#20304c";
  g.font = "italic bold 9px Verdana";
  g.textAlign = "center";
  g.fillText("RAF-2203", 0, -59.5);
  // Шашечки такси на жёлтой табличке
  roundRect(g, -18, -50, 36, 8, 2, "#ffd23f");
  g.fillStyle = "#222";
  for (let i = 0; i < 6; i++)
    if (i % 2 === 0) g.fillRect(-15 + i * 5, -49, 5, 6);
  // Вертикальные фонари по краям
  for (const side of [-1, 1]) {
    roundRect(g, side * 68 - 5, -66, 10, 22, 3, "#1c1f23");
    roundRect(g, side * 68 - 3, -64, 6, 9, 2, "#d42323");
    roundRect(g, side * 68 - 3, -54, 6, 8, 2, "#ffb35c");
  }
  // Номер и бампер
  roundRect(g, -21, -38, 42, 11, 2, "#f0f0f0");
  g.fillStyle = "#222";
  g.font = "bold 7px Verdana";
  g.fillText("САША", 0, -29.5);
  roundRect(g, -78, -20, 156, 10, 5, "#8a9096");
}

// --- ВАЗ-2101 «Копейка»: вишнёвая классика с хромом (по фото Саши) ---
function drawKopeyka(g) {
  g.fillStyle = "rgba(0,0,0,0.38)";
  g.beginPath(); g.ellipse(0, 8, 90, 12, 0, 0, Math.PI * 2); g.fill();
  roundRect(g, -74, -26, 26, 32, 6, "#121212");
  roundRect(g,  48, -26, 26, 32, 6, "#121212");
  // Заднее стекло с тонкими хромовыми стойками
  roundRect(g, -54, -100, 108, 38, 6, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.fillRect(-46, -94, 40, 26);
  roundRect(g, -58, -104, 116, 6, 3, "#a51e24");
  // Низкий аккуратный кузов
  roundRect(g, -84, -66, 168, 60, 8, "#a51e24");
  g.fillStyle = "rgba(255,255,255,0.18)";
  g.fillRect(-76, -65, 152, 3);
  // Хромовая кромка багажника
  roundRect(g, -66, -50, 132, 3, 1, "#d7dce2");
  // Маленькие прямоугольные фонари по углам
  for (const side of [-1, 1]) {
    roundRect(g, side * 66 - 12, -44, 24, 12, 2, "#1c1f23");
    roundRect(g, side * 66 - 10, -42, 12, 8, 1, "#d42323");
    roundRect(g, side * 66 + 3, -42, 6, 8, 1, "#e8e6df");
  }
  // Шильдик слева ПОД фонарём (правка Саши: налезал на фару!)
  g.fillStyle = "#d7dce2";
  g.font = "bold 6px Verdana";
  g.textAlign = "center";
  g.fillText("ВАЗ 2101", -52, -24.5);
  roundRect(g, -22, -42, 44, 12, 2, "#f0f0f0");
  g.fillStyle = "#222";
  g.font = "bold 7px Verdana";
  g.fillText("САША", 0, -33);
  // Хромовый бампер с клыками
  roundRect(g, -88, -22, 176, 9, 4, "#d7dce2");
  roundRect(g, -60, -26, 8, 6, 2, "#c0c6cd");
  roundRect(g,  52, -26, 8, 6, 2, "#c0c6cd");
}

// --- ВАЗ-2107 «Семёрка»: белая, большие фонари (по фото Саши) ---
function drawSemerka(g) {
  g.fillStyle = "rgba(0,0,0,0.38)";
  g.beginPath(); g.ellipse(0, 8, 90, 12, 0, 0, Math.PI * 2); g.fill();
  roundRect(g, -74, -26, 26, 32, 6, "#121212");
  roundRect(g,  48, -26, 26, 32, 6, "#121212");
  roundRect(g, -54, -102, 108, 38, 6, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.fillRect(-46, -96, 40, 26);
  roundRect(g, -58, -106, 116, 6, 3, "#e4e6e2");
  // Кузов повыше копейки, угловатый
  roundRect(g, -84, -68, 168, 62, 7, "#f2f3f0");
  g.fillStyle = "rgba(0,0,0,0.05)";
  g.fillRect(-84, -46, 168, 3);
  // БОЛЬШИЕ прямоугольные фонари (фишка семёрки!)
  for (const side of [-1, 1]) {
    roundRect(g, side * 58 - 24, -60, 48, 16, 2, "#1c1f23");
    roundRect(g, side * 58 - 22, -58, 18, 12, 1, "#ffb35c");
    roundRect(g, side * 58 - 2,  -58, 22, 12, 1, "#d42323");
  }
  // Чёрная планка между фонарями
  roundRect(g, -32, -58, 64, 12, 2, "#26292d");
  g.fillStyle = "#c9d0d7";
  g.font = "bold 6px Verdana";
  g.textAlign = "center";
  g.fillText("LADA 2107", 0, -50);
  // Номер ниже планки
  roundRect(g, -22, -42, 44, 12, 2, "#f0f0f0");
  g.fillStyle = "#222";
  g.font = "bold 7px Verdana";
  g.fillText("САША", 0, -33);
  // Чёрный бампер с серой вставкой
  roundRect(g, -88, -24, 176, 12, 4, "#26292d");
  roundRect(g, -80, -20, 160, 4, 2, "#8a9096");
}

// --- ВАЗ-2104 «Четвёрка»: красный универсал (по фото Саши, версия 2:
// первая была «не очень» — стекло меньше, фонари-столбики крупнее) ---
function drawChetverka(g) {
  g.fillStyle = "rgba(0,0,0,0.38)";
  g.beginPath(); g.ellipse(0, 8, 90, 12, 0, 0, Math.PI * 2); g.fill();
  roundRect(g, -74, -26, 26, 32, 6, "#121212");
  roundRect(g,  48, -26, 26, 32, 6, "#121212");
  // Высокий угловатый кузов-универсал
  roundRect(g, -82, -112, 164, 106, 7, "#c5342c");
  g.fillStyle = "rgba(255,255,255,0.20)";
  g.fillRect(-74, -110, 148, 3);
  // Водостоки по краям крыши
  roundRect(g, -80, -108, 4, 40, 2, "#8f2620");
  roundRect(g,  76, -108, 4, 40, 2, "#8f2620");
  // Стекло — только ВЕРХ двери багажника (как на фото!)
  roundRect(g, -56, -105, 112, 34, 5, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.fillRect(-48, -100, 42, 24);
  // Дворник лежит вдоль нижней кромки стекла
  g.strokeStyle = "#26292d";
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(4, -73); g.lineTo(46, -78); g.stroke();
  g.beginPath(); g.arc(4, -73, 2.5, 0, Math.PI * 2); g.stroke();
  // Штамповка на двери
  g.fillStyle = "rgba(0,0,0,0.10)";
  g.fillRect(-82, -42, 164, 3);
  // Крупные вертикальные фонари-столбики на крыльях:
  // красный / белый (задний ход) / янтарный
  for (const side of [-1, 1]) {
    roundRect(g, side * 72 - 8, -66, 16, 34, 3, "#1c1f23");
    roundRect(g, side * 72 - 6, -64, 12, 11, 1, "#d42323");
    roundRect(g, side * 72 - 6, -52, 12, 8, 1, "#e8e6df");
    roundRect(g, side * 72 - 6, -43, 12, 9, 1, "#ffb35c");
  }
  // Номер высоко на двери, прямо под стеклом (как на фото)
  roundRect(g, -25, -66, 50, 14, 2, "#f0f0f0");
  g.fillStyle = "#222";
  g.font = "bold 8px Verdana";
  g.textAlign = "center";
  g.fillText("САША", 0, -55.5);
  // Шильдик слева под штамповкой
  g.fillStyle = "#e4e6e2";
  g.font = "bold 6px Verdana";
  g.fillText("ВАЗ 2104", -50, -32);
  // Хромовый бампер с чёрными уголками
  roundRect(g, -86, -20, 172, 9, 4, "#d7dce2");
  roundRect(g, -86, -20, 14, 9, 4, "#26292d");
  roundRect(g,  72, -20, 14, 9, 4, "#26292d");
}

// ==================== АМЕРИКАНСКИЙ АВТОСАЛОН ====================
// 17 машин по фото Саши. Общая заготовка колёс и тени:
function carBase(g, wheelY = -28, wheelH = 34) {
  g.fillStyle = "rgba(0,0,0,0.38)";
  g.beginPath(); g.ellipse(0, 8, 94, 12, 0, 0, Math.PI * 2); g.fill();
  roundRect(g, -80, wheelY, 30, wheelH, 7, "#121212");
  roundRect(g,  50, wheelY, 30, wheelH, 7, "#121212");
}
function plate(g, y, w = 44) {
  roundRect(g, -w / 2, y, w, 12, 2, "#f0f0f0");
  g.fillStyle = "#222";
  g.font = "bold 7px Verdana";
  g.textAlign = "center";
  g.fillText("САША", 0, y + 9);
}

// --- Dodge Challenger: кислотный мускул, фонари в чёрной нише ---
function drawChallenger(g) {
  carBase(g);
  roundRect(g, -56, -96, 112, 30, 8, "#1a2026");          // стекло
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-48, -92, 40, 20);
  roundRect(g, -88, -70, 176, 64, 9, "#a8d426");          // мускулистый кузов
  g.fillStyle = "rgba(255,255,255,0.22)"; g.fillRect(-80, -69, 160, 3);
  roundRect(g, -74, -60, 148, 20, 6, "#15171a");          // чёрная ниша фонарей
  for (const side of [-1, 1]) {                           // два широких фонаря
    roundRect(g, side * 40 - 26, -57, 52, 14, 6, "#3d0a0a");
    roundRect(g, side * 40 - 23, -54, 46, 8, 4, "#e82121");
  }
  g.fillStyle = "#a8d426"; g.font = "bold 6px Verdana"; g.textAlign = "center";
  g.fillText("D O D G E E", 0, -52);
  plate(g, -36);
  roundRect(g, -88, -22, 176, 14, 6, "#191b1e");          // чёрный низ
  roundRect(g, -62, -18, 26, 8, 3, "#c9d0d7");            // трубы!
  roundRect(g,  36, -18, 26, 8, 3, "#c9d0d7");
}

// --- Dodge Charger 2014: чёрный седан, красная лента фонарей ---
function drawCharger14(g) {
  carBase(g);
  roundRect(g, -54, -98, 108, 34, 7, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.09)"; g.fillRect(-46, -93, 40, 24);
  roundRect(g, -86, -68, 172, 62, 8, "#17191c");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-78, -67, 156, 3);
  roundRect(g, -70, -62, 140, 4, 2, "#26292d");           // губа-спойлер
  roundRect(g, -72, -56, 144, 14, 5, "#8f0f0f");          // лента фонарей
  roundRect(g, -68, -53, 136, 8, 4, "#e82121");
  g.fillStyle = "#c9d0d7"; g.font = "bold 6px Verdana"; g.textAlign = "center";
  g.fillText("C H A R J E R", 0, -34);
  plate(g, -30);
  roundRect(g, -86, -18, 172, 10, 5, "#101214");
}

// --- Dodge Charger 1969: жёлтая легенда с полосой-шмелём ---
function drawCharger69(g) {
  carBase(g);
  // Покатое стекло между «крыльями» кузова
  roundRect(g, -50, -94, 100, 32, 6, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-42, -89, 36, 22);
  roundRect(g, -88, -66, 176, 60, 8, "#e8c11c");
  g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(-80, -65, 160, 3);
  // Чёрная полоса-шмель вокруг хвоста
  roundRect(g, 52, -66, 24, 60, 4, "#17191c");
  g.fillStyle = "#e8c11c"; g.font = "bold 8px Verdana"; g.textAlign = "center";
  g.fillText("R", 64, -38);
  // Чёрная панель с фонарём во всю ширину в хромовой рамке
  roundRect(g, -70, -58, 140, 16, 4, "#15171a");
  roundRect(g, -66, -54, 132, 8, 4, "#c22020");
  roundRect(g, -70, -58, 140, 3, 1, "#c9d0d7");
  plate(g, -36);
  roundRect(g, -90, -22, 180, 10, 4, "#d7dce2");          // хром-бампер
}

// --- Dodge Durango: белый SUV, фонарь-«гоночный трек» ---
function drawDurango(g) {
  carBase(g, -30, 36);
  roundRect(g, -80, -116, 160, 110, 10, "#f0f1f3");
  g.fillStyle = "rgba(0,0,0,0.05)"; g.fillRect(-80, -46, 160, 3);
  roundRect(g, -58, -108, 116, 38, 7, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-50, -102, 44, 26);
  // Красная светящаяся лента через ВСЮ корму
  roundRect(g, -74, -62, 148, 16, 8, "#2a0d0d");
  roundRect(g, -70, -58, 140, 8, 4, "#e82121");
  g.fillStyle = "#5c6166"; g.font = "bold 6px Verdana"; g.textAlign = "center";
  g.fillText("D U R A N G A", 0, -38);
  plate(g, -34);
  roundRect(g, -80, -22, 160, 12, 5, "#26292d");
  roundRect(g, -34, -18, 68, 7, 3, "#b9bec6");
}

// --- Cadillac Escalade: чёрный небоскрёб, фонари до крыши ---
function drawEscalade(g) {
  carBase(g, -30, 36);
  roundRect(g, -78, -122, 156, 116, 9, "#101214");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-70, -120, 140, 3);
  roundRect(g, -56, -112, 112, 44, 7, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(-48, -106, 44, 30);
  // ФИРМЕННЫЕ вертикальные фонари во всю высоту кормы
  for (const side of [-1, 1]) {
    roundRect(g, side * 72 - 5, -118, 10, 96, 4, "#2a0d0d");
    roundRect(g, side * 72 - 3, -114, 6, 88, 3, "#e82121");
  }
  // Эмблема-герб
  roundRect(g, -7, -68, 14, 10, 3, "#d7dce2");
  g.fillStyle = "#8f6f1f"; g.fillRect(-4, -66, 8, 6);
  plate(g, -46);
  roundRect(g, -66, -20, 132, 10, 5, "#191b1e");
}

// --- Cadillac Sixteen: серый концепт V16 ---
function drawSixteen(g) {
  carBase(g);
  roundRect(g, -48, -92, 96, 30, 10, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-40, -87, 34, 20);
  // Длинный гладкий низкий кузов
  roundRect(g, -90, -64, 180, 58, 12, "#6d747c");
  g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(-82, -63, 164, 3);
  // Узенькие вертикальные фонари
  for (const side of [-1, 1]) {
    roundRect(g, side * 80 - 4, -58, 8, 30, 3, "#8f0f0f");
    roundRect(g, side * 80 - 2, -55, 4, 24, 2, "#e82121");
  }
  roundRect(g, -6, -60, 12, 9, 2, "#d7dce2");             // эмблема
  g.fillStyle = "#8f6f1f"; g.fillRect(-3, -58, 6, 5);
  g.fillStyle = "#c9d0d7"; g.font = "bold 5px Verdana"; g.textAlign = "center";
  g.fillText("S I X T E E N", 0, -40);
  plate(g, -34);
  roundRect(g, -84, -20, 168, 9, 5, "#5d636b");
}

// --- Chevrolet Cruze: красный седан с бабочкой на хроме ---
function drawCruze(g) {
  carBase(g);
  roundRect(g, -52, -98, 104, 34, 7, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-44, -93, 38, 24);
  roundRect(g, -84, -66, 168, 60, 9, "#a51e28");
  g.fillStyle = "rgba(255,255,255,0.16)"; g.fillRect(-76, -65, 152, 3);
  // Фонари-уголки
  for (const side of [-1, 1]) {
    roundRect(g, side * 62 - 20, -60, 40, 18, 5, "#7a1216");
    roundRect(g, side * 62 - 16, -56, 32, 10, 3, "#e82121");
  }
  // Хромовая планка с золотой бабочкой
  roundRect(g, -40, -56, 80, 6, 3, "#d7dce2");
  roundRect(g, -9, -58, 18, 10, 2, "#c9a11c");
  plate(g, -40);
  roundRect(g, -84, -20, 168, 10, 5, "#8f171f");
}

// --- Ford EcoSport: синий малыш с запаской на двери! ---
function drawEcoSport(g) {
  carBase(g, -28, 34);
  roundRect(g, -72, -112, 144, 106, 10, "#2b57c9");
  g.fillStyle = "rgba(255,255,255,0.16)"; g.fillRect(-64, -110, 128, 3);
  roundRect(g, -52, -104, 104, 36, 7, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-44, -98, 40, 24);
  for (const side of [-1, 1]) {
    roundRect(g, side * 62 - 8, -62, 16, 26, 4, "#1c1f23");
    roundRect(g, side * 62 - 6, -58, 12, 10, 2, "#e82121");
    roundRect(g, side * 62 - 6, -47, 12, 8, 2, "#ffb35c");
  }
  // ЗАПАСКА в синем чехле прямо на двери багажника
  g.fillStyle = "#1d3f96";
  g.beginPath(); g.arc(0, -48, 26, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#2b57c9";
  g.beginPath(); g.arc(0, -48, 19, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#1d3f96";
  g.beginPath(); g.arc(0, -48, 7, 0, Math.PI * 2); g.fill();
  plate(g, -30, 40);
  roundRect(g, -74, -18, 148, 9, 4, "#26292d");
}

// --- Ford Kuga: чёрный кроссовер с серебристой защитой ---
function drawKuga(g) {
  carBase(g, -28, 34);
  roundRect(g, -76, -114, 152, 108, 11, "#141618");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-68, -112, 136, 3);
  roundRect(g, -56, -106, 112, 38, 7, "#232a31");
  g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(-48, -100, 44, 26);
  for (const side of [-1, 1]) {
    roundRect(g, side * 60 - 18, -64, 36, 14, 5, "#2a0d0d");
    roundRect(g, side * 60 - 14, -61, 28, 8, 3, "#e82121");
  }
  g.fillStyle = "#8a9096"; g.font = "bold 6px Verdana"; g.textAlign = "center";
  g.fillText("K U G G A", 0, -44);
  plate(g, -40, 40);
  roundRect(g, -76, -22, 152, 14, 6, "#1d2023");
  roundRect(g, -40, -16, 80, 7, 3, "#b9bec6");
  g.fillStyle = "#c9d0d7";
  g.beginPath(); g.arc(-52, -13, 5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc( 52, -13, 5, 0, Math.PI * 2); g.fill();
}

// --- Ford GT: гиперкар с круглыми фонарями-турбинами ---
function drawFordGT(g) {
  carBase(g, -24, 30);
  // Низкий широченный корпус
  roundRect(g, -92, -74, 184, 68, 14, "#1a55c4");
  g.fillStyle = "rgba(255,255,255,0.20)"; g.fillRect(-84, -73, 168, 3);
  roundRect(g, -44, -92, 88, 24, 8, "#1a2026");            // узкое стекло
  // КРУГЛЫЕ фонари: красное кольцо, чёрная турбина внутри
  for (const side of [-1, 1]) {
    g.fillStyle = "#e82121";
    g.beginPath(); g.arc(side * 62, -50, 17, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#15171a";
    g.beginPath(); g.arc(side * 62, -50, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#2a2d31";
    g.beginPath(); g.arc(side * 62, -50, 5, 0, Math.PI * 2); g.fill();
  }
  // Две центральные трубы-сопла
  g.fillStyle = "#15171a";
  g.beginPath(); g.arc(-11, -56, 8, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc( 11, -56, 8, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#000";
  g.beginPath(); g.arc(-11, -56, 5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc( 11, -56, 5, 0, Math.PI * 2); g.fill();
  // Решётка и диффузор
  roundRect(g, -70, -38, 140, 10, 4, "#15171a");
  plate(g, -26, 40);
  g.fillStyle = "#101214";
  for (const x of [-58, -34, 24, 46]) {
    g.beginPath();
    g.moveTo(x, -6); g.lineTo(x + 12, -6); g.lineTo(x + 9, -22); g.lineTo(x + 3, -22);
    g.closePath(); g.fill();
  }
}

// --- Lincoln Nautilus: синий люкс-кроссовер ---
function drawNautilus(g) {
  carBase(g, -28, 34);
  roundRect(g, -78, -112, 156, 106, 11, "#1d2f45");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-70, -110, 140, 3);
  roundRect(g, -56, -104, 112, 36, 7, "#151d28");
  g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(-48, -98, 44, 24);
  g.fillStyle = "#c9d0d7"; g.font = "bold 6px Verdana"; g.textAlign = "center";
  g.fillText("L I N K O R N", 0, -62);
  // Фонарь во всю ширину
  roundRect(g, -72, -58, 144, 12, 6, "#2a0d0d");
  roundRect(g, -68, -55, 136, 6, 3, "#e82121");
  roundRect(g, -8, -60, 16, 16, 3, "#15171a");            // эмблема-книжка
  g.fillStyle = "#c9d0d7"; g.fillRect(-1.5, -58, 3, 12);
  plate(g, -40, 40);
  roundRect(g, -78, -22, 156, 14, 6, "#16202c");
  roundRect(g, -58, -16, 30, 8, 3, "#b9bec6");
  roundRect(g,  28, -16, 30, 8, 3, "#b9bec6");
}

// --- Lincoln Continental 2017: чёрный джентльмен ---
function drawContinental17(g) {
  carBase(g);
  roundRect(g, -54, -98, 108, 34, 8, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(-46, -93, 40, 24);
  roundRect(g, -86, -66, 172, 60, 9, "#101214");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-78, -65, 156, 3);
  g.fillStyle = "#c9d0d7"; g.font = "bold 6px Verdana"; g.textAlign = "center";
  g.fillText("L I N K O R N", 0, -58);
  // Тонкая световая полоса от края до края в хромовой оправе
  roundRect(g, -78, -54, 156, 10, 5, "#2a0d0d");
  roundRect(g, -74, -52, 148, 5, 2, "#e82121");
  roundRect(g, -78, -44, 156, 2, 1, "#8a9096");
  plate(g, -38);
  roundRect(g, -86, -18, 172, 9, 4, "#0b0d0f");
  roundRect(g, -70, -15, 140, 3, 1, "#8a9096");
}

// --- Lincoln Mark V 1979: корабль с горбом запаски ---
function drawMark5(g) {
  carBase(g);
  roundRect(g, -56, -96, 112, 30, 5, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-48, -91, 42, 20);
  // Огромный плоский багажник
  roundRect(g, -92, -68, 184, 62, 6, "#9db4c9");
  g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(-84, -67, 168, 3);
  // ГОРБ запаски — полукруг на двери багажника (фирменный знак!)
  g.fillStyle = "#8aa2b8";
  g.beginPath(); g.arc(0, -24, 34, Math.PI, 0); g.closePath(); g.fill();
  g.strokeStyle = "#d7dce2"; g.lineWidth = 2;
  g.beginPath(); g.arc(0, -24, 34, Math.PI, 0); g.stroke();
  roundRect(g, -3, -52, 6, 14, 2, "#8f6f1f");             // эмблемка на горбе
  // Узкие вертикальные фонари по углам
  for (const side of [-1, 1]) {
    roundRect(g, side * 82 - 6, -62, 12, 26, 2, "#1c1f23");
    for (let i = 0; i < 3; i++)
      roundRect(g, side * 82 - 4, -60 + i * 8, 8, 6, 1, "#c22020");
  }
  g.fillStyle = "#5c6166"; g.font = "bold 5px Verdana"; g.textAlign = "center";
  g.fillText("C O N T I N E N T A L", -46, -58);
  plate(g, -20, 36);
  roundRect(g, -94, -12, 188, 8, 3, "#d7dce2");
}

// --- Lincoln Continental 1960: белый крейсер с плавниками ---
function drawLincoln60(g) {
  carBase(g);
  roundRect(g, -58, -94, 116, 28, 5, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-50, -89, 44, 18);
  roundRect(g, -90, -66, 180, 60, 6, "#f2f3f0");
  g.fillStyle = "rgba(0,0,0,0.05)"; g.fillRect(-82, -40, 164, 3);
  // ПЛАВНИКИ, наклонённые наружу!
  for (const side of [-1, 1]) {
    g.fillStyle = "#e2e4e0";
    g.beginPath();
    g.moveTo(side * 74, -64);
    g.lineTo(side * 94, -84);
    g.lineTo(side * 92, -60);
    g.closePath(); g.fill();
    g.strokeStyle = "#c0c6cd"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(side * 74, -64); g.lineTo(side * 94, -84); g.stroke();
  }
  // Решётчатая панель с ЧЕТЫРЬМЯ круглыми огнями
  roundRect(g, -78, -60, 156, 22, 4, "#a8adb4");
  g.fillStyle = "rgba(0,0,0,0.18)";
  for (let y = -58; y < -40; y += 4) g.fillRect(-76, y, 152, 1.6);
  for (const x of [-64, -46, 46, 64]) {
    g.fillStyle = "#7a1216";
    g.beginPath(); g.arc(x, -49, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#d42323";
    g.beginPath(); g.arc(x, -49, 4.5, 0, Math.PI * 2); g.fill();
  }
  roundRect(g, -9, -56, 18, 8, 2, "#d7dce2");             // эмблема по центру
  plate(g, -34, 40);
  roundRect(g, -92, -22, 184, 10, 4, "#d7dce2");
}

// --- Lincoln Navigator: серый гигант ---
function drawNavigator(g) {
  carBase(g, -30, 36);
  roundRect(g, -80, -118, 160, 112, 9, "#5c6166");
  g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(-72, -116, 144, 3);
  roundRect(g, -58, -110, 116, 42, 7, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(-50, -104, 46, 30);
  // Широкие фонари с красно-белыми секциями
  for (const side of [-1, 1]) {
    roundRect(g, side * 62 - 18, -62, 36, 16, 4, "#1c1f23");
    roundRect(g, side * 62 - 15, -59, 18, 10, 2, "#c22020");
    roundRect(g, side * 62 + 4,  -59, 10, 10, 2, "#e8e6df");
  }
  // Хромовая планка с эмблемой
  roundRect(g, -40, -60, 80, 4, 2, "#c9d0d7");
  roundRect(g, -5, -66, 10, 14, 2, "#15171a");
  g.fillStyle = "#c9d0d7"; g.fillRect(-1, -64, 2, 10);
  g.fillStyle = "#c9d0d7"; g.font = "bold 5px Verdana"; g.textAlign = "center";
  g.fillText("N A V I G A D O R", 0, -32);
  plate(g, -56, 40);
  roundRect(g, -80, -24, 160, 14, 5, "#3d4247");
}

// --- Lincoln Zephyr: серебристый зефир ---
function drawZephyr(g) {
  carBase(g);
  roundRect(g, -52, -98, 104, 34, 7, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-44, -93, 38, 24);
  roundRect(g, -84, -66, 168, 60, 9, "#c9ccd1");
  g.fillStyle = "rgba(255,255,255,0.30)"; g.fillRect(-76, -65, 152, 3);
  // Большие красные фонари-трапеции
  for (const side of [-1, 1]) {
    g.fillStyle = "#c22020";
    g.beginPath();
    g.moveTo(side * 76, -62); g.lineTo(side * 34, -58);
    g.lineTo(side * 38, -40); g.lineTo(side * 76, -42);
    g.closePath(); g.fill();
    roundRect(g, side * 55 - 12, -54, 24, 8, 2, "#e8e6df");
  }
  roundRect(g, -5, -62, 10, 13, 2, "#15171a");            // эмблема
  g.fillStyle = "#c9d0d7"; g.fillRect(-1, -60, 2, 9);
  g.fillStyle = "#8a9096"; g.font = "bold 5px Verdana"; g.textAlign = "center";
  g.fillText("Z E F I R", 52, -34);
  plate(g, -36);
  roundRect(g, -84, -20, 168, 10, 5, "#b8bcc2");
}

// --- Lincoln MKZ: белый, светящаяся дуга во всю корму ---
function drawMkz(g) {
  carBase(g);
  roundRect(g, -54, -96, 108, 32, 8, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-46, -91, 40, 22);
  roundRect(g, -86, -66, 172, 60, 10, "#e8e6df");
  g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(-78, -65, 156, 3);
  g.fillStyle = "#8a9096"; g.font = "bold 6px Verdana"; g.textAlign = "center";
  g.fillText("L I N K O R N", 0, -58);
  // Светящаяся ДУГА: чуть изогнутая красная лента с хвостиками вверх
  g.strokeStyle = "#2a0d0d"; g.lineWidth = 11; g.lineCap = "round";
  g.beginPath(); g.moveTo(-76, -46); g.quadraticCurveTo(0, -56, 76, -46); g.stroke();
  g.strokeStyle = "#e82121"; g.lineWidth = 5;
  g.beginPath(); g.moveTo(-76, -46); g.quadraticCurveTo(0, -56, 76, -46); g.stroke();
  g.lineCap = "butt";
  plate(g, -38);
  roundRect(g, -86, -20, 172, 12, 5, "#3d4247");
  roundRect(g, -60, -15, 34, 6, 3, "#8a9096");
  roundRect(g,  26, -15, 34, 6, 3, "#8a9096");
}

// --- Koenigsegg Gemera: тёмный гиперкар с глазами-турбинами ---
function drawGemera(g) {
  carBase(g, -24, 30);
  // Крошечное стекло на макушке
  roundRect(g, -30, -94, 60, 18, 8, "#161b20");
  // Широченное покатое тело
  roundRect(g, -92, -78, 184, 72, 16, "#2e3436");
  g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(-82, -77, 164, 3);
  // Жёлтый значок на макушке
  roundRect(g, -4, -86, 8, 7, 2, "#e8c11c");
  g.fillStyle = "#8a9096"; g.font = "bold 5px Verdana"; g.textAlign = "center";
  g.fillText("K O N I S E G", 0, -66);
  // Два овальных «глаза»: красное кольцо, внутри — труба!
  for (const side of [-1, 1]) {
    g.fillStyle = "#15171a";
    g.beginPath(); g.ellipse(side * 52, -62, 13, 10, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#e82121"; g.lineWidth = 3;
    g.beginPath(); g.ellipse(side * 52, -62, 10, 7.5, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#000";
    g.beginPath(); g.arc(side * 52, -62, 4, 0, Math.PI * 2); g.fill();
  }
  // Огромные чёрные воздухозаборники по бокам
  roundRect(g, -86, -52, 34, 24, 10, "#0e1012");
  roundRect(g,  52, -52, 34, 24, 10, "#0e1012");
  // Подпись Gemera на центральной панели
  g.fillStyle = "#c9d0d7"; g.font = "italic bold 8px Verdana";
  g.fillText("Gemera", 0, -42);
  plate(g, -36, 36);
  // Диффузор с плавниками
  roundRect(g, -70, -20, 140, 12, 4, "#101214");
  g.fillStyle = "#0a0c0e";
  for (const x of [-52, -28, -4, 20, 44]) {
    g.beginPath();
    g.moveTo(x, -6); g.lineTo(x + 10, -6); g.lineTo(x + 7, -22); g.lineTo(x + 3, -22);
    g.closePath(); g.fill();
  }
}

// --- Pagani Huayra BC: роскошь с крылом-этажеркой ---
function drawWayra(g) {
  carBase(g, -24, 30);
  // ОГРОМНОЕ крыло на стойках
  roundRect(g, -88, -108, 176, 10, 4, "#15171a");
  roundRect(g, -56, -98, 8, 22, 3, "#26292d");
  roundRect(g,  48, -98, 8, 22, 3, "#26292d");
  // Зеркальца-ушки над крылом
  g.fillStyle = "#39c2d7";
  g.beginPath(); g.ellipse(-80, -112, 7, 4, -0.4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse( 80, -112, 7, 4,  0.4, 0, Math.PI * 2); g.fill();
  // Серебристое стекло-купол
  roundRect(g, -34, -96, 68, 20, 9, "#1a2026");
  // Широкое серебристое тело
  roundRect(g, -92, -80, 184, 74, 15, "#c9ccd1");
  g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(-82, -79, 164, 3);
  // Полоса-триколор по центру капота
  g.fillStyle = "#1f5fd6"; g.fillRect(-4, -80, 3, 22);
  g.fillStyle = "#e8e6df"; g.fillRect(-1, -80, 2, 22);
  g.fillStyle = "#c22020"; g.fillRect(1, -80, 3, 22);
  // Четыре круглых фонаря — по два в чёрных нишах
  for (const side of [-1, 1]) {
    roundRect(g, side * 62 - 20, -74, 40, 22, 8, "#15171a");
    for (const dx of [-9, 9]) {
      g.fillStyle = "#3d0a0a";
      g.beginPath(); g.arc(side * 62 + dx, -63, 7.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#e82121"; g.lineWidth = 2.5;
      g.beginPath(); g.arc(side * 62 + dx, -63, 5.5, 0, Math.PI * 2); g.stroke();
    }
  }
  // ЧЕТЫРЕ трубы букетом в центре (фирменный знак Пагани!)
  roundRect(g, -16, -72, 32, 26, 8, "#0e1012");
  g.fillStyle = "#26292d";
  for (const [dx, dy] of [[-6, -64], [6, -64], [-6, -54], [6, -54]]) {
    g.beginPath(); g.arc(dx, dy, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#000";
    g.beginPath(); g.arc(dx, dy, 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#26292d";
  }
  // Подпись-росчерк
  g.fillStyle = "#e8e6df"; g.font = "italic bold 8px Verdana"; g.textAlign = "center";
  g.fillText("Wayra BC", 0, -34);
  // Карбоновый низ и диффузор-гребёнка
  roundRect(g, -92, -28, 184, 20, 8, "#141618");
  g.fillStyle = "#0a0c0e";
  for (const x of [-72, -50, -28, 20, 42, 64]) {
    g.beginPath();
    g.moveTo(x, -4); g.lineTo(x + 10, -4); g.lineTo(x + 7, -26); g.lineTo(x + 3, -26);
    g.closePath(); g.fill();
  }
  // Красный стоп-огонёк по центру диффузора
  g.fillStyle = "#e82121";
  g.beginPath(); g.arc(0, -22, 4, 0, Math.PI * 2); g.fill();
  plate(g, -46, 34);
}

// --- SSC Tuatara: белая капля-ракета (по фото Саши, MAX 320) ---
function drawTuatara(g) {
  carBase(g, -24, 30);
  // Два плавника-гребня, спускающиеся с крыши на корму
  g.fillStyle = "#e2e4e0";
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(side * 26, -104);
    g.lineTo(side * 40, -60);
    g.lineTo(side * 30, -58);
    g.lineTo(side * 20, -100);
    g.closePath(); g.fill();
  }
  // Узкое стекло-купол между плавниками
  roundRect(g, -22, -102, 44, 18, 8, "#1a2026");
  // Обтекаемое белое тело-капля
  roundRect(g, -90, -78, 180, 72, 16, "#f2f3f0");
  g.fillStyle = "rgba(255,255,255,0.45)"; g.fillRect(-80, -77, 160, 3);
  // Тёмная ниша во всю корму и ЛЕНТА огня от края до края
  roundRect(g, -78, -68, 156, 20, 8, "#1d2023");
  roundRect(g, -72, -63, 144, 7, 3, "#e82121");
  g.fillStyle = "#ff6b4a";
  g.fillRect(-72, -61, 144, 2);
  // Эмблемка по центру над лентой
  roundRect(g, -8, -74, 16, 5, 2, "#8a9096");
  // Две круглые трубы по центру под нишей
  g.fillStyle = "#15171a";
  g.beginPath(); g.arc(-9, -38, 7, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc( 9, -38, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#000";
  g.beginPath(); g.arc(-9, -38, 4.5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc( 9, -38, 4.5, 0, Math.PI * 2); g.fill();
  // Чёрный диффузор-гребёнка
  roundRect(g, -88, -26, 176, 18, 7, "#141618");
  g.fillStyle = "#0a0c0e";
  for (const x of [-68, -46, -24, 16, 38, 60]) {
    g.beginPath();
    g.moveTo(x, -4); g.lineTo(x + 10, -4); g.lineTo(x + 7, -24); g.lineTo(x + 3, -24);
    g.closePath(); g.fill();
  }
  plate(g, -22, 34);
}

// Трёхлучевая звезда в кольце (для всех Мерседесов)
function mercStar(g, x, y, r, color = "#c9d0d7") {
  g.strokeStyle = color;
  g.lineWidth = Math.max(1.4, r * 0.22);
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  g.beginPath();
  for (const a of [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]) {
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.stroke();
}

// --- Mercedes 190E Evo: чёрная классика с спойлером ---
function drawMerc190(g) {
  carBase(g);
  roundRect(g, -56, -100, 112, 36, 6, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-48, -95, 42, 26);
  roundRect(g, -84, -66, 168, 60, 8, "#1a1c20");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-76, -65, 152, 3);
  // Спойлер на кромке багажника (Evo!)
  roundRect(g, -60, -70, 120, 7, 3, "#0e1013");
  // Широкие двухсекционные фонари: янтарь снаружи, красный внутри
  for (const side of [-1, 1]) {
    roundRect(g, side * 56 - 24, -58, 48, 15, 3, "#1c1f23");
    roundRect(g, side * 74 - 4,  -55, 12, 9, 1, "#ffb35c");
    roundRect(g, side * 52 - 18, -55, 30, 9, 1, "#c22020");
  }
  mercStar(g, 0, -52, 7);
  g.fillStyle = "#c9d0d7"; g.font = "bold 6px Verdana"; g.textAlign = "center";
  g.fillText("190 E", -58, -38);
  g.fillText("2.5-16", 58, -38);
  plate(g, -42);
  roundRect(g, -84, -24, 168, 13, 5, "#26292d");
}

// --- Mercedes-AMG GT 53: матовый фастбек с крылом ---
function drawAmgGt53(g) {
  carBase(g, -26, 32);
  // Крыло на кромке
  roundRect(g, -64, -92, 128, 8, 4, "#26292d");
  roundRect(g, -30, -86, 60, 5, 2, "#3a3f45");
  // Покатое стекло
  roundRect(g, -48, -84, 96, 20, 8, "#1a2026");
  roundRect(g, -88, -68, 176, 62, 12, "#5a5e63");
  g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(-80, -67, 160, 3);
  // Узкие изогнутые фонари
  for (const side of [-1, 1]) {
    roundRect(g, side * 56 - 26, -58, 52, 9, 4, "#2a0d0d");
    roundRect(g, side * 56 - 23, -56, 46, 5, 2, "#e82121");
  }
  mercStar(g, 0, -50, 6);
  g.fillStyle = "#c9d0d7"; g.font = "bold 5px Verdana"; g.textAlign = "center";
  g.fillText("AMJ", -66, -44); g.fillText("GT 53", 66, -44);
  plate(g, -40, 40);
  // Чёрный диффузор и ЧЕТЫРЕ трубы парами
  roundRect(g, -88, -24, 176, 16, 6, "#191b1e");
  for (const side of [-1, 1]) {
    for (const dx of [-8, 8]) {
      g.strokeStyle = "#c9d0d7"; g.lineWidth = 2.5;
      g.beginPath(); g.arc(side * 58 + dx, -15, 5.5, 0, Math.PI * 2); g.stroke();
    }
  }
}

// --- Mercedes-Maybach S: двухцветная роскошь ---
function drawMaybach(g) {
  carBase(g);
  // Верх (крыша и стойки) — чёрный, стекло огромное
  roundRect(g, -58, -104, 116, 34, 8, "#101214");
  roundRect(g, -52, -100, 104, 28, 6, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-44, -96, 40, 20);
  // Чёрная кромка багажника переходит в белый низ
  roundRect(g, -82, -72, 164, 14, 6, "#101214");
  roundRect(g, -84, -62, 168, 56, 8, "#ece9e2");
  g.fillStyle = "rgba(255,255,255,0.5)"; g.fillRect(-76, -61, 152, 2);
  // Узкие фонари на стыке цветов
  for (const side of [-1, 1]) {
    roundRect(g, side * 60 - 20, -66, 40, 8, 4, "#2a0d0d");
    roundRect(g, side * 60 - 17, -64, 34, 4, 2, "#e82121");
  }
  mercStar(g, 0, -66, 6, "#e8e2d2");
  g.fillStyle = "#8f8a7c"; g.font = "bold 5px Verdana"; g.textAlign = "center";
  g.fillText("M A Y B A X", 0, -50);
  plate(g, -44);
  // Хромовые прямоугольные насадки труб
  roundRect(g, -84, -20, 168, 10, 5, "#dcd9d2");
  roundRect(g, -62, -18, 30, 7, 3, "#b9bec6");
  roundRect(g,  32, -18, 30, 7, 3, "#b9bec6");
  roundRect(g, -58, -16.5, 22, 4, 2, "#26292d");
  roundRect(g,  36, -16.5, 22, 4, 2, "#26292d");
}

// --- Mercedes GLE Coupe: белый купе-внедорожник ---
function drawGle(g) {
  carBase(g, -28, 34);
  // Покатая крыша-купе
  roundRect(g, -52, -104, 104, 30, 12, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-44, -99, 40, 20);
  roundRect(g, -84, -80, 168, 74, 11, "#f2f3f0");
  g.fillStyle = "rgba(0,0,0,0.05)"; g.fillRect(-84, -48, 168, 3);
  // Широкие фонари + хромовая планка между ними
  for (const side of [-1, 1]) {
    roundRect(g, side * 58 - 22, -70, 44, 14, 5, "#7a1216");
    roundRect(g, side * 58 - 18, -67, 36, 8, 3, "#d42323");
  }
  roundRect(g, -34, -66, 68, 4, 2, "#c9d0d7");
  mercStar(g, 0, -54, 6, "#8a9096");
  plate(g, -44, 40);
  // Хромовая защита в бампере
  roundRect(g, -84, -24, 168, 15, 6, "#e2e4e0");
  roundRect(g, -60, -20, 26, 8, 3, "#b9bec6");
  roundRect(g,  34, -20, 26, 8, 3, "#b9bec6");
}

// --- Peugeot 308 R: матовый хот-хэтч с красной крышей ---
function drawPejo308(g) {
  carBase(g, -28, 34);
  // Красная крыша (фишка концепта R!)
  roundRect(g, -54, -108, 108, 12, 5, "#c22020");
  roundRect(g, -52, -98, 104, 30, 6, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-44, -93, 40, 20);
  roundRect(g, -82, -70, 164, 64, 10, "#4d5156");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-74, -69, 148, 3);
  // Чёрная панель с фонарями-когтями и львом
  roundRect(g, -70, -62, 140, 16, 5, "#191b1e");
  for (const side of [-1, 1]) {
    roundRect(g, side * 48 - 18, -59, 36, 10, 3, "#5c1216");
    for (const dx of [-12, -2, 8])   // три «когтя» льва
      roundRect(g, side * 48 + dx, -57, 4, 6, 1, "#e82121");
  }
  // Лев на чёрном щитке
  g.fillStyle = "#c9d0d7"; g.font = "bold 7px Verdana"; g.textAlign = "center";
  g.fillText("🦁", 0, -52);
  g.fillStyle = "#e82121"; g.font = "italic bold 9px Verdana";
  g.fillText("308 R", -52, -38);
  plate(g, -40, 40);
  // Бампер с двумя овальными трубами в красной окантовке
  roundRect(g, -82, -24, 164, 15, 6, "#3a3f45");
  for (const side of [-1, 1]) {
    g.strokeStyle = "#c22020"; g.lineWidth = 2;
    g.beginPath(); g.ellipse(side * 56, -16, 13, 6, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#8a9096";
    g.beginPath(); g.ellipse(side * 56, -16, 10, 4, 0, 0, Math.PI * 2); g.fill();
  }
}

// --- ГАЗ-3110 Волга: белая рабочая лошадка ---
function drawVolga3110(g) {
  carBase(g);
  roundRect(g, -56, -100, 112, 36, 6, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-48, -95, 42, 26);
  roundRect(g, -84, -66, 168, 60, 9, "#f2f3f0");
  g.fillStyle = "rgba(0,0,0,0.05)"; g.fillRect(-84, -42, 168, 3);
  // БОЛЬШИЕ оранжево-красные фонари (фишка 3110!)
  for (const side of [-1, 1]) {
    roundRect(g, side * 58 - 24, -60, 48, 18, 4, "#1c1f23");
    roundRect(g, side * 58 - 21, -57, 20, 12, 2, "#e85a1a");
    roundRect(g, side * 58 + 1,  -57, 20, 12, 2, "#c22020");
  }
  // Эмблема-олень в овале
  g.strokeStyle = "#8a9096"; g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(0, -56, 6, 8, 0, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#8a9096"; g.font = "bold 6px Verdana"; g.textAlign = "center";
  g.fillText("ВОЛГА", -55, -34);
  g.fillText("3110", 55, -34);
  plate(g, -44);
  roundRect(g, -84, -24, 168, 13, 5, "#26292d");
}

// --- ГАЗ-24 Волга: серебристая классика ---
function drawVolga24(g) {
  carBase(g);
  // Огромное стекло в хромовой рамке
  roundRect(g, -60, -104, 120, 40, 5, "#1a2026");
  g.strokeStyle = "#d7dce2"; g.lineWidth = 2;
  g.strokeRect(-60, -104, 120, 40);
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-52, -99, 46, 30);
  roundRect(g, -86, -66, 172, 60, 6, "#c9ccd1");
  g.fillStyle = "rgba(255,255,255,0.3)"; g.fillRect(-78, -65, 156, 3);
  // Хромовый молдинг через корму
  roundRect(g, -80, -46, 160, 3, 1, "#d7dce2");
  // Вертикальные фонари по углам: красный + янтарь
  for (const side of [-1, 1]) {
    roundRect(g, side * 74 - 7, -62, 14, 24, 2, "#1c1f23");
    roundRect(g, side * 74 - 5, -60, 10, 11, 1, "#c22020");
    roundRect(g, side * 74 - 5, -48, 10, 8, 1, "#ffb35c");
    // Оранжевые катафоты ближе к центру
    roundRect(g, side * 44 - 6, -42, 12, 8, 2, "#e85a1a");
  }
  g.fillStyle = "#8a9096"; g.font = "italic bold 6px Verdana"; g.textAlign = "center";
  g.fillText("Волга", 48, -52);
  plate(g, -58, 40);
  // Массивный хромовый бампер с чёрными клыками
  roundRect(g, -90, -30, 180, 12, 4, "#d7dce2");
  roundRect(g, -60, -32, 10, 6, 2, "#26292d");
  roundRect(g,  50, -32, 10, 6, 2, "#26292d");
}

// --- ГАЗ-21 Волга: розовая с белой крышей ---
function drawVolga21(g) {
  carBase(g);
  // Белая округлая крыша
  roundRect(g, -54, -108, 108, 18, 9, "#f2f3f0");
  roundRect(g, -50, -100, 100, 32, 8, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-42, -95, 38, 22);
  // Округлый розовый кузов
  roundRect(g, -82, -70, 164, 64, 14, "#e8a8c8");
  g.fillStyle = "rgba(255,255,255,0.3)"; g.fillRect(-74, -69, 148, 3);
  // Хромовая полоска и «чайка» на багажнике
  roundRect(g, -60, -52, 120, 2.5, 1, "#d7dce2");
  g.strokeStyle = "#d7dce2"; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-14, -58); g.quadraticCurveTo(0, -66, 0, -58);
  g.quadraticCurveTo(0, -66, 14, -58);
  g.stroke();
  // Круглые фонарики
  for (const side of [-1, 1]) {
    g.fillStyle = "#7a1216";
    g.beginPath(); g.arc(side * 64, -50, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#d42323";
    g.beginPath(); g.arc(side * 64, -50, 4.5, 0, Math.PI * 2); g.fill();
  }
  plate(g, -44, 40);
  // Пузатый хромовый бампер
  roundRect(g, -88, -28, 176, 14, 7, "#d7dce2");
  g.fillStyle = "rgba(0,0,0,0.15)"; g.fillRect(-88, -21, 176, 2);
}

// --- Kia Sportage: красный кроссовер ---
function drawSportage(g) {
  carBase(g, -28, 34);
  roundRect(g, -54, -106, 108, 34, 9, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-46, -100, 42, 22);
  roundRect(g, -80, -76, 160, 70, 11, "#c5232c");
  g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(-72, -75, 144, 3);
  // Хромовая планка над эмблемой KIWI
  roundRect(g, -46, -68, 92, 3, 1, "#d7dce2");
  g.strokeStyle = "#d7dce2"; g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(0, -58, 11, 6, 0, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#d7dce2"; g.font = "bold 6px Verdana"; g.textAlign = "center";
  g.fillText("KIWI", 0, -56);
  // Узкие фонари-уголки
  for (const side of [-1, 1]) {
    roundRect(g, side * 62 - 16, -66, 32, 12, 4, "#5c1216");
    roundRect(g, side * 62 - 13, -63, 26, 6, 2, "#e82121");
  }
  g.fillStyle = "#d7a8ac"; g.font = "bold 5px Verdana";
  g.fillText("SPORTAGE", -52, -44);
  plate(g, -46, 40);
  // Чёрный низ и серебристая защита с овальными трубами
  roundRect(g, -80, -26, 160, 17, 6, "#26292d");
  roundRect(g, -36, -20, 72, 8, 4, "#b9bec6");
  for (const side of [-1, 1]) {
    g.fillStyle = "#8a9096";
    g.beginPath(); g.ellipse(side * 58, -17, 11, 5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#26292d";
    g.beginPath(); g.ellipse(side * 58, -17, 8, 3, 0, 0, Math.PI * 2); g.fill();
  }
}

// --- Kia K5: синий, фонарь-пунктир через корму ---
function drawK5(g) {
  carBase(g);
  roundRect(g, -52, -96, 104, 32, 9, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-44, -91, 40, 22);
  roundRect(g, -86, -66, 172, 60, 10, "#1d3f96");
  g.fillStyle = "rgba(255,255,255,0.16)"; g.fillRect(-78, -65, 156, 3);
  // Лента-пунктир: тёмная ниша и косые красные чёрточки ////
  roundRect(g, -76, -58, 152, 12, 6, "#141827");
  g.fillStyle = "#e82121";
  for (let x = -70; x <= 64; x += 9) {
    g.beginPath();
    g.moveTo(x, -49); g.lineTo(x + 4, -56); g.lineTo(x + 7, -56); g.lineTo(x + 3, -49);
    g.closePath(); g.fill();
  }
  g.fillStyle = "#9bb0e8"; g.font = "bold 5px Verdana"; g.textAlign = "center";
  g.fillText("K5", -62, -38); g.fillText("GT", 62, -38);
  plate(g, -40);
  // Чёрный диффузор с двумя трапециями труб
  roundRect(g, -86, -22, 172, 14, 6, "#191b1e");
  roundRect(g, -62, -17, 28, 7, 2, "#8a9096");
  roundRect(g,  34, -17, 28, 7, 2, "#8a9096");
}

// --- Hyundai Sonata: чёрный, лента и имя по буквам ---
function drawSonata(g) {
  carBase(g);
  roundRect(g, -54, -96, 108, 32, 10, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(-46, -91, 40, 22);
  roundRect(g, -86, -66, 172, 60, 10, "#17191c");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-78, -65, 156, 3);
  // Светящаяся лента с загнутыми вверх краями
  g.strokeStyle = "#e82121"; g.lineWidth = 4; g.lineCap = "round";
  g.beginPath();
  g.moveTo(-74, -60); g.quadraticCurveTo(-70, -52, -58, -52);
  g.lineTo(58, -52); g.quadraticCurveTo(70, -52, 74, -60);
  g.stroke();
  g.lineCap = "butt";
  // Эмблема H в овале и S O N A T A по буквам
  g.strokeStyle = "#c9d0d7"; g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(0, -60, 9, 5.5, 0, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#c9d0d7"; g.font = "italic bold 6px Verdana"; g.textAlign = "center";
  g.fillText("H", 0, -58);
  g.font = "bold 7px Verdana";
  g.fillText("S O N A T A", 0, -42);
  plate(g, -38);
  roundRect(g, -86, -20, 172, 11, 5, "#101214");
  roundRect(g,  40, -16, 26, 6, 3, "#8a9096");   // двойная труба справа
}

// --- Hyundai Tucson: версия 2 («не похож» © Саша) — полоса во всю
// ширину, крупные зигзаги-стрелки, эмблема H прямо НА СТЕКЛЕ ---
function drawTucson(g) {
  carBase(g, -28, 34);
  roundRect(g, -62, -114, 124, 11, 4, "#4e5a58");   // спойлер (дворник под ним!)
  roundRect(g, -56, -105, 112, 36, 7, "#161c1e");
  g.fillStyle = "rgba(255,255,255,0.07)"; g.fillRect(-48, -100, 44, 26);
  // Эмблема H на стекле (как на фото!)
  g.strokeStyle = "#c9d0d7"; g.lineWidth = 1.6;
  g.beginPath(); g.ellipse(0, -88, 11, 7, 0, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#c9d0d7"; g.font = "italic bold 8px Verdana"; g.textAlign = "center";
  g.fillText("H", 0, -85);
  // Кузов
  roundRect(g, -80, -72, 160, 66, 10, "#5c6a68");
  g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(-72, -71, 144, 3);
  // Тонкая красная полоса ВО ВСЮ ширину — соединяет фонари
  roundRect(g, -74, -68, 148, 4, 2, "#c22020");
  // Фонари-ЛЕЗВИЯ (версия 3, правка Саши): от полосы вниз к центру
  // свисают по два тонких косых лезвия с острым кончиком
  g.lineCap = "butt";
  for (const side of [-1, 1]) {
    // Оба лезвия одной длины и параллельны (правка Саши)
    for (const [xt, xb, yb] of [[72, 55, -42], [58, 41, -42]]) {
      // тёмная окантовка
      g.strokeStyle = "#2a0d0d"; g.lineWidth = 8;
      g.beginPath();
      g.moveTo(side * xt, -66); g.lineTo(side * xb, yb);
      g.stroke();
      // красное свечение
      g.strokeStyle = "#e82121"; g.lineWidth = 4;
      g.beginPath();
      g.moveTo(side * xt, -66); g.lineTo(side * (xb + 1), yb - 2);
      g.stroke();
      // острый кончик, смотрящий к номеру
      g.fillStyle = "#e82121";
      g.beginPath();
      g.moveTo(side * (xb + 2), yb - 4);
      g.lineTo(side * (xb - 6), yb + 3);
      g.lineTo(side * (xb + 5), yb + 1);
      g.closePath(); g.fill();
    }
  }
  // Номер высоко на двери, надписи по бокам
  plate(g, -62, 40);
  g.fillStyle = "#c9d0d7"; g.font = "bold 5px Verdana";
  g.fillText("HYONDAI", -52, -30);
  g.font = "italic bold 5px Verdana";
  g.fillText("Tucson", 52, -30);
  // Чёрный низ, БОЛЬШАЯ серебристая защита-ромб, трубы справа
  roundRect(g, -80, -26, 160, 17, 6, "#23272a");
  roundRect(g, -42, -22, 84, 11, 5, "#b9bec6");
  g.fillStyle = "rgba(0,0,0,0.12)";
  for (let x = -38; x < 40; x += 8) g.fillRect(x, -20, 4, 7);
  roundRect(g, 46, -21, 24, 9, 2, "#8a9096");
  g.fillStyle = "#101214"; g.fillRect(49, -19, 8, 5); g.fillRect(59, -19, 8, 5);
  // Красные вертикальные катафоты в углах бампера
  roundRect(g, -78, -24, 4, 13, 2, "#c22020");
  roundRect(g,  74, -24, 4, 13, 2, "#c22020");
}

// --- Hyundai i30: серебристый хэтчбек-кругляш ---
function drawI30(g) {
  carBase(g, -26, 32);
  roundRect(g, -58, -104, 116, 42, 16, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-48, -98, 44, 30);
  roundRect(g, -78, -70, 156, 64, 14, "#c9ccd1");
  g.fillStyle = "rgba(255,255,255,0.3)"; g.fillRect(-70, -69, 140, 3);
  // Эмблема H
  g.strokeStyle = "#8a9096"; g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(0, -56, 9, 5.5, 0, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#8a9096"; g.font = "italic bold 6px Verdana"; g.textAlign = "center";
  g.fillText("H", 0, -54);
  g.fillText("i30", 58, -50);
  // Округлые красно-оранжевые фонари
  for (const side of [-1, 1]) {
    roundRect(g, side * 64 - 11, -62, 22, 20, 8, "#7a1216");
    roundRect(g, side * 64 - 8,  -59, 16, 8, 3, "#d42323");
    roundRect(g, side * 64 - 8,  -50, 16, 5, 2, "#ffb35c");
  }
  // Синяя табличка HYONDAI i30 под номером
  plate(g, -42, 40);
  roundRect(g, -24, -27, 48, 7, 2, "#1d3f96");
  g.fillStyle = "#fff"; g.font = "bold 5px Verdana";
  g.fillText("HYONDAI i30", 0, -21.5);
  roundRect(g, -78, -18, 156, 9, 4, "#b8bcc2");
}

const CAR_DRAWERS = {
  aveo: drawAveo, picanto: drawPicanto, focus: drawFocus,
  delorean: drawDelorean, corsa: drawCorsa,
  camaro70: drawCamaro70, camaroNew: drawCamaroNew,
  vetteC1: drawVetteC1, vetteC8: drawVetteC8,
  shelby: drawShelby, darkhorse: drawDarkHorse,
  fford: drawFFord, f1: drawF1, zis: drawZis,
  disco: drawDisco, hilux: drawHilux, rav4: drawRav4,
  buhanka: drawBuhanka, raf: drawRaf,
  kopeyka: drawKopeyka, semerka: drawSemerka, chetverka: drawChetverka,
  challenger: drawChallenger, charger14: drawCharger14,
  charger69: drawCharger69, durango: drawDurango,
  escalade: drawEscalade, sixteen: drawSixteen, cruze: drawCruze,
  ecosport: drawEcoSport, kuga: drawKuga, fordgt: drawFordGT,
  nautilus: drawNautilus, continental17: drawContinental17,
  mark5: drawMark5, lincoln60: drawLincoln60, navigator: drawNavigator,
  zephyr: drawZephyr, mkz: drawMkz,
  gemera: drawGemera, wayra: drawWayra, tuatara: drawTuatara,
  merc190: drawMerc190, amggt53: drawAmgGt53, maybach: drawMaybach,
  gle: drawGle,
  pejo308: drawPejo308, volga3110: drawVolga3110,
  volga24: drawVolga24, volga21: drawVolga21,
  sportage: drawSportage, k5: drawK5, sonata: drawSonata,
  tucson: drawTucson, i30: drawI30,
};

// Огненный след: два пылающих следа за колёсами, три слоя пламени
// (тёмно-оранжевый → оранжевый → жёлтая сердцевина) + искры
function renderFireTrail() {
  const t = performance.now();
  // Огонь горит: у Делориана — после 88 миль/ч, у ЗИСа — все 5 секунд
  // стартового ускорителя (идея Саши: танк стартует В ОГНЕ!)
  const until = Math.max(fireTrailUntil, zisBoostActive() ? shieldUntil : 0);
  if (t > until) return;
  const fade = Math.min(1, (until - t) / 800); // плавно гаснет
  const layers = [
    [22, "rgba(255, 80, 10, 0.55)"],
    [12, "rgba(255, 150, 20, 0.75)"],
    [5,  "rgba(255, 230, 120, 0.9)"],
  ];
  ctx.save();
  ctx.globalAlpha = fade;
  for (const side of [-1, 1]) {
    const xTop = W / 2 + side * 58;    // под колесом (машина теперь меньше)
    const xBot = W / 2 + side * 135;   // расходится к краю экрана
    const flick = Math.sin(t / 38 + side * 7) * 5;  // пламя дрожит!
    for (const [w, color] of layers) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(xTop - w / 2 + flick / 2, H - 64);
      ctx.lineTo(xTop + w / 2 + flick / 2, H - 64);
      ctx.lineTo(xBot + w * 1.7 + flick, H);
      ctx.lineTo(xBot - w * 1.7 + flick, H);
      ctx.closePath();
      ctx.fill();
    }
    // искры над следом
    for (let i = 0; i < 6; i++) {
      const p = Math.random();
      ctx.fillStyle = Math.random() < 0.5 ? "#ffd23f" : "#ff8c1a";
      ctx.fillRect(
        xTop + (xBot - xTop) * p + (Math.random() - 0.5) * 26,
        H - 64 + 64 * p - Math.random() * 14, 3, 3);
    }
  }
  // Надпись-пасхалка — только у Делориана (у ЗИСа своя, про ускоритель)
  if (t < fireTrailUntil) {
    ctx.globalAlpha = fade;
    ctx.fillStyle = "#ffd23f";
    ctx.font = "italic bold 20px Verdana";
    ctx.textAlign = "center";
    ctx.fillText("⚡ 88 МИЛЬ В ЧАС! ⚡", W / 2, H / 2 - 40);
  }
  ctx.restore();
}

// Машина игрока на дороге: тряска, наклон в повороте — и рисуем текущую
function renderPlayer() {
  const speedPercent = speed / car.maxSpeed;
  // Лёгкое дрожание на скорости, и сильная тряска на траве!
  const offroad = playerX < -1 || playerX > 1;
  const shake = offroad && speed > OFFROAD_LIMIT ? 3 : speedPercent * 1.2;
  const bounceX = (Math.random() - 0.5) * 2 * shake;
  const bounceY = (Math.random() - 0.5) * 2 * shake;

  ctx.save();
  // Машина меньше и выше (правка Саши): как будто камера отъехала
  // назад. Размер подобран ПО ПЕРСПЕКТИВЕ: на этой строке экрана
  // соперники ~165 px шириной — и мы такие же, никто не великан
  ctx.translate(W / 2 + bounceX, H - 56 + bounceY);
  ctx.rotate(steer * 0.05);          // наклон в повороте
  ctx.scale(0.72, 0.72);
  drawCarTuned(ctx, car.id, getTun(car.id));   // со всем тюнингом!
  ctx.restore();

  // Пузырь щита вокруг нашей машины (у ЗИСа щита нет — ему не нужен!)
  if (shieldActive() && !car.ram) {
    const pulse = 1 + Math.sin(performance.now() / 120) * 0.04;
    ctx.strokeStyle = "rgba(90, 190, 255, 0.85)";
    ctx.fillStyle = "rgba(90, 190, 255, 0.10)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(W / 2, H - 108, 88 * pulse, 52 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

// ---------- Спидометр и надписи ----------
function renderHUD() {
  const kmh = Math.round(speed / KMH);

  // Табличка спидометра
  ctx.fillStyle = "rgba(10, 10, 20, 0.55)";
  ctx.beginPath();
  ctx.roundRect(16, 14, 168, 54, 12);
  ctx.fill();

  ctx.fillStyle = kmh > car.topKmh * 0.87 ? "#ff5050" : "#ffffff";
  ctx.font = "bold 34px Verdana";
  ctx.textAlign = "right";
  ctx.fillText(String(kmh), 118, 54);
  ctx.fillStyle = "#ffd23f";
  ctx.font = "bold 15px Verdana";
  ctx.textAlign = "left";
  ctx.fillText("км/ч", 126, 52);

  // ---------- Мини-карта трассы под спидометром (идея Саши) ----------
  if (trackMapPts && trackMapPts.length > 1) {
    const mx = 16, my = 76, mw = 168, mh = 116, pad = 14;
    ctx.fillStyle = "rgba(10, 10, 20, 0.45)";
    ctx.beginPath();
    ctx.roundRect(mx, my, mw, mh, 10);
    ctx.fill();
    const mapX = (i) => mx + pad + trackMapPts[i][0] * (mw - 2 * pad);
    const mapY = (i) => my + pad + trackMapPts[i][1] * (mh - 2 * pad);
    // Контур трассы
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(mapX(0), mapY(0));
    for (let i = 1; i < trackMapPts.length; i++) ctx.lineTo(mapX(i), mapY(i));
    if (raceKind === "circuit") ctx.closePath();  // кольцо замыкаем
    ctx.stroke();
    // Старт/финиш — жёлтая метка
    ctx.fillStyle = "#ffd23f";
    ctx.fillRect(mapX(0) - 3, mapY(0) - 3, 6, 6);
    const dotAt = (z, r, fill) => {
      const i = Math.min(trackMapPts.length - 1,
        Math.max(0, Math.floor(((z % trackLength) + trackLength) % trackLength / SEG_LEN)));
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(mapX(i), mapY(i), r, 0, Math.PI * 2);
      ctx.fill();
    };
    // Соперники — тёмные точки, друг — зелёная, мы — красная с обводкой
    for (const o of opponents) dotAt(o.z, 3, "#20242e");
    if (mpRemote) dotAt(mpRemote.z, 3.5, "#57d977");
    dotAt(position, 4.5, "#ff3131");
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Название игры
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "italic bold 15px Verdana";
  ctx.textAlign = "right";
  ctx.fillText("I NEED SPEED 1: First Racing", W - 18, 30);
  ctx.fillStyle = "rgba(155, 224, 255, 0.9)";
  ctx.font = "13px Verdana";
  ctx.fillText(car.name, W - 18, 50);
  // Категория коробки машины — по системе Саши (А / М / С)
  ctx.fillStyle = "rgba(255, 210, 63, 0.9)";
  ctx.fillText("Коробка: " + car.gearbox, W - 18, 68);
  // Текущая трасса (или драг-полоса)
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("Трасса: " + (raceKind === "drag" ? "Драг-полоса"
    : raceKind === "highway" ? "Шоссе" : TRACK_NAMES[currentTrack]),
    W - 18, 88);
  // Подсказки про клавиши — только там, где есть клавиатура!
  // На телефоне их прячем (решение Саши): там свои кнопки
  if (raceKind === "circuit" && !isTouchDevice) {
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "11px Verdana";
    ctx.fillText("T — сменить трассу", W - 18, 104);
  }

  // Коробка передач и подсказка про звук.
  // A = автомат, M = ручная. На отсечке передача краснеет!
  const drive = getGearAndRpm();
  // У электрички (Э) вместо передачи — D, как на настоящем селекторе
  const gearText = !engineOn ? "—"
    : car.gearbox === "Э" ? "D"
    : (manualMode ? "M" : "A") + drive.gear;
  // Подсказки показывают клавиши, которые игрок выбрал в настройках!
  const boxHint = car.gearbox === "Э" ? "электро: коробки нет!"
    : manualMode
    ? `${keyLabel(binds.gearDown[0])} — ниже, ${keyLabel(binds.gearUp[0])} — выше` +
      (car.gearbox === "С" ? `, ${keyLabel(binds.gearbox[0])} — автомат` : " (механика!)")
    : car.gearbox === "С" ? `${keyLabel(binds.gearbox[0])} — ручная коробка` : "автомат";
  ctx.fillStyle = drive.rpm > 1 ? "#ff5050" : "rgba(255,255,255,0.85)";
  ctx.font = "bold 15px Verdana";
  ctx.textAlign = "left";
  ctx.fillText("Передача: " + gearText, 18, H - 36);
  if (!isTouchDevice) {
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "12px Verdana";
    ctx.fillText(boxHint, 155, H - 36);
  }

  // Режим поездки (фишка Корсы): ЭКО зелёный, НОРМА белый, СПОРТ красный
  if (car.modes && engineOn) {
    ctx.fillStyle = MODE_COLORS[driveMode];
    ctx.font = "bold 14px Verdana";
    ctx.fillText("Режим: " + MODE_NAMES[driveMode], 18, H - 58);
    if (!isTouchDevice) {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "12px Verdana";
      ctx.fillText(keyLabel(binds.mode[0]) + " — сменить режим", 160, H - 58);
    }
  }
  if (!isTouchDevice) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "12px Verdana";
    ctx.fillText(
      muted ? "🔇 M — включить звук"
            : `🔊 ${Math.round(soundVolume * 100)}%   M — выкл,  − / + — громкость`,
      18, H - 14);
  }

  // ---------- Шоссе: топливный бар ----------
  if (raceKind === "highway") {
    ctx.fillStyle = "rgba(10, 10, 20, 0.55)";
    ctx.beginPath();
    ctx.roundRect(W / 2 - 110, 14, 220, 36, 10);
    ctx.fill();
    // Полоска бака: зелёная → жёлтая → красная
    const f01 = fuel / 100;
    ctx.fillStyle = "#1c2030";
    ctx.fillRect(W / 2 - 60, 26, 150, 12);
    ctx.fillStyle = f01 > 0.5 ? "#57d977" : f01 > 0.2 ? "#ffd23f" : "#ff5050";
    ctx.fillRect(W / 2 - 60, 26, 150 * f01, 12);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 15px Verdana";
    ctx.textAlign = "left";
    ctx.fillText("⛽", W / 2 - 92, 39);
    // Подсказки заправки (цены Саши!)
    if (nearGas && fuel < 99.5) {
      ctx.fillStyle = "#57d977";
      ctx.font = "bold 18px Verdana";
      ctx.textAlign = "center";
      ctx.fillText(speed < KMH * 5
        ? `⛽ ${keyLabel(binds.refuelFull[0])} — полный бак (2 🪙)  ·  ${keyLabel(binds.refuelHalf[0])} — полбака (1 🪙)`
        : "⛽ Заправка! Остановись у колонки", W / 2, H / 2 + 60);
    }
    // Бак пуст — мигаем
    if (fuel <= 0 && Math.floor(performance.now() / 400) % 2 === 0) {
      ctx.fillStyle = "#ff5050";
      ctx.font = "bold 24px Verdana";
      ctx.textAlign = "center";
      ctx.fillText("⛽ БЕНЗИН КОНЧИЛСЯ!", W / 2, H / 2 - 40);
    }
    // Сообщения (эвакуатор и прочее)
    if (lapMsg && performance.now() < lapMsg.until) {
      ctx.fillStyle = "#ffd23f";
      ctx.font = "bold 20px Verdana";
      ctx.textAlign = "center";
      ctx.fillText(lapMsg.text, W / 2, H / 2 - 70);
    }
  }

  // ---------- Табло «Против рекорда» ----------
  if (taMode) {
    const rec = records[currentTrack];
    ctx.fillStyle = "rgba(10, 10, 20, 0.55)";
    ctx.beginPath();
    ctx.roundRect(W / 2 - 175, 14, 350, 36, 10);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px Verdana";
    ctx.textAlign = "center";
    ctx.fillText(
      `⏱ ${lapTime.toFixed(1)} с   ·   Рекорд: ${rec ? rec.time.toFixed(2) + " с (" + rec.car + ")" : "пока нет!"}`,
      W / 2, 38);

    // Сообщение после круга (новый рекорд или сравнение)
    if (lapMsg && performance.now() < lapMsg.until) {
      ctx.fillStyle = lapMsg.text.includes("РЕКОРД") ? "#ffd23f" : "#9be0ff";
      ctx.font = "bold 22px Verdana";
      ctx.fillText(lapMsg.text, W / 2, H / 2 - 60);
    }

    // Отсчёт и GO — как в гонке
    if (countdown > 0) {
      const num = Math.ceil(countdown);
      ctx.fillStyle = num === 3 ? "#ff5050" : num === 2 ? "#ff8c1a" : "#ffd23f";
      ctx.font = "italic bold 110px Verdana";
      ctx.fillText(num, W / 2, H / 2 + 30);
    } else if (countdown > -0.8) {
      ctx.fillStyle = "#57d977";
      ctx.font = "italic bold 110px Verdana";
      ctx.fillText("GO!", W / 2, H / 2 + 30);
    }
  }

  // ---------- Гоночный интерфейс ----------
  if (raceMode) {
    // Табло: круг и место
    const playerTotal = (playerLap - 1) * trackLength + position;
    const place = 1 + opponents.filter((o) => o.z > playerTotal).length;
    ctx.fillStyle = "rgba(10, 10, 20, 0.55)";
    ctx.beginPath();
    ctx.roundRect(W / 2 - 130, 14, 260, 36, 10);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px Verdana";
    ctx.textAlign = "center";
    ctx.fillText(raceKind === "drag"
      ? `⚡ ДРАГ-ДУЭЛЬ   Место ${place}/2`
      : `Круг ${Math.min(playerLap, RACE_LAPS)}/${RACE_LAPS}   Место ${place}/${opponents.length + 1}`,
      W / 2, 39);

    // Таймер щита под табло (а у ЗИСа вместо щита — ускоритель!)
    if (shieldActive()) {
      const left = Math.ceil((shieldUntil - performance.now()) / 1000);
      ctx.font = "bold 14px Verdana";
      if (car.ram) {
        ctx.fillStyle = "#ff8c1a";
        ctx.fillText(`🚀 Стартовый ускоритель: ${left} с — жми газ!`, W / 2, 66);
      } else {
        ctx.fillStyle = "#5abeff";
        ctx.fillText(`🛡 Щит: ${left} с  (от ЗИСа не спасает!)`, W / 2, 66);
      }
    }

    // Отсчёт 3-2-1 и GO!
    if (countdown > 0) {
      const num = Math.ceil(countdown);
      ctx.fillStyle = num === 3 ? "#ff5050" : num === 2 ? "#ff8c1a" : "#ffd23f";
      ctx.font = "italic bold 110px Verdana";
      ctx.fillText(num, W / 2, H / 2 + 30);
      ctx.font = "bold 16px Verdana";
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillText(`Заводи мотор (${keyLabel(binds.engine[0])}) и приготовься!`, W / 2, H / 2 + 70);
    } else if (countdown > -0.8) {
      ctx.fillStyle = "#57d977";
      ctx.font = "italic bold 110px Verdana";
      ctx.fillText("GO!", W / 2, H / 2 + 30);
    }
  }

  // Мотор не заведён — мигающая подсказка (мигание: каждые полсекунды).
  // Во время отсчёта не показываем — там своя подсказка, чтобы не в кучу
  if (started && !engineOn && !(raceMode && countdown > 0)) {
    if (engineStarting) {
      ctx.fillStyle = "#ffd23f";
      ctx.font = "bold 22px Verdana";
      ctx.textAlign = "center";
      ctx.fillText("Заводим...", W / 2, H / 2 + 40);
    } else if (Math.floor(performance.now() / 500) % 2 === 0) {
      ctx.fillStyle = "#ffd23f";
      ctx.font = "bold 22px Verdana";
      ctx.textAlign = "center";
      ctx.fillText(`🔑 Нажми ${keyLabel(binds.engine[0])} — заведи мотор!`, W / 2, H / 2 + 40);
    }
  }

  // Жмёшь тормоз на ЗИСе? Ха-ха. Педаль декоративная!
  if (car.noBrakes && pressBrake() && speed > KMH * 5) {
    ctx.fillStyle = "#ffdd30";
    ctx.font = "bold 20px Verdana";
    ctx.textAlign = "center";
    ctx.fillText("Тормоза?.. У брони НЕТ тормозов! 😄", W / 2, H / 2 + 60);
  }

  // Подсказка на траве (броневику и внедорожникам не показываем)
  if ((playerX < -1 || playerX > 1) && speed > OFFROAD_LIMIT
      && !car.ram && !car.offroadSoft) {
    ctx.fillStyle = "#ffdd30";
    ctx.font = "bold 20px Verdana";
    ctx.textAlign = "center";
    ctx.fillText("Трава! Вернись на дорогу!", W / 2, H / 2 + 60);
  }
}

// =====================================================================
//  ГЛАВНЫЙ ЦИКЛ: 60 раз в секунду обновляем физику и рисуем кадр
// =====================================================================

let lastTime = 0;

function frame(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.05); // защита от рывков
  lastTime = time;

  update(dt);
  updateSparks(dt);      // искры живут по своим законам даже в стоп-кадре
  updateEngineSound();

  ctx.clearRect(0, 0, W, H);
  renderBackground();
  renderRoad();
  renderFireTrail();   // огонь ПОД машиной — рисуем до неё
  renderPlayer();
  renderSparks();
  renderHUD();

  requestAnimationFrame(frame);
}

// Поехали!
buildTrack(0);
updateMoneyUI();
requestAnimationFrame(frame);
