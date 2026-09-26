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
    // МАШИНА ВРЕМЕНИ (идея Саши, 21.09): отдельный Делориан с
    // решётками из кино. НЕ продаётся — только за достижение
    // «88 миль в час»!
    id: "timemachine", name: "TimeLorean Машина Времени", gearbox: "С",
    topKmh: 201,      // лимит Саши: «макс 201 км ч»
    zeroTo100: 9.0,   // и разгон пободрее — время не ждёт!
    noNpc: true,   // уникум соперникам не выдаётся
    desc: "Награда за «88 миль в час»: решётки, огонь и путешествия во времени!",
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
  // ---- «Братья одиночкам» (идея Саши): по брату каждой марке-одиночке.
  // Кроме TMC: DeLorean был ЕДИНСТВЕННОЙ моделью марки — это его легенда!
  {
    id: "astro", name: "Opal Astro", gearbox: "С",
    topKmh: 190, zeroTo100: 10.5,
    desc: "Брат Корзы: серебристый хэтчбек на каждый день.",
  },
  {
    id: "cobra", name: "Shelbee Cobra", gearbox: "М",
    topKmh: 265, zeroTo100: 4.2,
    desc: "Открытая ракета 60-х: трубы торчат ИЗ БОКОВ. Брат Мустанго!",
  },
  {
    id: "defendor", name: "Sand Hover Defendor", gearbox: "М",
    topKmh: 145, zeroTo100: 14.0,
    offroadSoft: true,
    desc: "Квадратный брат Discoverry: запаска на двери, никаких компромиссов.",
  },
  {
    id: "pejo206", name: "Pejo 206", gearbox: "С",
    topKmh: 180, zeroTo100: 12.0,
    desc: "Младший брат 308-го: маленький, юркий, всеми любимый.",
  },
  {
    id: "raf977", name: "РАФ 977 Латвия", gearbox: "М",
    topKmh: 110, zeroTo100: 30.0,
    offroadSoft: true,
    desc: "Старший брат 2203-го: бирюзовый ретро-фургончик 60-х.",
  },
  {
    id: "uaz469", name: "УАЗ-469 Козлик", gearbox: "М",
    topKmh: 100, zeroTo100: 30.0,
    offroadSoft: true,
    desc: "Брат Буханки: открытый вездеход, скачет по кочкам как козлик.",
  },
  {
    id: "zis101", name: "ЗИС-101", gearbox: "М",
    topKmh: 115, zeroTo100: 35.0,
    desc: "Мирный брат бронированного: чёрный лимузин 30-х. Без тарана!",
  },
  {
    id: "f2", name: "Болид Ф-2", gearbox: "М",
    topKmh: 280, zeroTo100: 3.4,
    noNpc: true,
    desc: "Младший брат Ф-1: та же школа, чуть скромнее мотор.",
  },
  // ---- БМВ (заказ Саши; правило: новая марка = сразу пара!) ----
  {
    id: "m3e30", name: "BNW M3 E30", gearbox: "М",
    topKmh: 248, zeroTo100: 6.5,
    desc: "Чёрная легенда 80-х: спойлер на ножках и красная полоска.",
  },
  {
    id: "m5", name: "BNW M5", gearbox: "А",
    topKmh: 305, zeroTo100: 3.4,
    desc: "Красный семейный седан… с мотором монстра. Волк в костюме.",
  },
  // ---- ПОЛИЦИЯ (блокнот Саши: «бодает деревья, но трава проблема») ----
  {
    id: "police", name: "Dodgee Charjer ПОЛИЦИЯ", gearbox: "А",
    topKmh: 250, zeroTo100: 5.8,
    ram: true,        // бодает деревья, коров и соперников!
    grassSlow: true,  // …но трава — его проблема (не съезжай с дороги!)
    noNpc: true,      // соперником не бывает (ждёт режима ПОГОНЬ)
    desc: "Служебный таран: сносит деревья с мигалкой. Но трава — его слабость!",
  },
  // ---- ⚡ ЭЛЕКТРОМОБИЛИ: категория Э просыпается! (блокнот Саши) ----
  {
    id: "cybercraft", name: "Tesly Cybercraft", gearbox: "Э",
    topKmh: 180, zeroTo100: 4.5,
    offroadSoft: true,   // стальной пикап-вездеход
    desc: "Стальной треугольник из будущего: свистит, а не рычит!",
  },
  {
    id: "models", name: "Tesly Model S", gearbox: "Э",
    topKmh: 250, zeroTo100: 3.2,
    desc: "Тихая чёрная молния: ни рёва, ни труб — только свист и скорость.",
  },
  // ---- Машина Бонда (блокнот Саши) — марка сразу парой! ----
  {
    id: "db5", name: "Astin Martun DB5", gearbox: "М",
    topKmh: 233, zeroTo100: 8.1,
    desc: "Серебристая машина шпиона №007: вращающийся номер и характер джентльмена.",
  },
  {
    id: "dbs", name: "Astin Martun DBS", gearbox: "А",
    topKmh: 340, zeroTo100: 3.4,
    desc: "Супер-GT нового шпиона: 725 сил, алый, четыре трубы в диффузоре.",
  },
  // ---- Mazerety из книжки Саши (названия только по-английски!) ----
  {
    id: "mc12", name: "Mazerety MC12 Corsa", gearbox: "М",
    topKmh: 326, zeroTo100: 2.9,
    noNpc: true,   // гоночный гиперкар — соперникам не выдаётся!
    desc: "Гиперкар для трека из книжки: крыло выше крыши и четыре трубы по центру.",
  },
  {
    id: "mc20", name: "Mazerety MC20", gearbox: "А",
    topKmh: 325, zeroTo100: 2.9,
    desc: "Младший брат MC12: алый, чёрный низ, крыло и роспись на корме.",
  },
  // ---- МЕГА-ДЕНЬ: 20 фото Саши за раз! Добиваем марки до 3-4 ----
  { id: "m2", name: "BNW M2", gearbox: "М", topKmh: 285, zeroTo100: 4.1,
    desc: "Злой малыш: четыре трубы парами и рубленый диффузор." },
  { id: "m4", name: "BNW M4 Competition", gearbox: "А", topKmh: 290, zeroTo100: 3.9,
    desc: "Зелёный, как гоночный газон: 510 сил и наглый характер." },
  { id: "b750", name: "BNW 750", gearbox: "А", topKmh: 250, zeroTo100: 4.4,
    desc: "Флагман-лимузин: хромовая полоса соединяет тонкие фонари." },
  { id: "i7", name: "BNW i7", gearbox: "Э", topKmh: 240, zeroTo100: 4.7,
    desc: "Электро-лимузин: едет как облако, молчит как шпион." },
  { id: "vantage", name: "Astin Martun Vantage", gearbox: "М", topKmh: 314, zeroTo100: 3.6,
    desc: "Хищник: световая дуга через всю корму." },
  { id: "dbx", name: "Astin Martun DBX", gearbox: "А", topKmh: 290, zeroTo100: 4.5,
    offroadSoft: true,
    desc: "Вездеход-шпион: красная лента-фонарь и белая крыша." },
  { id: "rapide", name: "Astin Martun Rapide S", gearbox: "А", topKmh: 327, zeroTo100: 4.4,
    desc: "Белый четырёхдверный: седан, который обгоняет спорткары." },
  { id: "quattroporte", name: "Mazerety Quattroporte", gearbox: "А", topKmh: 310, zeroTo100: 4.7,
    desc: "«Четыре двери» по-итальянски: золотистый лимузин с росписью." },
  { id: "ghibli", name: "Mazerety Ghibli", gearbox: "А", topKmh: 267, zeroTo100: 5.5,
    desc: "Серый ветер пустыни: четыре трубы парами." },
  { id: "gt3200", name: "Mazerety 3200 GT", gearbox: "М", topKmh: 280, zeroTo100: 5.1,
    desc: "Классика с фонарями-БУМЕРАНГАМИ — таких больше не делают!" },
  { id: "levante", name: "Mazerety Levante", gearbox: "А", topKmh: 264, zeroTo100: 5.2,
    offroadSoft: true,
    desc: "Вездеход с трезубцем: море по колено, трава по плечо." },
  { id: "corolla", name: "Tayoda Corolla", gearbox: "А", topKmh: 180, zeroTo100: 9.5,
    desc: "Самая продаваемая машина планеты. Скромная и вечная." },
  { id: "chr", name: "Tayoda C-HR", gearbox: "А", topKmh: 180, zeroTo100: 8.2,
    offroadSoft: true,
    desc: "Кроссовер-оригами: двухцветный, углы во все стороны." },
  { id: "chrgr", name: "Tayoda C-HR GR Sport", gearbox: "А", topKmh: 185, zeroTo100: 8.0,
    offroadSoft: true,
    desc: "Тот же оригами, но спортивный: чёрная крыша, злые фонари." },
  { id: "corona", name: "Tayoda Corona Premio", gearbox: "А", topKmh: 180, zeroTo100: 10.5,
    desc: "Серебристый японский дедушка из 90-х: мягкий и честный." },
  { id: "crown", name: "Tayoda Crown", gearbox: "А", topKmh: 200, zeroTo100: 6.0,
    desc: "Корона: красно-чёрный флагман со световой лентой." },
  { id: "supra", name: "Tayoda Supra", gearbox: "М", topKmh: 285, zeroTo100: 4.6,
    desc: "Легенда 90-х с ОГРОМНЫМ крылом и круглыми фонарями. JDM!" },
  { id: "gsupra", name: "Tayoda GR Supra", gearbox: "А", topKmh: 250, zeroTo100: 4.3,
    desc: "Внучка легенды: та же красная ярость, новые мускулы." },
  { id: "yaris", name: "Tayoda Yaris", gearbox: "А", topKmh: 165, zeroTo100: 11.0,
    desc: "Городской малыш: юркий, как воробей." },
  { id: "prius", name: "Tayoda Prius Prime", gearbox: "А", topKmh: 180, zeroTo100: 10.2,
    desc: "Бирюзовый гибрид: наполовину электричка, но коробка обычная." },
  // ---- ДЕНЬ ДОБИВКИ МАРОК: ещё 20 фото Саши (лимит 100 отменён!) ----
  { id: "indycar", name: "Болид IndyCar", gearbox: "М", topKmh: 355, zeroTo100: 2.8,
    noNpc: true,
    desc: "Американский овальный монстр: на прямой быстрее даже Ф-1!" },
  { id: "f3", name: "Болид Ф-3", gearbox: "М", topKmh: 270, zeroTo100: 3.1,
    noNpc: true,
    desc: "Школа чемпионов: здесь начинают будущие короли Ф-1." },
  { id: "rafmed", name: "РАФ-22031 Скорая", gearbox: "М", topKmh: 120, zeroTo100: 28,
    desc: "Белая санитарка с красной полосой: уступи дорогу!" },
  { id: "raf2909", name: "РАФ-2909 Олимпийский", gearbox: "Э", topKmh: 60, zeroTo100: 20,
    desc: "Советский ЭЛЕКТРОМОБИЛЬ 1980 года: вёз олимпийский огонь и не коптил!" },
  { id: "zis110", name: "ЗИС-110", gearbox: "М", topKmh: 140, zeroTo100: 28,
    desc: "Чёрный правительственный лимузин: хром и восемь цилиндров." },
  { id: "zis5", name: "ЗИС-5 «Трёхтонка»", gearbox: "М", topKmh: 60, zeroTo100: 45,
    offroadSoft: true,
    desc: "Первый ГРУЗОВИК в гараже: деревянные борта, стальной характер." },
  { id: "utopia", name: "Paganny Utopia", gearbox: "М", topKmh: 337, zeroTo100: 3.0,
    noNpc: true,
    desc: "Искусство на колёсах: круглые фонари-турбины и МЕХАНИКА." },
  { id: "zondar", name: "Paganny Zonda R", gearbox: "М", topKmh: 340, zeroTo100: 2.7,
    noNpc: true,
    desc: "Гоночная легенда: букет труб по центру и крыло во всю корму." },
  { id: "uaero", name: "ZSC Ultimate Aero XT", gearbox: "М", topKmh: 347, zeroTo100: 2.8,
    noNpc: true,
    desc: "Бывший рекордсмен мира: шесть круглых фонарей, номер «270 миль»." },
  { id: "model3", name: "Tesly Model 3", gearbox: "Э", topKmh: 261, zeroTo100: 3.3,
    desc: "Народная электричка, которая обгоняет спорткары." },
  { id: "modelx", name: "Tesly Model X", gearbox: "Э", topKmh: 250, zeroTo100: 3.9,
    offroadSoft: true,
    desc: "Электро-вездеход с дверями-крыльями (спереди, честное слово!)." },
  { id: "alpha5", name: "TMC Alpha5", gearbox: "Э", topKmh: 250, zeroTo100: 3.2,
    desc: "Новый Делориан 2022 года — ЭЛЕКТРО! Жалюзи на месте, огня не надо." },
  { id: "astra", name: "Opal Astra", gearbox: "А", topKmh: 195, zeroTo100: 9.0,
    desc: "Серебристый хэтчбек с молнией на корме." },
  { id: "insignia", name: "Opal Insignia", gearbox: "А", topKmh: 220, zeroTo100: 7.8,
    desc: "Флагман Опаля: строгий костюм, хромовый штрих." },
  { id: "daytona", name: "Shelbee Daytona", gearbox: "М", topKmh: 305, zeroTo100: 4.4,
    desc: "Синее купе №12, обыгравшее Ferrari в Ле-Мане. Обрубленный хвост!" },
  { id: "patriot", name: "УАЗ Патриот", gearbox: "М", topKmh: 150, zeroTo100: 12,
    offroadSoft: true,
    desc: "Запаска на калитке и никакого страха перед грязью." },
  { id: "hunter", name: "УАЗ Хантер", gearbox: "М", topKmh: 130, zeroTo100: 15,
    offroadSoft: true,
    desc: "Внук 469-го: квадратный, честный, вечный." },
  { id: "eldorado", name: "Kadillark Eldorado 1960", gearbox: "А", topKmh: 175, zeroTo100: 10.5,
    desc: "Плавники-ракеты и круглые фонари-дюзы: космос 60-х!" },
  { id: "ct5v", name: "Kadillark CT5-V", gearbox: "А", topKmh: 322, zeroTo100: 3.6,
    desc: "Чёрный костюм, четыре трубы: самый быстрый Кадиллак в истории." },
  { id: "p9x8", name: "Pejo 9X8", gearbox: "М", topKmh: 340, zeroTo100: 2.9,
    noNpc: true,
    desc: "Гиперкар Ле-Мана БЕЗ заднего крыла — три когтя света с каждой стороны." },
  // ---- Три Рейндж Ровера (Sand Hover растёт до пяти!) ----
  { id: "evoque", name: "Sand Hover Evoque", gearbox: "А", topKmh: 230, zeroTo100: 7.5,
    offroadSoft: true,
    desc: "Городской модник: узкие красные фонари и покатая крыша." },
  { id: "vogue", name: "Sand Hover Vogue 2003", gearbox: "А", topKmh: 200, zeroTo100: 9.0,
    offroadSoft: true,
    desc: "Квадратный аристократ: огромное стекло и болотные сапоги в багажнике." },
  { id: "grand", name: "Sand Hover Grand 2022", gearbox: "А", topKmh: 250, zeroTo100: 4.6,
    offroadSoft: true,
    desc: "Новый король вездеходов: золотистый, гладкий, как галька." },
  { id: "p205", name: "Pejo 205 GTI", gearbox: "М", topKmh: 200, zeroTo100: 7.8,
    desc: "Злой белый малыш из ралли: красная полоска и жёлтый номер." },
  // ---- Konisegg-пара (коробки — заказ Саши: «М у Джеско и С у 2») ----
  { id: "jesko", name: "Konisegg Jesko", gearbox: "М", topKmh: 359, zeroTo100: 2.5,
    noNpc: true,
    desc: "1600 сил и гигантское крыло: НОВЫЙ король скорости в гараже!" },
  { id: "regera", name: "Konisegg Regera", gearbox: "С", topKmh: 340, zeroTo100: 2.8,
    noNpc: true,
    desc: "Овальная труба по центру и мягкая сила: 1500 гибридных лошадей." },
  // ---- Советская пара из списка 28 (фото Саши) ----
  { id: "niva", name: "ВАЗ Нива", gearbox: "М", topKmh: 142, zeroTo100: 17,
    offroadSoft: true,
    desc: "Вездеход-легенда: куда Нива залезет, туда джипы боятся." },
  { id: "chaika", name: "ГАЗ-13 Чайка", gearbox: "А",
    topKmh: 160, zeroTo100: 20,
    desc: "Чёрный лимузин с плавниками и КНОПОЧНЫМ автоматом — правда!" },
  { id: "chaikacan", name: "ГАЗ-13 Чайка Канада", gearbox: "А",
    topKmh: 165, zeroTo100: 18,
    desc: "Кастом ИЗ КАНАДЫ: универсал с запаской в хромовом кольце!" },
  // ---- Porshe ×4 — выбор Саши по фото! ----
  { id: "p930", name: "Porshe 911 Turbo 1975", gearbox: "М",
    topKmh: 260, zeroTo100: 5.2,
    desc: "Легенда с «хвостом кита» и красной лентой во всю корму." },
  { id: "turbos", name: "Porshe 911 Turbo S", gearbox: "А",
    topKmh: 318, zeroTo100: 3.1,
    desc: "Серебристый король 911-х: двухэтажный выдвижной спойлер." },
  { id: "gt3rs", name: "Porshe 911 GT3 RS", gearbox: "А",
    topKmh: 296, zeroTo100: 3.2,
    desc: "Гоночный зверь: крыло-гигант на лебединых шеях СВЕРХУ." },
  { id: "p918", name: "Porshe 918 Spyder", gearbox: "А",
    topKmh: 345, zeroTo100: 2.6,
    noNpc: true,
    desc: "Гибрид-гиперкар: выхлопные трубы торчат ВВЕРХ за кабиной!" },
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
  {
    id: "agera", name: "Konisegg Agera", gearbox: "А",
    topKmh: 340,      // электроника держит (по традиции лимитов Саши)
    zeroTo100: 2.9,
    noNpc: true,
    desc: "Старший брат Гемеры: круглая корма и рёв на всю Швецию.",
  },
  {
    id: "zonta", name: "Paganny Zonta", gearbox: "М",
    topKmh: 325, zeroTo100: 3.5,
    noNpc: true,
    desc: "Брат Вайры: четыре трубы кругом и опера вместо выхлопа.",
  },
  {
    id: "aero", name: "ZSC Aero", gearbox: "М",
    topKmh: 330,      // электроника держит (по традиции лимитов Саши)
    zeroTo100: 2.8,
    noNpc: true,
    desc: "Старший брат Туатары: белая капля, что была быстрейшей в мире.",
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
  astro: 2.9, cobra: 3.2, defendor: 4.2, pejo206: 3.0,
  raf977: 4.4, uaz469: 4.5, zis101: 5.0, f2: 1.5,
  agera: 1.6, zonta: 1.8, aero: 1.7, m3e30: 3.0, m5: 2.2,
  timemachine: 3.2, police: 2.6, cybercraft: 2.6, models: 2.4,
  db5: 3.6, dbs: 2.0, mc12: 1.8, mc20: 2.1,
  m2: 2.3, m4: 2.3, b750: 2.7, i7: 2.7, vantage: 2.2, dbx: 2.9,
  rapide: 2.5, quattroporte: 2.6, ghibli: 2.6, gt3200: 2.9, levante: 2.9,
  corolla: 3.0, chr: 3.0, chrgr: 2.9, corona: 3.3, crown: 2.8,
  supra: 2.5, gsupra: 2.4, yaris: 3.1, prius: 3.0,
  indycar: 1.5, f3: 1.6, rafmed: 4.6, raf2909: 4.2, zis110: 4.8,
  zis5: 5.5, utopia: 1.8, zondar: 1.6, uaero: 1.8, model3: 2.5,
  modelx: 2.7, alpha5: 2.5, astra: 2.9, insignia: 2.8, daytona: 2.6,
  patriot: 3.9, hunter: 4.1, eldorado: 4.3, ct5v: 2.3, p9x8: 1.6,
  evoque: 3.0, vogue: 3.4, grand: 2.9, p205: 3.1,
  jesko: 1.5, regera: 1.7, niva: 3.8, chaika: 4.6, chaikacan: 4.5,
  p930: 2.8, turbos: 2.0, gt3rs: 1.9, p918: 1.8,
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
  astro: 650, cobra: 2100, defendor: 750, pejo206: 500,
  raf977: 350, uaz469: 400, zis101: 500, f2: 3500,
  agera: 8200, zonta: 7000, aero: 7800, m3e30: 1500, m5: 2700,
  timemachine: -2,   // −2 = не продаётся, только за ДОСТИЖЕНИЕ!
  police: 2200, cybercraft: 3000, models: 2600,
  db5: 2000, dbs: 4800, mc12: 7500, mc20: 5200,
  m2: 2400, m4: 2600, b750: 2900, i7: 3200, vantage: 3800, dbx: 3000,
  rapide: 3400, quattroporte: 2800, ghibli: 2200, gt3200: 2000,
  levante: 2400, corolla: 550, chr: 850, chrgr: 950, corona: 450,
  crown: 1400, supra: 2300, gsupra: 2100, yaris: 400, prius: 700,
  indycar: 6500, f3: 2800, rafmed: 450, raf2909: 600, zis110: 550,
  zis5: 300, utopia: 8600, zondar: 9200, uaero: 8800, model3: 2200,
  modelx: 2800, alpha5: 3000, astra: 650, insignia: 900, daytona: 3200,
  patriot: 700, hunter: 550, eldorado: 1200, ct5v: 2900, p9x8: 7800,
  evoque: 1600, vogue: 1300, grand: 2600, p205: 900,
  jesko: 9500, regera: 8400, niva: 500, chaika: 800, chaikacan: 1000,
  p930: 2500, turbos: 4500, gt3rs: 4200, p918: 8700,
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
// Достижения: НАВЕРХУ, потому что нужны isOwned уже при загрузке
// (урок про порядок объявлений — см. DEVLOG!)
let achv = {};
try { achv = JSON.parse(localStorage.getItem("ins1-achv") || "{}"); }
catch (e) { achv = {}; }
// Машина времени принадлежит тому, кто добыл достижение «88 миль в час»
const isOwned = (id) =>
  owned.includes(id) || (id === "timemachine" && !!achv["mph88"]);

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
  const N = segments.length;
  if (!N) return;
  // Шаг поворота на каждом сегменте — из изгиба дороги
  let turns = segments.map((s) => s.curve * 0.004);
  if (raceKind === "circuit") {
    // ЗАМЫКАНИЕ КОЛЬЦА (фикс Саши «работает только извилистая»):
    // движок хранит лишь изгибы, и сами по себе они кольцо не
    // образуют. Но мы-то ЗНАЕМ, что трасса кольцевая! Значит,
    // повороты в сумме должны дать ровно один оборот (360°) —
    // добавляем каждому сегменту одинаковую крошечную поправку.
    const total = turns.reduce((a, b) => a + b, 0);
    const goal = total >= 0 ? 2 * Math.PI : -2 * Math.PI;
    const fix = (goal - total) / N;
    turns = turns.map((d) => d + fix);
  }
  const pts = [];
  let heading = 0, mpx = 0, mpy = 0;
  for (const d of turns) {
    heading += d;
    mpx += Math.sin(heading);
    mpy -= Math.cos(heading);
    pts.push([mpx, mpy]);
  }
  if (raceKind === "circuit") {
    // И вторая поправка: конец обязан СОЙТИСЬ с началом. Остаточный
    // сдвиг размазываем по всем точкам — как чинят дрейф GPS-трека
    const ex = pts[N - 1][0], ey = pts[N - 1][1];
    for (let i = 0; i < N; i++) {
      pts[i][0] -= (ex * (i + 1)) / N;
      pts[i][1] -= (ey * (i + 1)) / N;
    }
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

// ---------- 🔥 ТУРБО (блокнот Саши: «кнопка нитро в гонке») ----------
// Покупается один раз в тюнинге. В заезде — 3 заряда: каждый даёт
// 3 секунды бешеной тяги, +8% сверх максималки и СИНЕЕ пламя из труб.
let nitroCharges = 3;    // заряды на заезд (новый заезд — новые баллоны)
let nitroUntil = 0;      // до какого момента горит нитро
const nitroActive = () => performance.now() < nitroUntil;

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
    // БАЛАНС (правило Саши): соперники НЕ БЫСТРЕЕ машины игрока.
    // Но с шансом 15% на место всё же выпадает быстрая — интрига!
    const slower = pool.filter((c) => c.topKmh <= car.topKmh);
    const faster = pool.filter((c) => c.topKmh > car.topKmh);
    const pickFrom =
      (Math.random() < 0.15 && faster.length) ? faster
      : slower.length ? slower
      // медленных не осталось (ты на Буханке!) — берём 5 самых
      // медленных из оставшихся, а не кого попало
      : pool.slice().sort((a, b) => a.topKmh - b.topKmh).slice(0, 5);
    const oc = pool.splice(pool.indexOf(
      pickFrom[Math.floor(Math.random() * pickFrom.length)]), 1)[0];
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
  nitroCharges = 3;   // свежие баллоны турбо на новый заезд
  nitroUntil = 0;
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
  endChase();       // если уходили из погони — вернуть свою машину
  opponents = [];
  saveFuel();       // бензин запоминается между поездками
  ensureCircuit();
  restartRace();
  started = false;
  engineOn = false;
  engineStarting = false;
  show("menu", true);
}

// ---------- 🚓 ПОГОНЯ (спецификация Саши, 21.09) ----------
// «Полиция будет на карте с разными дорогами, развилками, догони
// преступника. Старт 60 км/ч». Ты — на служебном Додже, впереди
// удирает преступник. На развилках выбирай сторону: ошибся —
// он оторвался!
let chaseMode = false;
let chaseOver = false;
let chasePrevCar = -1;
let chaseForks = [];
let chaseRole = "cop";   // "cop" — ты полиция; "thief" — ты ВОР!
let chaseStart = 0;      // время старта (вору надо продержаться)

function buildChaseTrack() {
  raceKind = "chase";
  setTheme(0);
  setupAnimals(-1);
  traffic = [];
  segments = [];
  chaseForks = [];
  addRoad(10, 12, 10, 0, 0);   // короткий разгон — и сразу к делу!
  while (segments.length < 1300) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    // подъезд к развилке (короткий: развилки должны быть ЧАСТЫМИ —
    // правка Саши «развилки нет»: первая была аж на 181-м сегменте!)
    addRoad(8, 12, 8, Math.random() * 2 - 1, Math.random() * 10 - 5);
    const forkSeg = segments.length - 1;
    chaseForks.push({ seg: forkSeg, dir, resolved: false });
    addSprite(forkSeg, "fork", 0);
    // выбранная ветка: дорога уходит в сторону dir
    addRoad(6, 22, 14, dir * (3.2 + Math.random() * 1),
            Math.random() * 12 - 6);
    addRoad(10, 18, 10, Math.random() * 4 - 2, 0);
    // ВТОРАЯ ДОРОГА (правка Саши: «перед тобой 2 путя и оба
    // продолжение трассы»): полноценная ветка — с бордюрами И
    // разметкой — расходится зеркально, длинной плавной вилкой
    for (let k = 0; k < 20 && forkSeg + k < segments.length; k++) {
      segments[forkSeg + k].branch = {
        side: -dir,                    // в противоположную сторону
        o1: k * 0.42,
        o2: (k + 1) * 0.42,
      };
    }
  }
  trackLength = segments.length * SEG_LEN;
  buildTrackMap();
}

function goChase(role = "cop") {
  chaseRole = role;
  buildChaseTrack();
  raceMode = false;
  taMode = false;
  chaseMode = true;
  chaseOver = false;
  inCity = false;
  show("city", false);
  if (role === "cop") {
    // Полицейскую машину ВЫДАЮТ на время службы (покупать не нужно)
    chasePrevCar = carIndex;
    carIndex = CARS.findIndex((c) => c.id === "police");
    car = CARS[carIndex];
    restartRace();
    // ПРЕСТУПНИК: случайная машина впереди, быстрая, но досягаемая
    const pool = CARS.filter((c) => !c.noNpc && c.topKmh >= 150 && c.topKmh <= 250);
    const cc = pool[Math.floor(Math.random() * pool.length)];
    opponents = [{ car: cc, canvas: prerenderCar(cc.id),
                   z: SEG_LEN * 10, x: 0.4, speed: KMH * 80,
                   skill: 0.84 + Math.random() * 0.06 }];
    lapMsg = { text: `🚓 ДОГОНИ ПРЕСТУПНИКА! Он на ${cc.name}!`,
               until: performance.now() + 3000 };
  } else {
    // ТЫ — ВОР (правило Саши: не купил полицию — будешь вором!):
    // остаёшься на СВОЕЙ машине, полиция гонится СЗАДИ.
    // Продержись 60 секунд или оторвись — уйдёшь!
    chasePrevCar = -1;
    restartRace();
    position = SEG_LEN * 12;   // фора: стартуем впереди полиции
    const pc = CARS.find((c) => c.id === "police");
    opponents = [{ car: pc, canvas: prerenderCar("police"),
                   z: SEG_LEN * 3, x: 0, speed: KMH * 80, skill: 0.9 }];
    chaseStart = performance.now();
    lapMsg = { text: "🚔 ТЫ ВОР! Продержись 45 секунд — и уйдёшь!",
               until: performance.now() + 3000 };
  }
  playerLap = 1;   // абсолютная дистанция погони считается по кругам
  // СТАРТ С ХОДА: 60 км/ч (спецификация Саши)
  engineOn = true;
  engineStarting = false;
  speed = KMH * 60;
  manualGear = 2;
  started = true;
  show("menu", false);
  initEngineSound();
  if (engine && engine.ac.state === "suspended") engine.ac.resume();
}

// НАСТОЯЩИЙ ПОВОРОТ НЕ ТУДА (правка Саши: «я хотел чтоб можно было
// выбрать путь»): дорога впереди ПЕРЕГИБАЕТСЯ в сторону игрока —
// ты реально уезжаешь по своей ветке, а чужая уходит в другую
function flipForkRoad(f) {
  for (let k = 0; k < 45; k++) {
    const s = segments[f.seg + k];
    if (!s) break;
    s.curve = -s.curve;
    if (s.branch) s.branch.side = -s.branch.side;
  }
  buildTrackMap();   // мини-карта перерисуется под новый путь
}

// Вернуть игроку его машину после службы
function endChase() {
  if (!chaseMode) return;
  chaseMode = false;
  chaseOver = false;
  if (chasePrevCar >= 0) {
    carIndex = chasePrevCar;
    car = CARS[carIndex];
    chasePrevCar = -1;
  }
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
wireButton("poi-chase", () => { goChase("cop"); });   // в городе — служба
// В ЗАЕЗДАХ (правило Саши, уточнено): роль решает ВЫБРАННАЯ машина!
// Сел на полицию — ты полиция. Пришёл на любой другой (хоть на
// ДМС!) — ты ВОР. Купить полицию нужно, чтобы её выбрать.
wireButton("btn-chase", () => {
  inRaces = false;
  show("races", false);
  goChase(car.id === "police" ? "cop" : "thief");
});
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
    unlockAchv("friend");   // достижение «Друг на связи»
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
wireButton("btn-finish-again", () => {
  if (chaseMode) { endChase(); goChase(); }   // новая погоня!
  else restartRace();
});
wireButton("btn-finish-menu", goMenu);
wireButton("btn-track", () => {
  buildTrack((currentTrack + 1) % TRACK_NAMES.length);
  restartRace();
  updateTrackButton();
});
wireButton("btn-restart", () => {
  if (chaseMode) { endChase(); goChase(); }
  else restartRace();
});
wireButton("btn-crash-menu", goMenu);
wireButton("btn-pause-restart", () => {
  if (chaseMode) { endChase(); goChase(); }
  else restartRace();
});
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
  nitro:      ["Space", ""],
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
  nitro:      "🔥 ТУРБО (нитро, если куплено)",
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
    achv = {};          // ДОСТИЖЕНИЯ тоже сгорают (правка Саши) —
                        // а с ними прячется и Машина Времени!
    try { localStorage.removeItem("ins1-achv"); } catch {}
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
    sa.innerHTML = "🛡 Код «админский код секрет» активен — все машины (кроме ЗИСа и Машины Времени!) и <i>бесконечные деньги</i>";
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
    // И МАШИНА ВРЕМЕНИ не даётся (правка Саши) — только за достижение!
    adminCode = true;
    try { localStorage.setItem("ins1-admin", "1"); } catch {}
    owned = CARS.filter((c) => c.id !== "zis" && c.id !== "timemachine")
                .map((c) => c.id);
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
  astro: "city", cobra: "sport", defendor: "suv", pejo206: "city",
  raf977: "ussr", uaz469: "ussr", zis101: "ussr", f2: "hyper",
  agera: "hyper", zonta: "hyper", aero: "hyper",
  m3e30: "sport", m5: "sport", timemachine: "sport", police: "sport",
  cybercraft: "suv", models: "lux",
  db5: "sport", dbs: "lux",
  mc12: "hyper", mc20: "sport",
  m2: "sport", m4: "sport", b750: "lux", i7: "lux",
  vantage: "sport", dbx: "suv", rapide: "lux",
  quattroporte: "lux", ghibli: "sport", gt3200: "sport", levante: "suv",
  corolla: "city", chr: "suv", chrgr: "suv", corona: "city",
  crown: "lux", supra: "sport", gsupra: "sport", yaris: "city", prius: "city",
  indycar: "hyper", f3: "hyper", rafmed: "ussr", raf2909: "ussr",
  zis110: "ussr", zis5: "ussr", utopia: "hyper", zondar: "hyper",
  uaero: "hyper", model3: "sport", modelx: "suv", alpha5: "sport",
  astra: "city", insignia: "city", daytona: "sport", patriot: "suv",
  hunter: "suv", eldorado: "lux", ct5v: "sport", p9x8: "hyper",
  evoque: "suv", vogue: "suv", grand: "suv", p205: "city",
  jesko: "hyper", regera: "hyper", niva: "ussr", chaika: "ussr",
  chaikacan: "ussr",
  p930: "sport", turbos: "sport", gt3rs: "sport", p918: "hyper",
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
  volga21: "ГАЗ", volga24: "ГАЗ", volga3110: "ГАЗ",
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
  astro: "Opal", cobra: "Shelbee", defendor: "Sand Hover",
  pejo206: "Pejo", raf977: "РАФ", uaz469: "УАЗ", zis101: "ЗИС",
  f2: "Нет марки", agera: "Konisegg", zonta: "Paganny", aero: "ZSC",
  m3e30: "BNW", m5: "BNW", timemachine: "TMC", police: "Dodgee",
  cybercraft: "Tesly", models: "Tesly",
  db5: "Astin Martun", dbs: "Astin Martun",
  mc12: "Mazerety", mc20: "Mazerety",
  m2: "BNW", m4: "BNW", b750: "BNW", i7: "BNW",
  vantage: "Astin Martun", dbx: "Astin Martun", rapide: "Astin Martun",
  quattroporte: "Mazerety", ghibli: "Mazerety", gt3200: "Mazerety",
  levante: "Mazerety",
  corolla: "Tayoda", chr: "Tayoda", chrgr: "Tayoda", corona: "Tayoda",
  crown: "Tayoda", supra: "Tayoda", gsupra: "Tayoda", yaris: "Tayoda",
  prius: "Tayoda",
  indycar: "Нет марки", f3: "Нет марки", rafmed: "РАФ", raf2909: "РАФ",
  zis110: "ЗИС", zis5: "ЗИС", utopia: "Paganny", zondar: "Paganny",
  uaero: "ZSC", model3: "Tesly", modelx: "Tesly", alpha5: "TMC",
  astra: "Opal", insignia: "Opal", daytona: "Shelbee",
  patriot: "УАЗ", hunter: "УАЗ", eldorado: "Kadillark",
  ct5v: "Kadillark", p9x8: "Pejo",
  evoque: "Sand Hover", vogue: "Sand Hover", grand: "Sand Hover",
  p205: "Pejo", jesko: "Konisegg", regera: "Konisegg",
  niva: "ВАЗ", chaika: "ГАЗ",   // Чайка — в ГАЗы (заказ Саши)!
  chaikacan: "ГАЗ",
  p930: "Porshe", turbos: "Porshe", gt3rs: "Porshe", p918: "Porshe",
};
let garageCat = 0;      // номер выбранной категории в CATEGORIES
let garageBrand = null; // выбранная марка (null = фильтруем по типу)

// ---------- ДОСТИЖЕНИЯ (блокнот Саши, 21.09) ----------
// Награды за подвиги! Хранятся в ins1-achv, показываются на своём
// экране, а при получении всплывает зелёная плашка.
const ACHIEVEMENTS = [
  { id: "firstwin", icon: "🥇", name: "Первая победа",
    desc: "Выиграй любую гонку" },
  { id: "mph88", icon: "⚡", name: "88 миль в час!",
    desc: "Разгони Делориан до 142 км/ч. Награда: МАШИНА ВРЕМЕНИ в гараже!" },
  { id: "hyper344", icon: "🚀", name: "Гиперскорость",
    desc: "Разгонись до 344 км/ч" },
  { id: "buhanka1", icon: "🍞", name: "Буханка-чемпион",
    desc: "Выиграй гонку на Буханке" },
  { id: "rich", icon: "💰", name: "Богач",
    desc: "Накопи 5000 монет" },
  { id: "ten", icon: "🔟", name: "Коллекционер",
    desc: "Владей десятью машинами" },
  { id: "ussr", icon: "🪆", name: "Гараж СССР",
    desc: "Собери ВСЕ машины СССР (да, даже ЗИС!)" },
  { id: "friend", icon: "🌐", name: "Друг на связи",
    desc: "Сыграй с другом в мультиплеере" },
  { id: "arrest", icon: "🚓", name: "Именем закона!",
    desc: "Задержи преступника в погоне" },
  { id: "escape", icon: "🏃", name: "Неуловимый",
    desc: "Уйди от полиции, играя за вора" },
];
// (сам объект achv объявлен наверху, рядом с owned — порядок загрузки!)
function unlockAchv(id) {
  if (achv[id]) return;                     // уже получено
  achv[id] = Date.now();
  localStorage.setItem("ins1-achv", JSON.stringify(achv));
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  const t = document.getElementById("achv-toast");
  t.textContent = `🏅 Достижение: ${a.icon} ${a.name}!`;
  t.classList.remove("hidden");
  clearTimeout(unlockAchv._tm);
  unlockAchv._tm = setTimeout(() => t.classList.add("hidden"), 3500);
}

// Проверки, связанные с гаражом (вызываются после покупки и при старте)
function checkCarAchievements() {
  if (owned.length >= 10) unlockAchv("ten");
  const ussrIds = Object.keys(CAR_CATEGORY)
    .filter((k) => CAR_CATEGORY[k] === "ussr");
  if (ussrIds.every((k) => isOwned(k))) unlockAchv("ussr");
}

function renderAchv() {
  const list = document.getElementById("achv-list");
  list.innerHTML = "";
  let got = 0;
  for (const a of ACHIEVEMENTS) {
    const row = document.createElement("div");
    row.className = "achv-row" + (achv[a.id] ? "" : " locked");
    if (achv[a.id]) got++;
    row.innerHTML =
      `<span class="ic">${achv[a.id] ? a.icon : "🔒"}</span>` +
      `<div><b>${a.name}</b><span>${a.desc}</span></div>`;
    list.appendChild(row);
  }
  document.getElementById("achv-count").textContent =
    `Открыто: ${got} из ${ACHIEVEMENTS.length}`;
}
wireButton("btn-achv", () => {
  renderAchv();
  show("menu", false);
  show("achv", true);
});
wireButton("btn-achv-back", () => {
  show("achv", false);
  show("menu", true);
});
checkCarAchievements();   // прошлые заслуги засчитываются сразу!

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
      // Отрицательная цена (код или достижение) = «бесценно» → в конец
      const pa = CAR_PRICES[CARS[a].id], pb = CAR_PRICES[CARS[b].id];
      return (pa < 0 ? Infinity : pa) - (pb < 0 ? Infinity : pb);
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
  } else if (CAR_PRICES[c.id] === -2) {
    btn.textContent = "🏅 Только за достижение «88 миль в час»!";
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
  } else if (CAR_PRICES[c.id] === -1 || CAR_PRICES[c.id] === -2) {
    return;              // только код (ЗИС) или достижение (машина времени)!
  } else if (canAfford(CAR_PRICES[c.id])) {
    pay(CAR_PRICES[c.id]);            // ПОКУПКА! 💰 (админу — бесплатно)
    owned.push(c.id);
    saveOwned();
    checkCarAchievements();           // «Коллекционер», «Гараж СССР»
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
  cybercraft: ["#c9ccd1", "#b8bcc2"],
  models: ["#17191c", "#101214"],
  db5: ["#ccd2d6", "#b4bac0"],
  dbs: ["#c0242c", "#8f151c"],
  mc12: ["#f28a1e", "#c96e12"],
  mc20: ["#c8232b", "#96161d"],
  m2: ["#d0342c", "#a3241e"],
  m4: ["#1e5c40", "#154430"],
  b750: ["#c8ccd2", "#aeb3ba"],
  i7: ["#26282c", "#1a1c20"],
  vantage: ["#9aa1a8", "#7e858c"],
  dbx: ["#3f444a", "#2e3338"],
  rapide: ["#eceef0", "#d2d5d9"],
  quattroporte: ["#cbb598", "#b09a7d"],
  ghibli: ["#3a3d42", "#2b2e33"],
  gt3200: ["#c3c8ce", "#a9aeb5"],
  levante: ["#5b7292", "#475d7c"],
  corolla: ["#f2f3f5", "#d8dade"],
  chr: ["#c9bfae", "#b0a591"],
  chrgr: ["#c6cad0", "#acb1b8"],
  corona: ["#d5d8dc", "#bbbfc5"],
  crown: ["#b3202a", "#8c161e"],
  supra: ["#c22026", "#98161b"],
  gsupra: ["#d8242b", "#a81a20"],
  yaris: ["#f0f1f3", "#d6d8dc"],
  prius: ["#2e9e96", "#22776f"],
  indycar: ["#c8202a", "#9e161e"],
  f3: ["#eceef0", "#d2d5d9"],
  rafmed: ["#eef0f2", "#d4d7db"],
  raf2909: ["#8a3b2e", "#6b2d22"],
  zis110: ["#17191c", "#101214"],
  zis5: ["#3f5a3c", "#2f4630"],
  utopia: ["#cfc9bd", "#b5ad9e"],
  zondar: ["#26282c", "#1a1c20"],
  uaero: ["#eceef0", "#d2d5d9"],
  model3: ["#17191c", "#101214"],
  modelx: ["#f0f1f3", "#d6d8dc"],
  alpha5: ["#c9ccd1", "#b8bcc2"],
  astra: ["#c6cad0", "#acb1b8"],
  insignia: ["#6e625a", "#584e47"],
  daytona: ["#2456a8", "#1a3f7e"],
  patriot: ["#6b6f66", "#54574f"],
  hunter: ["#3a3d36", "#2b2d28"],
  eldorado: ["#1d2a4a", "#141d36"],
  ct5v: ["#1a1c20", "#111316"],
  p9x8: ["#26292d", "#191c1f"],
  evoque: ["#eceef0", "#d2d5d9"],
  vogue: ["#c6cad0", "#acb1b8"],
  grand: ["#c2a281", "#a68864"],
  p205: ["#f0ede4", "#d6d2c6"],
  jesko: ["#e4e7ea", "#c8ccd2"],
  regera: ["#aebfd1", "#93a6bb"],
  niva: ["#7a6a58", "#5f5244"],
  chaika: ["#17191c", "#101214"],
  chaikacan: ["#17191c", "#101214"],
  p930: ["#c7d2c6", "#adb8ac"],
  turbos: ["#c9cdd2", "#aeb3ba"],
  gt3rs: ["#bfc4ca", "#a5abb2"],
  p918: ["#eceef0", "#d2d5d9"],
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
  astro: ["#8f979e", "#7d858c"],
  cobra: ["#1d3f96", "#173482"],
  defendor: ["#3f6d4e", "#356043"],
  pejo206: ["#c9ccd1", "#b8bcc2"],
  raf977: ["#7fc4c9", "#6fb4b9"],
  uaz469: ["#5a6e4a", "#4d5f3f"],
  zis101: ["#17191c", "#101214"],
  f2: ["#ff8c1a", "#e87608"],
  agera: ["#5a5e63", "#4d5156"],
  zonta: ["#c9ccd1", "#b8bcc2"],
  aero: ["#f2f3f0", "#e2e4e0"],
  m3e30: ["#1d1f24", "#15171b"],
  m5: ["#c5232c", "#ad1e26"],
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
  sportage: 66, k5: 71, sonata: 71, tucson: 66, i30: 65,
  astro: 64, cobra: 74, defendor: 64, pejo206: 62, raf977: 62,
  uaz469: 64, zis101: 66, f2: 84, agera: 80, zonta: 80, aero: 80,
  m3e30: 70, m5: 74, timemachine: 75, police: 74,
  cybercraft: 72, models: 72, db5: 68, dbs: 78, mc12: 82, mc20: 76,
  m2: 76, m4: 76, b750: 72, i7: 72, vantage: 76, dbx: 68, rapide: 73,
  quattroporte: 72, ghibli: 71, gt3200: 72, levante: 68, corolla: 68,
  chr: 66, chrgr: 66, corona: 66, crown: 71, supra: 78, gsupra: 77,
  yaris: 60, prius: 66,
  indycar: 84, f3: 82, rafmed: 62, raf2909: 62, zis110: 68, zis5: 64,
  utopia: 80, zondar: 82, uaero: 78, model3: 70, modelx: 68, alpha5: 74,
  astra: 62, insignia: 70, daytona: 72, patriot: 64, hunter: 64,
  eldorado: 74, ct5v: 74, p9x8: 82, evoque: 66, vogue: 66, grand: 68,
  p205: 60, jesko: 80, regera: 80, niva: 60, chaika: 72,
  chaikacan: 72, p930: 74, turbos: 78, gt3rs: 79, p918: 79 };

// ---------- ИГРОВАЯ ВАЛЮТА 🪙 ----------
// Зарабатывается в гонках (по месту на финише), тратится на железо.
// Косметика — бесплатно: красота принадлежит народу!
const PLACE_REWARD = [500, 300, 150, 50];   // 🥇 🥈 🥉 и 4-е место
const HW_PRICE = [300, 600, 1000];          // цена уровней железа 1 / 2 / 3
const TURBO_PRICE = 800;                    // 🔥 баллон нитро (покупается раз)

let money = 100;   // стартовый капитал (решение Саши: сурово, но честно!)
try {
  const m = parseInt(localStorage.getItem("ins1-money"));
  if (!isNaN(m)) money = m;
} catch {}
function saveMoney() {
  try { localStorage.setItem("ins1-money", String(money)); } catch {}
  if (money >= 5000) unlockAchv("rich");   // достижение «Богач»
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
  if (tuning[id].turbo === undefined) tuning[id].turbo = false; // старые сейвы без турбо
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
  defendor: { spoilerY: -130, stripeTop: -70 },
  raf977: { spoilerY: -124, stripeTop: -66 },
  uaz469: { spoilerY: -92, stripeTop: -56 },
  zis101: { spoilerY: -112, stripeTop: -64 },
  cobra: { noSpoiler: true, stripeTop: -60 },   // родстеру спойлер некуда!
  timemachine: { noSpoiler: true, stripeTop: -58 },  // решётки — не мешать!
  cybercraft: { spoilerY: -92, stripeTop: -58 },
  db5: { noSpoiler: true, stripeTop: -60 },  // классике шпиона спойлер не к лицу
  dbs: { spoilerY: -100, stripeTop: -64 },
  mc12: { noSpoiler: true, stripeTop: -66 },  // заводское крыло выше крыши!
  mc20: { noSpoiler: true, stripeTop: -62 },  // крыло уже с завода (фото)
  supra: { noSpoiler: true, stripeTop: -62 }, // ОГРОМНОЕ крыло с завода!
  indycar: { noSpoiler: true },
  f3: { noSpoiler: true },
  zondar: { noSpoiler: true, stripeTop: -70 },
  uaero: { noSpoiler: true, stripeTop: -70 },
  p9x8: { noSpoiler: true, stripeTop: -70 },  // у него НЕТ крыла — фишка!
  rafmed: { spoilerY: -124, stripeTop: -66 },
  raf2909: { spoilerY: -118, stripeTop: -64 },
  zis5: { spoilerY: -118, stripeTop: -66 },
  patriot: { spoilerY: -128, stripeTop: -68 },
  hunter: { spoilerY: -124, stripeTop: -68 },
  evoque: { spoilerY: -112, stripeTop: -62 },
  vogue: { spoilerY: -128, stripeTop: -68 },
  grand: { spoilerY: -126, stripeTop: -66 },
  p205: { spoilerY: -106, stripeTop: -58 },
  jesko: { noSpoiler: true, stripeTop: -70 },   // крыло-гигант с завода!
  regera: { noSpoiler: true, stripeTop: -70 },
  niva: { spoilerY: -122, stripeTop: -66 },
  chaika: { stripeTop: -60 },
  chaikacan: { spoilerY: -126, stripeTop: -64 },
  p930: { noSpoiler: true, stripeTop: -60 },   // «хвост кита» с завода!
  turbos: { noSpoiler: true, stripeTop: -58 }, // выдвижной свой
  gt3rs: { noSpoiler: true, stripeTop: -60 },
  p918: { noSpoiler: true, stripeTop: -58 },
  eldorado: { stripeTop: -60 },
  alpha5: { noSpoiler: true, stripeTop: -60 },  // жалюзи и хвост-клин
  yaris: { spoilerY: -104, stripeTop: -58 },
  prius: { noSpoiler: true, stripeTop: -58 }, // планка поперёк стекла — своя!
  chr: { spoilerY: -108, stripeTop: -58 },
  chrgr: { spoilerY: -108, stripeTop: -58 },
  dbx: { spoilerY: -112, stripeTop: -62 },
  levante: { spoilerY: -110, stripeTop: -60 },
  f2: { noSpoiler: true },
  agera: { noSpoiler: true, stripeTop: -72 },
  zonta: { noSpoiler: true, stripeTop: -74 },
  aero: { spoilerY: -84, stripeTop: -72 },
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
  // 🔥 ТУРБО (блокнот Саши): баллон нитро — 3 заряда каждый заезд.
  // Электричеству турбо не положено: выхлопа нет, дуть некуда!
  if (c.gearbox === "Э") {
    const b = chip("ТУРБО: электро и так пуляет!", false, () => {});
    b.classList.add("locked");
    hw.appendChild(b);
  } else if (t.turbo) {
    hw.appendChild(chip("ТУРБО: 🔥 стоит! Пробел в гонке", true, () => {}));
  } else {
    const b = chip(`ТУРБО: кнопка нитро · ${TURBO_PRICE} 🪙`, false, () => {
      if (!canAfford(TURBO_PRICE)) return;
      pay(TURBO_PRICE);
      t.turbo = true;
    });
    if (!canAfford(TURBO_PRICE)) b.classList.add("locked");
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

    // 🔥 ТУРБО: пробел — и нитро пуляет 3 секунды!
    if (hit("nitro")) tryNitro();

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

// 🔥 Попытка включить турбо: нужен купленный баллон, живой мотор,
// заряды и чтобы нитро уже не горело. Во время отсчёта — рано!
function tryNitro() {
  const t = getTun(car.id);
  if (!t.turbo || car.gearbox === "Э") return;
  if (!engineOn || countdown > 0 || nitroCharges <= 0 || nitroActive()) return;
  nitroCharges--;
  nitroUntil = performance.now() + 3000;
  lapMsg = { text: nitroCharges > 0
    ? `🔥 ТУРБО! Осталось зарядов: ${nitroCharges}`
    : "🔥 ТУРБО! Это был последний заряд!",
    until: performance.now() + 2000 };
}
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
  { label: "🔥", code: () => binds.nitro[0],
    show: () => getTun(car.id).turbo && car.gearbox !== "Э" && nitroCharges > 0 },
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
    // 🔥 ТУРБО: нитро пинает ПОВЕРХ всего — даже отсечка на механике
    // не удержит ракету (это же чистый взрыв в трубе!)
    if (nitroActive()) thrust += car.accel * 0.8;
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
  if (manualMode && engineOn && speed > gearHigh(manualGear) && !zisBoostActive()
      && !nitroActive())
    speed += ENGINE_BRAKE * dt;

  // Выехал на траву на большой скорости? Держись, будет трясти и
  // тормозить! Уточнение Саши: броневик (ram) И внедорожники
  // (offroadSoft) по траве едут как по асфальту — совсем без потерь.
  // Разница: аварии внедорожники НЕ прощают, а броневик таранит.
  // Полицейский Додж (grassSlow): таранит как ЗИС, но трава — его
  // проблема (формула Саши из блокнота)!
  if ((playerX < -1 || playerX > 1) && speed > OFFROAD_LIMIT
      && ((!car.ram && !car.offroadSoft) || car.grassSlow))
    speed += OFFROAD_DECEL * dt;

  playerX = clamp(playerX, -2.2, 2.2);
  // Максималка своя + чип-тюнинг. ТУРБО даёт +8% СВЕРХ максималки,
  // а когда нитро гаснет — лишняя скорость тает плавно, без обрыва
  const speedCap = tunedMaxSpeed() * (nitroActive() ? 1.08 : 1);
  speed = Math.max(0, speed);
  if (speed > speedCap)
    speed = Math.max(speedCap, speed - car.maxSpeed * 0.2 * dt);

  // Едем вперёд! Трасса — кольцо, поэтому после финиша снова старт
  const prevPosForHit = position;   // откуда стартовал этот кадр (для столкновений)
  position += speed * dt;
  while (position >= trackLength) {
    position -= trackLength;
    // круги считает и погоня — иначе дистанция до полиции «прыгает»
    if (raceMode || chaseMode) playerLap++;
    if (taMode) finishTaLap();   // против рекорда: круг завершён!
  }

  // 88 миль/ч! Пересекли отметку 142 км/ч снизу вверх — поджигаем след.
  // Решение Саши: огонь — ЭКСКЛЮЗИВ Делориана, машины времени!
  const kmhNow = speed / KMH;
  if ((car.id === "delorean" || car.id === "timemachine")
      && prevKmh < 142 && kmhNow >= 142) {
    fireTrailUntil = performance.now() + 5000;
    unlockAchv("mph88");            // достижение + МАШИНА ВРЕМЕНИ!
  }
  if (kmhNow >= 344) unlockAchv("hyper344");
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

  // ---------- 🚔 ПОГОНЯ ЗА ВОРОМ: ты убегаешь от полиции! ----------
  if (chaseMode && chaseRole === "thief" && !chaseOver && opponents[0]) {
    const cop = opponents[0];
    const playerTotalC = (playerLap - 1) * trackLength + position;
    const gap = playerTotalC - cop.z;
    // ПРАВИЛО 85 (Саша): полиция не быстрее 85 км/ч. Едешь 85 —
    // держится рядом, быстрее 85 — ОТДАЛЯЕШЬСЯ (на любой машине,
    // хоть на Буханке!). Но встал или ползёшь — настигает (мин. 70).
    cop.speed = clamp(speed + KMH * 8, KMH * 70, KMH * 85);
    cop.z += cop.speed * dt;
    // РАЗВИЛКИ — настоящий выбор пути: свернул на другую ветку —
    // дорога перегибается за тобой! Полиция далеко — потеряла след,
    // близко — успела свернуть следом.
    for (const f of chaseForks) {
      if (!f.resolved && position >= f.seg * SEG_LEN) {
        f.resolved = true;
        const side = playerX < 0 ? -1 : 1;
        if (side !== f.dir) {
          flipForkRoad(f);
          if (gap > 1200) {
            cop.z -= 4500;
            lapMsg = { text: "🌀 Полиция потеряла тебя на развилке!",
                       until: performance.now() + 1800 };
          } else {
            lapMsg = { text: "🚔 Полиция успела свернуть за тобой!",
                       until: performance.now() + 1600 };
          }
        }
      }
    }
    const left = 45 - (performance.now() - chaseStart) / 1000;
    if (gap < 10) {   // 0 метров — ловит только КАСАНИЕМ (правка Саши)
      chaseOver = true;
      raceOver = true;
      if (!adminCode) { money = Math.max(0, money - 150); saveMoney(); }
      updateMoneyUI();
      document.getElementById("finish-text").textContent =
        `🚔 ПОЙМАН! Штраф: −150 🪙 (всего: ${adminCode ? "АДМИН" : money})`;
      show("finish", true);
    } else if (left <= 0 || gap > 24000) {
      chaseOver = true;
      raceOver = true;
      const reward = 400;
      money += reward; saveMoney(); updateMoneyUI();
      unlockAchv("escape");
      document.getElementById("finish-text").textContent =
        `🏃 УШЁЛ ОТ ПОГОНИ! Приз: +${reward} 🪙 (всего: ${adminCode ? "АДМИН" : money})`;
      show("finish", true);
    }
  }

  // ---------- 🚓 ПОГОНЯ: развилки, задержание, побег ----------
  if (chaseMode && chaseRole === "cop" && !chaseOver && !crashed && opponents[0]) {
    updateOpponents(dt);
    const crim = opponents[0];
    const gap = crim.z - ((playerLap - 1) * trackLength + position);
    // РАЗВИЛКИ — настоящий выбор пути (правка Саши): поехал не по
    // ветке преступника — реально СВЕРНУЛ на другую дорогу, и вора
    // уже не поймать!
    for (const f of chaseForks) {
      if (!f.resolved && position >= f.seg * SEG_LEN) {
        f.resolved = true;
        if (gap < 400) continue;   // он прямо перед носом — развилка не в счёт
        const side = playerX < 0 ? -1 : 1;
        if (side === f.dir) {
          crim.speed *= 0.72;      // преступник запаниковал!
          lapMsg = { text: "✅ Верная дорога!", until: performance.now() + 1400 };
        } else {
          flipForkRoad(f);         // едешь по СВОЕЙ ветке…
          chaseOver = true;
          raceOver = true;
          document.getElementById("finish-text").textContent =
            "🛣 Свернул не туда — преступник ушёл по другой дороге!";
          show("finish", true);
        }
      }
    }
    // ЗАДЕРЖАНИЕ: догнал вплотную
    if (gap < 160 && Math.abs(crim.x - playerX) < 0.5) {
      chaseOver = true;
      raceOver = true;
      const reward = 600;
      money += reward; saveMoney(); updateMoneyUI();
      unlockAchv("arrest");
      makeSparks(["#5aa0ff", "#ff5050", "#ffffff"]);   // мигалка салютует!
      document.getElementById("finish-text").textContent =
        `🚓 ЗАДЕРЖАН! Приз: +${reward} 🪙 (всего: ${adminCode ? "АДМИН" : money})`;
      show("finish", true);
    } else if (gap > 24000) {
      // Оторвался безнадёжно — побег удался
      chaseOver = true;
      raceOver = true;
      document.getElementById("finish-text").textContent =
        "😞 Преступник скрылся… Попробуй ещё раз!";
      show("finish", true);
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
      if (finalPlace === 1) {
        unlockAchv("firstwin");
        if (car.id === "buhanka") unlockAchv("buhanka1");
      }
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

  // ВТОРАЯ ДОРОГА на развилке (правка Саши: «развилка как 2 дороги»):
  // ветка с бордюрами отслаивается вбок и уходит за горизонт
  if (seg.branch) {
    const b = seg.branch;
    const o1 = b.o1 * p1.w * 2 * b.side;
    const o2 = b.o2 * p2.w * 2 * b.side;
    polygon(p1.x + o1 - p1.w - r1, p1.y, p1.x + o1 - p1.w, p1.y,
            p2.x + o2 - p2.w, p2.y, p2.x + o2 - p2.w - r2, p2.y, c.rumble);
    polygon(p1.x + o1 + p1.w + r1, p1.y, p1.x + o1 + p1.w, p1.y,
            p2.x + o2 + p2.w, p2.y, p2.x + o2 + p2.w + r2, p2.y, c.rumble);
    polygon(p1.x + o1 - p1.w, p1.y, p1.x + o1 + p1.w, p1.y,
            p2.x + o2 + p2.w, p2.y, p2.x + o2 - p2.w, p2.y, c.road);
    // И разметка — чтобы ветка выглядела ПРОДОЛЖЕНИЕМ трассы!
    if (c.lane) {
      const l1 = p1.w / 32, l2 = p2.w / 32;
      const lw1 = p1.w * 2 / LANES, lw2 = p2.w * 2 / LANES;
      let lx1 = p1.x + o1 - p1.w + lw1, lx2 = p2.x + o2 - p2.w + lw2;
      for (let lane = 1; lane < LANES; lane++) {
        polygon(lx1 - l1 / 2, p1.y, lx1 + l1 / 2, p1.y,
                lx2 + l2 / 2, p2.y, lx2 - l2 / 2, p2.y, c.lane);
        lx1 += lw1; lx2 += lw2;
      }
    }
  }

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
  } else if (spr.type === "fork") {
    // ЗНАК РАЗВИЛКИ (режим погони): синяя АРКА над дорогой со
    // стрелками — столбы по обочинам, не посреди дороги!
    const half = px(ROAD_WIDTH * 1.18);
    const pillarW = px(150), archH = px(2100), bannerH = px(640);
    ctx.fillStyle = "#c9cdd4";
    ctx.fillRect(x - half - pillarW, y - archH, pillarW, archH);
    ctx.fillRect(x + half, y - archH, pillarW, archH);
    ctx.fillStyle = "#1f5fd6";
    ctx.fillRect(x - half - pillarW, y - archH,
                 half * 2 + pillarW * 2, bannerH);
    ctx.fillStyle = "#f2f2f2";
    ctx.font = `bold ${px(430)}px Verdana`;
    ctx.textAlign = "center";
    ctx.fillText("⬅  ➡", x, y - archH + bannerH * 0.78);
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
  // ОГРОМНОЕ ЗАДНЕЕ КРЫЛО на пилоне: два этажа + боковые пластины.
  // Пилон прошивает ОБЕ плоскости до кожуха мотора — раньше не
  // доставал 1 пиксель и крыло «висело» (нашёл Саша, блокнот 21.09)
  roundRect(g, -7, -114, 14, 28, 3, "#101214");
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

// ==================== БРАТЬЯ ОДИНОЧКАМ (идея Саши) ====================

// --- Opel Astra: серебристый хэтчбек (по фото Саши) — покатое
// стекло с козырьком и фонари-капли ---
function drawAstro(g) {
  carBase(g, -26, 32);
  // Козырёк-спойлер над стеклом
  roundRect(g, -58, -108, 116, 9, 4, "#8f979e");
  // Большое покатое стекло на весь люк
  roundRect(g, -54, -100, 108, 40, 11, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-46, -94, 44, 28);
  roundRect(g, -78, -64, 156, 58, 12, "#8f979e");
  g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(-70, -63, 140, 3);
  // Молния Опаля в хромовом круге на люке
  g.strokeStyle = "#d7dce2"; g.lineWidth = 2.5;
  g.beginPath(); g.arc(0, -50, 10, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#d7dce2"; g.fillRect(-7, -51.5, 14, 3);
  g.fillRect(-2, -56, 4, 12);
  // Фонари-КАПЛИ, обнимающие углы (как на фото)
  for (const side of [-1, 1]) {
    g.fillStyle = "#7a1216";
    g.beginPath();
    g.ellipse(side * 60, -52, 20, 13, side * 0.25, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#d42323";
    g.beginPath();
    g.ellipse(side * 60, -54, 14, 7, side * 0.25, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#e8e6df";
    g.beginPath();
    g.ellipse(side * 54, -46, 7, 3.5, side * 0.25, 0, Math.PI * 2);
    g.fill();
  }
  plate(g, -32, 40);
  roundRect(g, -78, -18, 156, 9, 5, "#7d858c");
}

// --- Shelby Cobra: открытая ракета 60-х с боковыми трубами ---
function drawCobra(g) {
  carBase(g, -24, 30);
  // Низкий открытый кузов с раздутыми арками
  roundRect(g, -84, -60, 168, 54, 16, "#1d3f96");
  g.fillStyle = "rgba(255,255,255,0.2)"; g.fillRect(-76, -59, 152, 3);
  // Белые гоночные полосы (заводские!)
  g.fillStyle = "#f2f3f0";
  g.fillRect(-17, -60, 12, 54);
  g.fillRect(5, -60, 12, 54);
  // Открытая кабина: ветровое стекло и дуга
  roundRect(g, -34, -76, 68, 8, 3, "#c9d0d7");
  g.fillStyle = "#101214";
  g.beginPath(); g.ellipse(0, -60, 30, 10, 0, Math.PI, 0); g.fill();
  // Круглые фонарики
  for (const side of [-1, 1]) {
    g.fillStyle = "#7a1216";
    g.beginPath(); g.arc(side * 62, -42, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#d42323";
    g.beginPath(); g.arc(side * 62, -42, 3.5, 0, Math.PI * 2); g.fill();
  }
  // ТРУБЫ ИЗ БОКОВ (фишка Кобры!)
  roundRect(g, -92, -26, 22, 7, 3, "#c9d0d7");
  roundRect(g,  70, -26, 22, 7, 3, "#c9d0d7");
  plate(g, -34, 36);
  roundRect(g, -86, -18, 172, 8, 4, "#d7dce2");
}

// --- Land Rover Defender: квадратный, запаска на двери ---
function drawDefendor(g) {
  carBase(g, -30, 36);
  roundRect(g, -76, -126, 152, 120, 6, "#3f6d4e");
  g.fillStyle = "#e8e6df"; g.fillRect(-76, -126, 152, 12);  // белая крыша
  roundRect(g, -62, -110, 124, 32, 4, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-54, -105, 46, 22);
  g.fillStyle = "#35543f"; g.fillRect(-1.5, -110, 3, 84);   // щель двери
  // ЗАПАСКА на двери багажника
  g.fillStyle = "#1c1f23";
  g.beginPath(); g.arc(28, -56, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#2a2e33";
  g.beginPath(); g.arc(28, -56, 15, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#1c1f23";
  g.beginPath(); g.arc(28, -56, 6, 0, Math.PI * 2); g.fill();
  // Фонарики-кубики
  for (const side of [-1, 1]) {
    roundRect(g, side * 66 - 7, -64, 14, 12, 2, "#d42323");
    roundRect(g, side * 66 - 7, -50, 14, 10, 2, "#ffb35c");
  }
  plate(g, -44, 38);
  roundRect(g, -78, -22, 156, 12, 4, "#26292d");
}

// --- Peugeot 206: маленький юркий хэтч ---
function drawPejo206(g) {
  carBase(g, -24, 30);
  roundRect(g, -50, -96, 100, 40, 14, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-42, -90, 40, 28);
  roundRect(g, -70, -62, 140, 56, 13, "#c9ccd1");
  g.fillStyle = "rgba(255,255,255,0.3)"; g.fillRect(-62, -61, 124, 3);
  // Фонари-капли вдоль стекла
  for (const side of [-1, 1]) {
    roundRect(g, side * 56 - 10, -80, 20, 30, 8, "#7a1216");
    roundRect(g, side * 56 - 7, -74, 14, 12, 4, "#d42323");
    roundRect(g, side * 56 - 7, -60, 14, 7, 3, "#ffb35c");
  }
  g.fillStyle = "#8a9096"; g.font = "bold 6px Verdana"; g.textAlign = "center";
  g.fillText("🦁", 0, -50);
  g.fillText("206", 48, -38);
  plate(g, -36, 36);
  roundRect(g, -70, -18, 140, 9, 4, "#b8bcc2");
}

// --- РАФ-977 «Латвия»: бирюзовый ретро-фургончик ---
function drawRaf977(g) {
  carBase(g, -26, 32);
  // Двухцветный: белый верх, бирюзовый низ, всё круглое
  roundRect(g, -72, -122, 144, 116, 18, "#7fc4c9");
  g.fillStyle = "#f2f3f0";
  roundRect(g, -72, -122, 144, 46, 18, "#f2f3f0");
  roundRect(g, -56, -114, 112, 34, 10, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.15)"; g.fillRect(-48, -108, 44, 22);
  // Хромовый молдинг на стыке цветов
  roundRect(g, -72, -78, 144, 4, 2, "#d7dce2");
  // Круглые фонарики
  for (const side of [-1, 1]) {
    g.fillStyle = "#7a1216";
    g.beginPath(); g.arc(side * 58, -54, 6.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#d42323";
    g.beginPath(); g.arc(side * 58, -54, 4, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = "#20304c"; g.font = "italic bold 7px Verdana"; g.textAlign = "center";
  g.fillText("Latvija", 0, -88);
  plate(g, -44, 38);
  roundRect(g, -74, -20, 148, 9, 4, "#d7dce2");
}

// --- УАЗ-469 «Козлик»: открытый армейский вездеход ---
function drawUaz469(g) {
  carBase(g, -28, 34);
  // Плоский зелёный кузов с бортами
  roundRect(g, -74, -84, 148, 78, 6, "#5a6e4a");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-66, -83, 132, 3);
  // Сложенный брезент валиком наверху
  roundRect(g, -66, -96, 132, 12, 6, "#4d5f3f");
  g.fillStyle = "rgba(0,0,0,0.15)";
  for (const x of [-50, -25, 0, 25]) g.fillRect(x, -95, 3, 10);
  // ЗАПАСКА на корме
  g.fillStyle = "#1c1f23";
  g.beginPath(); g.arc(-30, -52, 20, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#2a2e33";
  g.beginPath(); g.arc(-30, -52, 13, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#1c1f23";
  g.beginPath(); g.arc(-30, -52, 5, 0, Math.PI * 2); g.fill();
  // Канистра справа
  roundRect(g, 34, -70, 24, 30, 3, "#44543a");
  g.fillStyle = "rgba(0,0,0,0.2)"; g.fillRect(38, -66, 16, 3);
  // Фонарики
  for (const side of [-1, 1]) {
    g.fillStyle = "#d42323";
    g.beginPath(); g.arc(side * 66, -38, 4.5, 0, Math.PI * 2); g.fill();
  }
  plate(g, -30, 34);
  roundRect(g, -76, -18, 152, 8, 3, "#3d4a33");
}

// --- ЗИС-101: мирный чёрный лимузин 30-х ---
function drawZis101(g) {
  carBase(g);
  // Высокая округлая корма с покатой спиной
  roundRect(g, -52, -108, 104, 40, 16, "#17191c");
  roundRect(g, -40, -102, 80, 26, 8, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-34, -98, 30, 18);
  roundRect(g, -76, -72, 152, 66, 14, "#17191c");
  g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(-68, -71, 136, 3);
  // Отдельные крылья над колёсами
  g.fillStyle = "#101214";
  g.beginPath(); g.ellipse(-64, -22, 24, 16, 0, Math.PI, 0); g.fill();
  g.beginPath(); g.ellipse( 64, -22, 24, 16, 0, Math.PI, 0); g.fill();
  // Хромовая полоса и фонарики-жучки
  roundRect(g, -56, -50, 112, 2.5, 1, "#d7dce2");
  for (const side of [-1, 1]) {
    g.fillStyle = "#7a1216";
    g.beginPath(); g.arc(side * 46, -40, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#d42323";
    g.beginPath(); g.arc(side * 46, -40, 3, 0, Math.PI * 2); g.fill();
  }
  plate(g, -34, 36);
  roundRect(g, -70, -18, 140, 8, 4, "#d7dce2");
}

// --- Болид Ф-2: оранжевый младший брат Ф-1 ---
function drawF2(g) {
  g.fillStyle = "rgba(0,0,0,0.38)";
  g.beginPath(); g.ellipse(0, 8, 96, 12, 0, 0, Math.PI * 2); g.fill();
  // Открытые колёса
  roundRect(g, -94, -34, 26, 40, 8, "#121212");
  roundRect(g,  68, -34, 26, 40, 8, "#121212");
  // Крыло на пилонах
  roundRect(g, -70, -96, 140, 10, 3, "#e87608");
  roundRect(g, -10, -86, 20, 10, 2, "#26292d");
  // Узкий корпус-сигара
  roundRect(g, -26, -76, 52, 70, 10, "#ff8c1a");
  g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(-18, -75, 36, 3);
  g.fillStyle = "#17191c";
  g.fillRect(-26, -46, 52, 8);
  g.fillStyle = "#f2f3f0"; g.font = "bold 10px Verdana"; g.textAlign = "center";
  g.fillText("2", 0, -20);
  // Диффузор и огонёк
  roundRect(g, -30, -12, 60, 7, 2, "#1c1f23");
  g.fillStyle = "#e82121";
  g.beginPath(); g.arc(0, -55, 3.5, 0, Math.PI * 2); g.fill();
  // Тяги подвески к колёсам
  g.strokeStyle = "#26292d"; g.lineWidth = 4;
  g.beginPath(); g.moveTo(-26, -30); g.lineTo(-70, -22); g.stroke();
  g.beginPath(); g.moveTo( 26, -30); g.lineTo( 70, -22); g.stroke();
}

// --- Koenigsegg Agera: круглая корма, брат Гемеры ---
function drawAgera(g) {
  carBase(g, -24, 30);
  roundRect(g, -28, -96, 56, 18, 8, "#1a2026");   // узкое стекло
  // Широкое округлое тело
  roundRect(g, -90, -78, 180, 72, 18, "#5a5e63");
  g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(-80, -77, 160, 3);
  // Круглая тёмная корма-чаша
  g.fillStyle = "#26292d";
  g.beginPath(); g.ellipse(0, -40, 62, 30, 0, 0, Math.PI * 2); g.fill();
  // Круглые фонари-кольца
  for (const side of [-1, 1]) {
    g.strokeStyle = "#e82121"; g.lineWidth = 3.5;
    g.beginPath(); g.arc(side * 40, -46, 9, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#e82121";
    g.beginPath(); g.arc(side * 40, -46, 3, 0, Math.PI * 2); g.fill();
  }
  // Одна центральная труба
  g.fillStyle = "#15171a";
  g.beginPath(); g.arc(0, -34, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#000";
  g.beginPath(); g.arc(0, -34, 6, 0, Math.PI * 2); g.fill();
  // Эмблемка-щит
  roundRect(g, -5, -70, 10, 12, 2, "#c9a11c");
  plate(g, -24, 34);
  g.fillStyle = "#101214";
  for (const x of [-66, -44, 30, 52]) {
    g.beginPath();
    g.moveTo(x, -6); g.lineTo(x + 12, -6); g.lineTo(x + 9, -20); g.lineTo(x + 3, -20);
    g.closePath(); g.fill();
  }
}

// --- Pagani Zonda: четыре трубы кругом, брат Вайры ---
function drawZonta(g) {
  carBase(g, -24, 30);
  // Дуга-крыло на стойках
  roundRect(g, -80, -100, 160, 8, 4, "#15171a");
  roundRect(g, -50, -92, 7, 16, 3, "#26292d");
  roundRect(g,  43, -92, 7, 16, 3, "#26292d");
  roundRect(g, -30, -92, 60, 18, 8, "#1a2026");   // стекло-пузырь
  roundRect(g, -90, -76, 180, 70, 16, "#c9ccd1");
  g.fillStyle = "rgba(255,255,255,0.3)"; g.fillRect(-80, -75, 160, 3);
  // По два овальных фонарика с каждой стороны
  for (const side of [-1, 1]) {
    for (const dy of [0, 14]) {
      g.fillStyle = "#3d0a0a";
      g.beginPath(); g.ellipse(side * 62, -58 + dy, 9, 6, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#e82121"; g.lineWidth = 2;
      g.beginPath(); g.ellipse(side * 62, -58 + dy, 6, 4, 0, 0, Math.PI * 2); g.stroke();
    }
  }
  // ЧЕТЫРЕ трубы КРУГОМ в центре (фишка Зонды!)
  g.fillStyle = "#15171a";
  g.beginPath(); g.arc(0, -46, 17, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#26292d";
  for (const [dx, dy] of [[-7, -53], [7, -53], [-7, -39], [7, -39]]) {
    g.beginPath(); g.arc(dx, dy, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#000";
    g.beginPath(); g.arc(dx, dy, 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#26292d";
  }
  plate(g, -26, 34);
  roundRect(g, -90, -22, 180, 14, 7, "#141618");
}

// --- SSC Ultimate Aero: бывшая быстрейшая, брат Туатары ---
function drawAero(g) {
  carBase(g, -24, 30);
  roundRect(g, -32, -94, 64, 18, 8, "#1a2026");
  // Гладкая белая капля
  roundRect(g, -88, -76, 176, 70, 16, "#f2f3f0");
  g.fillStyle = "rgba(255,255,255,0.45)"; g.fillRect(-78, -75, 156, 3);
  // Чёрные воздухозаборники на плечах
  roundRect(g, -78, -70, 30, 12, 6, "#15171a");
  roundRect(g,  48, -70, 30, 12, 6, "#15171a");
  // Тонкие фонари
  for (const side of [-1, 1]) {
    roundRect(g, side * 58 - 20, -56, 40, 9, 4, "#2a0d0d");
    roundRect(g, side * 58 - 17, -54, 34, 5, 2, "#e82121");
  }
  // Двойные трубы по центру
  g.fillStyle = "#15171a";
  for (const dx of [-10, 10]) {
    g.beginPath(); g.arc(dx, -36, 6.5, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = "#000";
  for (const dx of [-10, 10]) {
    g.beginPath(); g.arc(dx, -36, 4, 0, Math.PI * 2); g.fill();
  }
  plate(g, -26, 34);
  roundRect(g, -88, -22, 176, 14, 6, "#141618");
  g.fillStyle = "#0a0c0e";
  for (const x of [-64, -42, 32, 54]) {
    g.beginPath();
    g.moveTo(x, -8); g.lineTo(x + 10, -8); g.lineTo(x + 7, -22); g.lineTo(x + 3, -22);
    g.closePath(); g.fill();
  }
}

// Круглая эмблема-пропеллер BNW — ПОДДЕЛЬНАЯ (правка Саши):
// у настоящей четвертинки сине-белые, у нашей — ЗЕЛЁНО-белые!
function bnwBadge(g, x, y, r) {
  g.fillStyle = "#17191c";
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#2f9e41";
  g.beginPath(); g.moveTo(x, y); g.arc(x, y, r * 0.62, -Math.PI / 2, 0); g.fill();
  g.beginPath(); g.moveTo(x, y); g.arc(x, y, r * 0.62, Math.PI / 2, Math.PI); g.fill();
  g.fillStyle = "#e8e6df";
  g.beginPath(); g.moveTo(x, y); g.arc(x, y, r * 0.62, 0, Math.PI / 2); g.fill();
  g.beginPath(); g.moveTo(x, y); g.arc(x, y, r * 0.62, Math.PI, Math.PI * 1.5); g.fill();
}

// --- BMW M3 E30: чёрная легенда (по фото Саши) — приподнятый
// спойлер и красная полоска на бампере ---
function drawM3e30(g) {
  carBase(g);
  roundRect(g, -52, -98, 104, 34, 5, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-44, -93, 40, 24);
  // Приподнятый спойлер на ножках (как на фото!)
  roundRect(g, -52, -78, 104, 7, 3, "#15171b");
  roundRect(g, -40, -71, 6, 7, 2, "#101214");
  roundRect(g,  34, -71, 6, 7, 2, "#101214");
  roundRect(g, -84, -66, 168, 60, 7, "#1d1f24");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-76, -65, 152, 3);
  // Широкие полосатые фонари E30
  for (const side of [-1, 1]) {
    roundRect(g, side * 54 - 26, -58, 52, 16, 3, "#1c1f23");
    roundRect(g, side * 54 - 23, -55, 46, 5, 1, "#c22020");
    roundRect(g, side * 54 - 23, -49, 46, 4, 1, "#7a1216");
  }
  bnwBadge(g, 0, -56, 8);
  g.fillStyle = "#c9d0d7"; g.font = "italic bold 7px Verdana"; g.textAlign = "center";
  g.fillText("M3", 62, -38);
  plate(g, -40);
  // Чёрный бампер с КРАСНОЙ полоской во всю ширину (фишка с фото!)
  roundRect(g, -84, -22, 168, 12, 5, "#26292d");
  roundRect(g, -80, -13, 160, 2.5, 1, "#c22020");
}

// --- BMW M5: красный седан-ракета (по фото Саши) ---
function drawM5(g) {
  carBase(g);
  roundRect(g, -54, -98, 108, 34, 9, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-46, -93, 40, 24);
  // Губа-спойлер на кромке багажника
  roundRect(g, -56, -68, 112, 4, 2, "#8f171f");
  roundRect(g, -86, -66, 172, 60, 10, "#c5232c");
  g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(-78, -65, 156, 3);
  // Фонари-УГОЛКИ (правка Саши: «L-соединение»): горизонталь лежит
  // на верхней кромке багажника, вертикаль спускается по краю,
  // и они СОЕДИНЯЮТСЯ в самом углу кузова
  for (const side of [-1, 1]) {
    // тёмный корпус буквой L: ножка ВВЕРХ по краю, ступня ВНИЗУ к центру
    roundRect(g, side * 78 - 4, -66, 8, 26, 3, "#2a0d0d");
    roundRect(g, side * 60 - 26, -48, 52, 8, 3, "#2a0d0d");
    // красное свечение той же буквой
    roundRect(g, side * 78 - 2, -64, 4, 22, 2, "#e82121");
    roundRect(g, side * 60 - 23, -46, 47, 4, 2, "#e82121");
  }
  bnwBadge(g, 0, -56, 8);
  g.fillStyle = "#c9d0d7"; g.font = "italic bold 7px Verdana"; g.textAlign = "center";
  g.fillText("M5", -62, -28);   // ниже (правка Саши) — под ступнёй фары
  plate(g, -42);
  // Диффузор и ЧЕТЫРЕ круглые трубы
  roundRect(g, -86, -24, 172, 15, 6, "#17191c");
  for (const x of [-62, -46, 46, 62]) {
    g.strokeStyle = "#c9d0d7"; g.lineWidth = 2.5;
    g.beginPath(); g.arc(x, -16, 5.5, 0, Math.PI * 2); g.stroke();
  }
}

// --- МАШИНА ВРЕМЕНИ: Делориан + решётки из кино (награда за
// достижение «88 миль в час», по фото Саши) ---
function drawTimeMachine(g) {
  drawDelorean(g);   // низ — обычный TimeLorean из нержавейки
  // ЧЁРНЫЙ КАБЕЛЬ-ЗМЕЙКА через всю палубу (ещё деталей — Саша!)
  g.strokeStyle = "#111316"; g.lineWidth = 4; g.lineCap = "round";
  g.beginPath();
  g.moveTo(-52, -56);
  g.quadraticCurveTo(-26, -66, 0, -56);
  g.quadraticCurveTo(26, -66, 52, -56);
  g.stroke();
  g.lineCap = "butt";
  // Хромовые трубки-дуги СНАРУЖИ кузова — мимо фар (правка Саши)!
  g.strokeStyle = "#c9d0d7"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(-93, -26); g.quadraticCurveTo(-98, -80, -60, -90); g.stroke();
  g.beginPath(); g.moveTo( 93, -26); g.quadraticCurveTo( 98, -80,  60, -90); g.stroke();
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(-94, -20); g.quadraticCurveTo(-102, -74, -64, -94); g.stroke();
  g.beginPath(); g.moveTo( 94, -20); g.quadraticCurveTo( 102, -74,  64, -94); g.stroke();
  // КРУГЛАЯ ТУРБИНА с жёлтой сердцевиной — за реактором (с фото!)
  circle(g, 0, -94, 17, "#17191c");
  g.strokeStyle = "#3d434a"; g.lineWidth = 2.5;
  g.beginPath(); g.arc(0, -94, 12.5, 0, Math.PI * 2); g.stroke();
  circle(g, 0, -94, 7, "#e8c11c");
  g.fillStyle = "#17191c";
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    g.fillRect(Math.cos(ang) * 4 - 0.8, -94 + Math.sin(ang) * 4 - 2.5, 1.6, 5);
  }
  // СЕРЫЙ РЕАКТОР между решётками (правка Саши: больше деталей!):
  // блок с прорезями, синие катушки и шланги к решёткам — как в кино
  roundRect(g, -17, -86, 34, 26, 4, "#5c6166");
  g.fillStyle = "#3d434a";
  g.fillRect(-13, -82, 26, 3.5);
  g.fillRect(-13, -66, 26, 3);
  g.fillStyle = "#2a6db8";                 // синие катушки
  roundRect(g, -14, -77, 9, 10, 2, "#2a6db8");
  roundRect(g,   5, -77, 9, 10, 2, "#2a6db8");
  g.fillStyle = "#8fd4ff";
  g.fillRect(-12, -74, 5, 4); g.fillRect(7, -74, 5, 4);
  circle(g, 0, -88, 2.6, "#ff4040");       // красный огонёк сверху
  // Шланги от реактора к решёткам
  g.strokeStyle = "#26292d"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(-17, -70); g.quadraticCurveTo(-26, -62, -32, -66); g.stroke();
  g.beginPath(); g.moveTo( 17, -70); g.quadraticCurveTo( 26, -62,  32, -66); g.stroke();
  // Серые трубы-колена от реактора вниз к палубе (с фото)
  g.strokeStyle = "#8a9096"; g.lineWidth = 5; g.lineCap = "round";
  g.beginPath(); g.moveTo(-14, -62); g.quadraticCurveTo(-22, -56, -30, -58); g.stroke();
  g.beginPath(); g.moveTo( 14, -62); g.quadraticCurveTo( 22, -56,  30, -58); g.stroke();
  g.lineCap = "butt";
  // Золотая решёточка на палубе под турбиной
  roundRect(g, -11, -58, 22, 7, 2, "#c9a11c");
  g.fillStyle = "#6d5410";
  for (let k = 0; k < 3; k++) g.fillRect(-8 + k * 7, -56.5, 4.5, 4);
  // Две решётки-ЭТАЖЕРКИ (по чёткому фото Саши): тонкий стальной
  // каркас с полочками, стоят ровно, основаниями на фарах
  for (const side of [-1, 1]) {
    const x0 = side * 42 - 16;
    roundRect(g, x0, -100, 32, 56, 2, "#191c20");
    g.strokeStyle = "#aeb4bc"; g.lineWidth = 2;
    g.strokeRect(x0 + 1, -99, 30, 54);
    g.beginPath();
    g.moveTo(x0 + 16, -99); g.lineTo(x0 + 16, -45);       // средник
    for (let r = 1; r < 4; r++) {                          // полочки
      g.moveTo(x0 + 1, -99 + r * 13.5);
      g.lineTo(x0 + 31, -99 + r * 13.5);
    }
    g.stroke();
  }
  // Заклёпки на реакторе
  g.fillStyle = "#3d434a";
  for (const [bx, by] of [[-14, -84], [14, -84], [-14, -63], [14, -63]])
    circle(g, bx, by, 1.6, "#3d434a");
  // Голубое свечение потокового конденсатора над реактором
  g.fillStyle = "rgba(80, 180, 255, 0.30)";
  g.beginPath(); g.ellipse(0, -100, 15, 10, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#8fd4ff";
  g.beginPath(); g.ellipse(0, -100, 6, 4, 0, 0, Math.PI * 2); g.fill();
}

// --- ПОЛИЦЕЙСКИЙ ДОДЖ: чёрный, мигалка, POLICE (блокнот Саши) ---
function drawPolice(g) {
  carBase(g);
  // МИГАЛКА на крыше: синий и красный плафоны на планке
  roundRect(g, -32, -106, 64, 6, 2, "#26292d");
  roundRect(g, -28, -114, 24, 9, 3, "#2a6db8");
  roundRect(g,   4, -114, 24, 9, 3, "#d42323");
  g.fillStyle = "rgba(90, 160, 255, 0.35)";
  g.beginPath(); g.ellipse(-16, -116, 14, 7, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "rgba(255, 80, 80, 0.35)";
  g.beginPath(); g.ellipse( 16, -116, 14, 7, 0, 0, Math.PI * 2); g.fill();
  // Стекло и чёрный кузов Чарджера
  roundRect(g, -54, -98, 108, 34, 7, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.09)"; g.fillRect(-46, -93, 40, 24);
  roundRect(g, -86, -68, 172, 62, 8, "#17191c");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-78, -67, 156, 3);
  // Красная лента фонарей (как у Чарджера)
  roundRect(g, -72, -62, 144, 12, 5, "#8f0f0f");
  roundRect(g, -68, -59, 136, 6, 3, "#e82121");
  // БЕЛАЯ полоса со звездой и надписью POLICE
  roundRect(g, -78, -44, 156, 16, 3, "#e8e6df");
  g.fillStyle = "#17191c";
  g.font = "bold 10px Verdana";
  g.textAlign = "center";
  g.fillText("P O L I C E", 0, -32);
  g.fillStyle = "#c9a11c";                       // золотая звезда слева
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 5.5 : 2.4;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    g[i === 0 ? "moveTo" : "lineTo"](-64 + Math.cos(a) * r, -36 + Math.sin(a) * r);
  }
  g.closePath(); g.fill();
  // Номер на бампере и усиленный чёрный бампер-таран
  plate(g, -24, 38);
  roundRect(g, -88, -26, 176, 6, 3, "#26292d");
  roundRect(g, -86, -12, 172, 6, 3, "#101214");
}

// --- Tesla Cybertruck: стальной треугольник (по фото Саши) ---
function drawCybercraft(g) {
  g.fillStyle = "rgba(0,0,0,0.38)";
  g.beginPath(); g.ellipse(0, 8, 96, 12, 0, 0, Math.PI * 2); g.fill();
  roundRect(g, -80, -30, 30, 36, 5, "#121212");
  roundRect(g,  50, -30, 30, 36, 5, "#121212");
  // Кузов-ТРАПЕЦИЯ из нержавейки: углы, только углы!
  g.fillStyle = "#c9ccd1";
  g.beginPath();
  g.moveTo(-90, -6); g.lineTo(-76, -86); g.lineTo(76, -86); g.lineTo(90, -6);
  g.closePath(); g.fill();
  g.fillStyle = "rgba(255,255,255,0.3)";
  g.beginPath();
  g.moveTo(-74, -84); g.lineTo(74, -84); g.lineTo(73, -80); g.lineTo(-73, -80);
  g.closePath(); g.fill();
  // Крышка кузова — тёмная плоскость сверху
  g.fillStyle = "#9aa0a6";
  g.beginPath();
  g.moveTo(-72, -86); g.lineTo(72, -86); g.lineTo(64, -96); g.lineTo(-64, -96);
  g.closePath(); g.fill();
  // ОРАНЖЕВАЯ полоса-фонарь во всю ширину со свечением
  g.fillStyle = "rgba(255, 123, 42, 0.30)";
  g.beginPath(); g.ellipse(0, -78, 84, 8, 0, 0, Math.PI * 2); g.fill();
  roundRect(g, -75, -80, 150, 5, 2, "#3a1505");
  roundRect(g, -73, -79, 146, 3, 1, "#ff7b2a");
  // Угловатые чёрные арки колёс
  g.fillStyle = "#141618";
  g.beginPath();
  g.moveTo(-90, -6); g.lineTo(-85, -38); g.lineTo(-56, -38); g.lineTo(-48, -6);
  g.closePath(); g.fill();
  g.beginPath();
  g.moveTo(90, -6); g.lineTo(85, -38); g.lineTo(56, -38); g.lineTo(48, -6);
  g.closePath(); g.fill();
  // Чистая корма без надписей — Саша попросил убрать глиф и имя
  plate(g, -38, 40);
  // Тёмный низ-бампер
  roundRect(g, -70, -18, 140, 9, 3, "#2a2e33");
}

// --- Tesla Model S: ЧЁРНАЯ тихая молния (по фото Саши) ---
function drawModelS(g) {
  carBase(g);
  // Огромное покатое стекло
  roundRect(g, -58, -98, 116, 36, 13, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(-50, -93, 44, 26);
  // Губа-спойлер на кромке багажника
  roundRect(g, -50, -64, 100, 4, 2, "#0b0d0f");
  roundRect(g, -86, -62, 172, 56, 12, "#17191c");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-78, -61, 156, 3);
  // Раздельные фонари-уголки, обнимающие края
  for (const side of [-1, 1]) {
    g.fillStyle = "#3d0a0a";
    g.beginPath();
    g.ellipse(side * 66, -52, 17, 9, side * 0.18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#c22020";
    g.beginPath();
    g.ellipse(side * 66, -53, 12, 5, side * 0.18, 0, Math.PI * 2);
    g.fill();
  }
  // ХРОМОВАЯ планка через багажник с буквами T E S L Y
  roundRect(g, -46, -54, 92, 6, 3, "#c9d0d7");
  g.fillStyle = "#15171a"; // не цвет кузова — чтобы буквы не перекрашивались
  g.font = "bold 5px Verdana"; g.textAlign = "center";
  g.fillText("T E S L Y", 0, -49.5);
  // Эмблема "T" над планкой
  g.fillStyle = "#c9d0d7";
  g.fillRect(-5, -61, 10, 2);
  g.fillRect(-1.5, -59, 3, 6);
  plate(g, -40);
  // Гладкий низ БЕЗ выхлопных труб — электричество же!
  roundRect(g, -86, -18, 172, 10, 5, "#26292d");
  roundRect(g, -40, -13, 80, 3.5, 2, "#5c6166");
}

// --- Astin Martun DB5: серебристая машина шпиона №007 (по фото Саши) ---
function drawDB5(g) {
  carBase(g);
  // Округлая крыша-купол (второй цвет слота — перекрасится тёмным оттенком)
  roundRect(g, -50, -100, 100, 36, 18, "#b4bac0");
  roundRect(g, -44, -96, 88, 26, 12, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-36, -92, 32, 16);
  // Покатый серебристый кузов с круглыми плечами
  roundRect(g, -82, -66, 164, 58, 18, "#ccd2d6");
  g.fillStyle = "rgba(255,255,255,0.30)"; g.fillRect(-70, -65, 140, 3);
  // Вертикальные фонари-капли по краям: стоп + янтарный поворотник
  for (const side of [-1, 1]) {
    roundRect(g, side * 70 - 6, -58, 12, 26, 6, "#3d0a0a");
    roundRect(g, side * 70 - 4, -55, 8, 9, 4, "#e82121");
    roundRect(g, side * 70 - 4, -44, 8, 9, 4, "#e8b021");
  }
  // Крылатый значок на багажнике
  g.fillStyle = "#e6eaee";
  g.beginPath(); g.ellipse(0, -59, 15, 4.5, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#15171a";
  g.font = "bold 5px Verdana"; g.textAlign = "center";
  g.fillText("DB5", 0, -56.5);
  // Вращающийся номер шпиона — в толстой рамке-механизме
  roundRect(g, -25, -41, 50, 16, 3, "#8a9096");
  plate(g, -39);
  // Хромовый бампер с клыками и две выхлопные трубы
  roundRect(g, -80, -22, 160, 9, 4, "#c2c8ce");
  roundRect(g, -46, -24, 7, 13, 3, "#b8bec4");
  roundRect(g,  39, -24, 7, 13, 3, "#b8bec4");
  roundRect(g, -34, -12, 12, 5, 2, "#7c8288");
  roundRect(g,  22, -12, 12, 5, 2, "#7c8288");
}

// --- Astin Martun DBS: зелёный супер-GT нового шпиона ---
function drawDBS(g) {
  carBase(g);
  // Широченное покатое стекло
  roundRect(g, -56, -96, 112, 32, 12, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(-48, -91, 42, 22);
  // Мускулистый АЛЫЙ кузов (по фото Саши)
  roundRect(g, -88, -68, 176, 58, 12, "#c0242c");
  g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(-80, -67, 160, 3);
  // Кромка «утиный хвост» на багажнике (второй цвет слота)
  roundRect(g, -52, -70, 104, 5, 2, "#8f151c");
  // Фонари-ЛЕЗВИЯ (по фото): тонкая полоса от середины багажника наружу,
  // с изломом загибается вниз за угол кузова
  for (const side of [-1, 1]) {
    const s = side;
    g.fillStyle = "#2a0808";      // тёмная подложка-лезвие
    g.beginPath();
    g.moveTo(s * 22, -61); g.lineTo(s * 78, -64); g.lineTo(s * 87, -50);
    g.lineTo(s * 80, -47); g.lineTo(s * 73, -56); g.lineTo(s * 22, -53);
    g.closePath(); g.fill();
    g.fillStyle = "#ff2d2d";      // светящаяся нить внутри
    g.beginPath();
    g.moveTo(s * 25, -59); g.lineTo(s * 76, -61.5); g.lineTo(s * 83.5, -50.5);
    g.lineTo(s * 80.5, -49); g.lineTo(s * 73.5, -58); g.lineTo(s * 25, -55.5);
    g.closePath(); g.fill();
  }
  // Крылатый значок и имя модели
  g.fillStyle = "#e6eaee";
  g.beginPath(); g.ellipse(0, -62, 13, 4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#e8c9cb";
  g.font = "bold 5px Verdana"; g.textAlign = "center";
  g.fillText("DBS", 58, -36);
  plate(g, -42);
  // Огромный чёрный диффузор, ЧЕТЫРЕ трубы парами в центре (как на фото)
  roundRect(g, -84, -24, 168, 14, 5, "#101214");
  for (const x of [-38, -23, 11, 26]) roundRect(g, x, -20, 12, 7, 3, "#4a4f54");
}

// Роспись-автограф Mazerety — используют все машины марки
function mazeretyScript(g, y, color) {
  g.fillStyle = color;
  g.font = "italic bold 7px Georgia"; g.textAlign = "center";
  g.fillText("Mazerety", 0, y);
}
// Овальный значок Tayoda: колечко с перекладиной
function tayodaBadge(g, y) {
  g.strokeStyle = "#c9d0d7"; g.lineWidth = 2;
  g.beginPath(); g.ellipse(0, y, 8, 5.5, 0, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.ellipse(0, y, 3.2, 5.5, 0, 0, Math.PI * 2); g.stroke();
}

// ---------- МЕГА-ДЕНЬ: 20 машин по фото Саши ----------

// --- BNW M2: красный злой малыш, четыре трубы парами ---
function drawM2(g) {
  carBase(g);
  roundRect(g, -50, -96, 100, 32, 8, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-42, -91, 38, 22);
  roundRect(g, -86, -66, 172, 60, 9, "#d0342c");
  g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(-78, -65, 156, 3);
  // Тонкие фонари с изогнутой красной нитью
  for (const side of [-1, 1]) {
    roundRect(g, side * 58 - 24, -60, 48, 10, 5, "#2a0d0d");
    roundRect(g, side * 58 - 21, -58, 42, 4, 2, "#e82121");
  }
  bnwBadge(g, 0, -54, 8);
  g.fillStyle = "#c9d0d7"; g.font = "italic bold 7px Verdana"; g.textAlign = "center";
  g.fillText("M2", 62, -40);
  plate(g, -42);
  // Рубленый диффузор, трубы ПАРАМИ ближе к центру (как на фото)
  g.fillStyle = "#17191c";
  g.beginPath();
  g.moveTo(-80, -26); g.lineTo(80, -26); g.lineTo(70, -8); g.lineTo(-70, -8);
  g.closePath(); g.fill();
  for (const x of [-46, -32, 32, 46]) {
    g.strokeStyle = "#c9d0d7"; g.lineWidth = 2.5;
    g.beginPath(); g.arc(x, -17, 5, 0, Math.PI * 2); g.stroke();
  }
}

// --- BNW M4 Competition: зелёный, как гоночный газон ---
function drawM4(g) {
  carBase(g);
  roundRect(g, -52, -96, 104, 32, 10, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-44, -91, 40, 22);
  roundRect(g, -54, -66, 108, 4, 2, "#12291d");     // губа-спойлер
  roundRect(g, -86, -64, 172, 58, 9, "#1e5c40");
  g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(-78, -63, 156, 3);
  // Узкие косые фонари
  for (const side of [-1, 1]) {
    roundRect(g, side * 56 - 25, -58, 50, 9, 4.5, "#2a0d0d");
    roundRect(g, side * 56 - 22, -56, 44, 4, 2, "#e82121");
  }
  bnwBadge(g, 0, -52, 8);
  g.fillStyle = "#c9d0d7"; g.font = "italic bold 7px Verdana"; g.textAlign = "center";
  g.fillText("M4", 62, -38);
  plate(g, -40);
  // Карбоновый диффузор с рёбрами и четыре трубы парами
  roundRect(g, -80, -24, 160, 15, 5, "#141618");
  g.fillStyle = "#26292d";
  for (const x of [-12, 0, 12]) g.fillRect(x - 1.5, -22, 3, 11);
  for (const x of [-52, -38, 38, 52]) {
    g.strokeStyle = "#c9d0d7"; g.lineWidth = 2.5;
    g.beginPath(); g.arc(x, -16, 5, 0, Math.PI * 2); g.stroke();
  }
}

// --- BNW 750: серебристый флагман, хром между фонарями ---
function drawB750(g) {
  carBase(g);
  roundRect(g, -54, -96, 108, 32, 9, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-46, -91, 42, 22);
  roundRect(g, -86, -66, 172, 60, 10, "#c8ccd2");
  g.fillStyle = "rgba(255,255,255,0.30)"; g.fillRect(-78, -65, 156, 3);
  // Тонкие фонари, соединённые хромовой полосой
  roundRect(g, -70, -55, 140, 3, 1.5, "#c9d0d7");
  for (const side of [-1, 1]) {
    roundRect(g, side * 60 - 22, -59, 44, 10, 5, "#2a0d0d");
    roundRect(g, side * 60 - 19, -57, 38, 5, 2.5, "#e82121");
  }
  bnwBadge(g, 0, -62, 7);
  g.fillStyle = "#63666e"; g.font = "bold 6px Verdana"; g.textAlign = "center";
  g.fillText("750", 64, -40);
  plate(g, -42);
  // Аккуратный низ с трапециями выхлопа
  roundRect(g, -84, -22, 168, 12, 5, "#3d4247");
  roundRect(g, -60, -18, 20, 6, 2, "#7c8288");
  roundRect(g,  40, -18, 20, 6, 2, "#7c8288");
}

// --- BNW i7: чёрный электро-лимузин (категория Э растёт!) ---
function drawI7(g) {
  carBase(g);
  roundRect(g, -54, -98, 108, 34, 10, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(-46, -93, 42, 24);
  roundRect(g, -86, -66, 172, 60, 11, "#26282c");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-78, -65, 156, 3);
  // Раздвоенные тонкие фонари почти во всю ширину
  for (const side of [-1, 1]) {
    roundRect(g, side * 46 - 34, -58, 68, 8, 4, "#2a0d0d");
    roundRect(g, side * 46 - 31, -56, 62, 3.5, 1.5, "#e82121");
  }
  bnwBadge(g, 0, -54, 8);
  g.fillStyle = "#8fb6e8"; g.font = "bold 6px Verdana"; g.textAlign = "center";
  g.fillText("i7", 66, -40);   // голубая буква — электричество!
  plate(g, -42);
  // Гладкий низ БЕЗ труб + хромовый штрих
  roundRect(g, -84, -22, 168, 12, 5, "#17191c");
  roundRect(g, -70, -12, 140, 2.5, 1, "#7c8288");
}

// --- Astin Martun Vantage: световая дуга через всю корму ---
function drawVantage(g) {
  carBase(g);
  roundRect(g, -52, -92, 104, 30, 14, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-44, -87, 40, 20);
  roundRect(g, -50, -64, 100, 4, 2, "#6e757c");   // утиный хвост
  roundRect(g, -86, -62, 172, 56, 13, "#9aa1a8");
  g.fillStyle = "rgba(255,255,255,0.22)"; g.fillRect(-78, -61, 156, 3);
  // ДУГА-фонарь: единая красная лента изгибом через корму (фишка фото!)
  g.strokeStyle = "#2a0808"; g.lineWidth = 8;
  g.beginPath(); g.moveTo(-76, -42); g.quadraticCurveTo(0, -62, 76, -42); g.stroke();
  g.strokeStyle = "#e82121"; g.lineWidth = 3.5;
  g.beginPath(); g.moveTo(-74, -42); g.quadraticCurveTo(0, -60, 74, -42); g.stroke();
  // Крылатый значок
  g.fillStyle = "#e6eaee";
  g.beginPath(); g.ellipse(0, -66, 13, 4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#33363b"; g.font = "bold 5px Verdana"; g.textAlign = "center";
  g.fillText("VANTAGE", 0, -30);
  plate(g, -26, 36);
  // Чёрный низ и две трубы по краям
  roundRect(g, -80, -12, 160, 7, 3, "#101214");
  circle(g, -58, -16, 5, "#26292d"); circle(g, -58, -16, 3, "#4a4f54");
  circle(g,  58, -16, 5, "#26292d"); circle(g,  58, -16, 3, "#4a4f54");
}

// --- Astin Martun DBX: вездеход-шпион с белой крышей ---
function drawDBX(g) {
  carBase(g, -30, 38);
  // Белая крыша-купол (как на фото-концепте)
  roundRect(g, -50, -110, 100, 24, 12, "#e6eaee");
  roundRect(g, -46, -104, 92, 26, 10, "#1a2026");
  roundRect(g, -86, -78, 172, 70, 12, "#3f444a");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-78, -77, 156, 3);
  // КРАСНАЯ лента-фонарь во всю ширину
  roundRect(g, -74, -66, 148, 7, 3.5, "#2a0808");
  roundRect(g, -71, -64.5, 142, 4, 2, "#e82121");
  // Крылатый значок и хромовый клин бампера
  g.fillStyle = "#e6eaee";
  g.beginPath(); g.ellipse(0, -74, 13, 4, 0, 0, Math.PI * 2); g.fill();
  plate(g, -50);
  roundRect(g, -70, -30, 140, 3.5, 1.5, "#aab0b6");
  roundRect(g, -84, -24, 168, 13, 5, "#17191c");
}

// --- Astin Martun Rapide S: белый четырёхдверный красавец ---
function drawRapide(g) {
  carBase(g);
  roundRect(g, -50, -94, 100, 30, 13, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(-42, -89, 38, 20);
  roundRect(g, -84, -66, 168, 60, 15, "#eceef0");
  g.fillStyle = "rgba(255,255,255,0.45)"; g.fillRect(-76, -65, 152, 3);
  // Вытянутые тёмные фонари по краям
  for (const side of [-1, 1]) {
    roundRect(g, side * 60 - 22, -60, 44, 13, 6, "#26292d");
    roundRect(g, side * 60 - 19, -57, 38, 6, 3, "#c22020");
  }
  // Крылатый значок и решётка воздуховода на багажнике
  g.fillStyle = "#8f959c";
  g.beginPath(); g.ellipse(0, -60, 13, 4, 0, 0, Math.PI * 2); g.fill();
  roundRect(g, -16, -70, 32, 4, 2, "#c9ccd1");
  g.fillStyle = "#8f959c"; g.font = "bold 4.5px Verdana"; g.textAlign = "center";
  g.fillText("RAPIDE S", 56, -38);
  plate(g, -42);
  // Светлый бампер, две трубы-овала по краям
  roundRect(g, -82, -22, 164, 12, 6, "#d2d5d9");
  circle(g, -66, -14, 5, "#33363b"); circle(g, 66, -14, 5, "#33363b");
}

// --- Mazerety Quattroporte: золотистый лимузин ---
function drawQuattroporte(g) {
  carBase(g);
  roundRect(g, -52, -94, 104, 30, 9, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-44, -89, 40, 20);
  roundRect(g, -86, -66, 172, 60, 11, "#cbb598");
  g.fillStyle = "rgba(255,255,255,0.30)"; g.fillRect(-78, -65, 156, 3);
  // Трапецевидные фонари с красной серединой
  for (const side of [-1, 1]) {
    roundRect(g, side * 58 - 22, -60, 44, 14, 5, "#3d1512");
    roundRect(g, side * 58 - 18, -57, 36, 7, 3, "#d43535");
  }
  mazeretyScript(g, -44, "#5c5347");
  plate(g, -40);
  // Диффузор и четыре трубы парами
  roundRect(g, -82, -24, 164, 13, 5, "#2b2e33");
  for (const x of [-56, -42, 42, 56]) roundRect(g, x - 5, -20, 10, 6, 3, "#7c8288");
}

// --- Mazerety Ghibli: серый ветер пустыни ---
function drawGhibli(g) {
  carBase(g);
  roundRect(g, -50, -94, 100, 30, 10, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(-42, -89, 38, 20);
  roundRect(g, -85, -66, 170, 60, 12, "#3a3d42");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-77, -65, 154, 3);
  // Хромовая накладка через багажник + роспись
  roundRect(g, -40, -58, 80, 5, 2.5, "#8f959c");
  // Округлые фонари
  for (const side of [-1, 1]) {
    roundRect(g, side * 60 - 20, -60, 40, 13, 6, "#2a0d0d");
    roundRect(g, side * 60 - 16, -57, 32, 7, 3.5, "#d43535");
  }
  mazeretyScript(g, -44, "#c9d0d7");
  plate(g, -40);
  roundRect(g, -80, -24, 160, 13, 5, "#17191c");
  for (const x of [-58, -44, 44, 58]) roundRect(g, x - 5, -20, 10, 6, 3, "#63666e");
}

// --- Mazerety 3200 GT: фонари-БУМЕРАНГИ (легенда!) ---
function drawGT3200(g) {
  carBase(g);
  roundRect(g, -52, -96, 104, 34, 16, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-44, -90, 40, 24);
  roundRect(g, -84, -64, 168, 58, 16, "#c3c8ce");
  g.fillStyle = "rgba(255,255,255,0.30)"; g.fillRect(-76, -63, 152, 3);
  // БУМЕРАНГИ: тонкая красная дуга-крюк по каждому краю
  for (const side of [-1, 1]) {
    g.strokeStyle = "#c22020"; g.lineWidth = 3.5;
    g.beginPath();
    g.arc(side * 52, -38, 22, -Math.PI * 0.55, -Math.PI * 0.05, side < 0);
    g.stroke();
    g.strokeStyle = "#7a1216"; g.lineWidth = 1.5;
    g.beginPath();
    g.arc(side * 52, -38, 17, -Math.PI * 0.55, -Math.PI * 0.05, side < 0);
    g.stroke();
  }
  mazeretyScript(g, -56, "#63666e");
  plate(g, -44);
  // Бампер в цвет и две сдвоенные трубы
  roundRect(g, -80, -20, 160, 11, 5, "#a9aeb5");
  for (const x of [-56, -46, 46, 56]) circle(g, x, -14, 4, "#33363b");
}

// --- Mazerety Levante: вездеход с трезубцем ---
function drawLevante(g) {
  carBase(g, -30, 38);
  roundRect(g, -52, -104, 104, 30, 10, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-44, -99, 40, 20);
  roundRect(g, -86, -76, 172, 68, 11, "#5b7292");
  g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(-78, -75, 156, 3);
  // Хромовая полоса с трезубцем + роспись
  roundRect(g, -44, -66, 88, 4, 2, "#aab0b6");
  trident(g, -64, "#e6eaee");
  // Раскосые фонари
  for (const side of [-1, 1]) {
    roundRect(g, side * 60 - 21, -70, 42, 12, 6, "#2a0d0d");
    roundRect(g, side * 60 - 17, -67, 34, 6, 3, "#d43535");
  }
  mazeretyScript(g, -50, "#dbe2ea");
  plate(g, -46);
  // Тёмный низ и четыре трубы парами
  roundRect(g, -84, -26, 168, 15, 6, "#17191c");
  for (const x of [-56, -44, 44, 56]) circle(g, x, -18, 4.5, "#63666e");
}

// --- Tayoda Corolla: самая продаваемая машина планеты ---
function drawCorolla(g) {
  carBase(g);
  roundRect(g, -50, -94, 100, 30, 9, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(-42, -89, 38, 20);
  roundRect(g, -84, -66, 168, 60, 10, "#f2f3f5");
  g.fillStyle = "rgba(255,255,255,0.45)"; g.fillRect(-76, -65, 152, 3);
  // Фонари с тёмной перемычкой между ними (как на фото)
  roundRect(g, -62, -57, 124, 4, 2, "#33363b");
  for (const side of [-1, 1]) {
    roundRect(g, side * 58 - 20, -60, 40, 11, 5, "#3d1512");
    roundRect(g, side * 58 - 16, -57, 32, 5, 2.5, "#d43535");
  }
  tayodaBadge(g, -66);
  plate(g, -42);
  roundRect(g, -80, -22, 160, 12, 5, "#d8dade");
  roundRect(g, -62, -14, 124, 3, 1.5, "#b3202a");   // красный катафот-штрих
}

// --- Tayoda C-HR: кроссовер-оригами, двухцветный ---
function drawCHR(g) {
  carBase(g, -30, 36);
  // ЧЁРНАЯ крыша и корма сверху (двухцветность с фото)
  roundRect(g, -52, -106, 104, 34, 12, "#17191c");
  roundRect(g, -46, -101, 92, 24, 9, "#1a2026");
  roundRect(g, -86, -74, 172, 66, 11, "#c9bfae");
  g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(-78, -73, 156, 3);
  // Чёрная вставка сверху кормы, из неё торчат фонари-стрелы
  roundRect(g, -66, -74, 132, 12, 6, "#17191c");
  for (const side of [-1, 1]) {
    roundRect(g, side * 62 - 16, -72, 32, 8, 4, "#2a0d0d");
    roundRect(g, side * 62 - 13, -70, 26, 4, 2, "#e82121");
  }
  tayodaBadge(g, -66);
  g.fillStyle = "#63666e"; g.font = "bold 5px Verdana"; g.textAlign = "center";
  g.fillText("C-HR", 0, -50);
  plate(g, -44);
  // Серый рубленый низ
  g.fillStyle = "#5c6166";
  g.beginPath();
  g.moveTo(-76, -26); g.lineTo(76, -26); g.lineTo(64, -8); g.lineTo(-64, -8);
  g.closePath(); g.fill();
}

// --- Tayoda C-HR GR Sport: оригами в спортивном костюме ---
function drawCHRGR(g) {
  carBase(g, -30, 36);
  roundRect(g, -52, -106, 104, 34, 12, "#17191c");
  roundRect(g, -46, -101, 92, 24, 9, "#1a2026");
  roundRect(g, -86, -74, 172, 66, 11, "#c6cad0");
  g.fillStyle = "rgba(255,255,255,0.22)"; g.fillRect(-78, -73, 156, 3);
  // Злые фонари-клинья, тянущиеся к центру
  for (const side of [-1, 1]) {
    roundRect(g, side * 50 - 28, -72, 56, 9, 4.5, "#2a0d0d");
    roundRect(g, side * 50 - 25, -70, 50, 4.5, 2, "#e82121");
  }
  tayodaBadge(g, -64);
  // Красно-чёрный значок GR
  roundRect(g, 52, -58, 18, 8, 2, "#17191c");
  g.fillStyle = "#e82121"; g.font = "bold 5.5px Verdana"; g.textAlign = "center";
  g.fillText("GR", 61, -51.5);
  plate(g, -44);
  g.fillStyle = "#33363b";
  g.beginPath();
  g.moveTo(-76, -26); g.lineTo(76, -26); g.lineTo(64, -8); g.lineTo(-64, -8);
  g.closePath(); g.fill();
  roundRect(g, -40, -14, 80, 4, 2, "#7c8288");
}

// --- Tayoda Corona Premio: серебристый дедушка из 90-х ---
function drawCorona(g) {
  carBase(g);
  roundRect(g, -50, -92, 100, 30, 7, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(-42, -87, 38, 20);
  roundRect(g, -83, -64, 166, 58, 8, "#d5d8dc");
  g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(-75, -63, 150, 3);
  // Широкая красная лента фонарей во всю корму (стиль 90-х)
  roundRect(g, -70, -58, 140, 13, 4, "#8c1620");
  roundRect(g, -68, -55, 136, 5, 2, "#d43535");
  g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(-66, -49, 132, 2);
  tayodaBadge(g, -62);
  g.fillStyle = "#63666e"; g.font = "bold 4.5px Verdana"; g.textAlign = "center";
  g.fillText("CORONA PREMIO", -46, -38);
  plate(g, -40);
  roundRect(g, -79, -22, 158, 11, 4, "#bbbfc5");
  roundRect(g, -30, -13, 10, 4, 2, "#7c8288");
}

// --- Tayoda Crown: красно-чёрная «Корона» со световой лентой ---
function drawCrown(g) {
  carBase(g);
  roundRect(g, -52, -96, 104, 32, 11, "#17191c");   // чёрная крыша
  roundRect(g, -46, -92, 92, 22, 8, "#1a2026");
  roundRect(g, -85, -66, 170, 60, 11, "#b3202a");
  g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(-77, -65, 154, 3);
  // Чёрная панель багажника со световой лентой во всю ширину
  roundRect(g, -70, -62, 140, 16, 6, "#17191c");
  roundRect(g, -66, -58, 132, 3.5, 1.5, "#e82121");
  for (const side of [-1, 1])
    roundRect(g, side * 70 - 5, -60, 10, 12, 4, "#e82121");
  tayodaBadge(g, -54);
  g.fillStyle = "#c9d0d7"; g.font = "bold 4.5px Verdana"; g.textAlign = "center";
  g.fillText("C R O W N", 0, -40);
  plate(g, -36);
  // Серебристая юбка бампера
  roundRect(g, -80, -22, 160, 12, 5, "#33363b");
  roundRect(g, -74, -12, 148, 3, 1.5, "#aab0b6");
}

// --- Tayoda Supra (Mk4): ОГРОМНОЕ крыло и круглые фонари. JDM! ---
function drawSupra(g) {
  carBase(g);
  // Крыло-дуга на высоких стойках. Стойки тянутся ДО САМОГО багажника
  // (-60): кабина уже стоек, и короткие ножки висели бы в воздухе —
  // тот же баг, что был у крыла Ф1!
  roundRect(g, -60, -112, 9, 52, 3, "#33363b");
  roundRect(g,  51, -112, 9, 52, 3, "#33363b");
  roundRect(g, -74, -120, 148, 9, 4, "#5c1015");
  g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(-66, -119, 132, 2.5);
  // Округлая кабина
  roundRect(g, -48, -96, 96, 32, 15, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-40, -91, 36, 22);
  roundRect(g, -84, -66, 168, 60, 13, "#c22026");
  g.fillStyle = "rgba(255,255,255,0.16)"; g.fillRect(-76, -65, 152, 3);
  // КРУГЛЫЕ фонари: по два с каждой стороны (легенда 90-х!)
  for (const side of [-1, 1]) {
    circle(g, side * 64, -50, 8.5, "#2a0d0d");
    circle(g, side * 64, -50, 5.5, "#e82121");
    circle(g, side * 42, -50, 8.5, "#2a0d0d");
    circle(g, side * 42, -50, 5.5, "#d43535");
  }
  tayodaBadge(g, -62);
  plate(g, -40, 36);
  // Чёрный низ и толстая труба-«кастрюля» слева
  roundRect(g, -80, -22, 160, 13, 5, "#17191c");
  circle(g, -54, -15, 7, "#26292d"); circle(g, -54, -15, 4.5, "#63666e");
}

// --- Tayoda GR Supra: внучка легенды ---
function drawGSupra(g) {
  carBase(g);
  roundRect(g, -48, -94, 96, 32, 16, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-40, -89, 36, 22);
  roundRect(g, -50, -64, 100, 4, 2, "#98161b");   // утиный хвост
  roundRect(g, -85, -62, 170, 56, 14, "#d8242b");
  g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(-77, -61, 154, 3);
  // Фонари-запятые, загнутые к центру
  for (const side of [-1, 1]) {
    g.strokeStyle = "#2a0808"; g.lineWidth = 7;
    g.beginPath();
    g.moveTo(side * 72, -34); g.quadraticCurveTo(side * 74, -54, side * 44, -54);
    g.stroke();
    g.strokeStyle = "#e82121"; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(side * 71, -35); g.quadraticCurveTo(side * 72, -52, side * 45, -52);
    g.stroke();
  }
  tayodaBadge(g, -56);
  g.fillStyle = "#f0b6b8"; g.font = "italic bold 5px Georgia"; g.textAlign = "center";
  g.fillText("Supra", 0, -44);
  plate(g, -38, 36);
  // Чёрная сетка по центру и две трубы по краям
  roundRect(g, -80, -22, 160, 13, 5, "#17191c");
  roundRect(g, -14, -24, 28, 14, 4, "#26292d");
  circle(g, -62, -15, 5.5, "#26292d"); circle(g, -62, -15, 3.5, "#63666e");
  circle(g,  62, -15, 5.5, "#26292d"); circle(g,  62, -15, 3.5, "#63666e");
}

// --- Tayoda Yaris: юркий городской воробей ---
function drawYaris(g) {
  carBase(g, -26, 32);
  // Высокий хэтчбек: большое стекло почти во всю корму
  roundRect(g, -46, -100, 92, 40, 11, "#e8e9eb");
  roundRect(g, -40, -96, 80, 32, 8, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-32, -91, 30, 22);
  roundRect(g, -70, -62, 140, 56, 10, "#f0f1f3");
  g.fillStyle = "rgba(255,255,255,0.40)"; g.fillRect(-62, -61, 124, 3);
  // Крупные фонари по краям
  for (const side of [-1, 1]) {
    roundRect(g, side * 52 - 12, -58, 24, 20, 6, "#3d1512");
    roundRect(g, side * 52 - 8, -54, 16, 12, 4, "#d43535");
  }
  tayodaBadge(g, -50);
  plate(g, -40, 36);
  roundRect(g, -66, -20, 132, 11, 5, "#d6d8dc");
  roundRect(g, -22, -12, 8, 3.5, 1.5, "#7c8288");
}

// --- Tayoda Prius Prime: бирюзовый гибрид (по фото Саши) ---
function drawPrius(g) {
  carBase(g);
  // Покатое стекло с ПЛАНКОЙ-СПОЙЛЕРОМ поперёк (двойное стекло!)
  roundRect(g, -50, -100, 100, 38, 12, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-42, -95, 38, 28);
  roundRect(g, -54, -80, 108, 6, 3, "#2e9e96");   // планка в цвет кузова
  g.fillStyle = "rgba(0,0,0,0.20)"; g.fillRect(-50, -75, 100, 2);
  roundRect(g, -82, -64, 164, 58, 12, "#2e9e96");
  g.fillStyle = "rgba(255,255,255,0.20)"; g.fillRect(-74, -63, 148, 3);
  // Вертикальные фонари-крючья по углам (как на фото)
  for (const side of [-1, 1]) {
    roundRect(g, side * 66 - 6, -60, 12, 28, 6, "#3d1512");
    roundRect(g, side * 66 - 3.5, -56, 7, 20, 3.5, "#d43535");
  }
  tayodaBadge(g, -56);
  g.fillStyle = "#bfe6e2"; g.font = "bold 4.5px Verdana"; g.textAlign = "center";
  g.fillText("PRIUS", 0, -44);
  plate(g, -38, 36);
  roundRect(g, -78, -20, 156, 11, 5, "#26292d");
}

// ---------- ДЕНЬ ДОБИВКИ МАРОК: ещё 20 машин по фото ----------

// Значок Opal: молния в кольце
function opalBadge(g, y) {
  g.strokeStyle = "#c9d0d7"; g.lineWidth = 2;
  g.beginPath(); g.arc(0, y, 8, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#c9d0d7";
  g.beginPath();
  g.moveTo(-6, y - 1.5); g.lineTo(1, y - 1.5); g.lineTo(6, y + 1.5);
  g.lineTo(-1, y + 1.5);
  g.closePath(); g.fill();
}

// --- Болид IndyCar: американский овальный монстр ---
function drawIndycar(g) {
  g.fillStyle = "rgba(0,0,0,0.4)";
  g.beginPath(); g.ellipse(0, 8, 112, 12, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#1c1e22"; g.lineWidth = 4;
  for (const side of [-1, 1]) {
    g.beginPath(); g.moveTo(side * 56, -24); g.lineTo(side * 82, -34); g.stroke();
    g.beginPath(); g.moveTo(side * 56, -10); g.lineTo(side * 84, -14); g.stroke();
  }
  // Гигантские слики
  roundRect(g, -106, -50, 42, 62, 12, "#0b0b0b");
  roundRect(g,  64, -50, 42, 62, 12, "#0b0b0b");
  g.fillStyle = "#2a2d31";
  g.fillRect(-100, -46, 30, 4); g.fillRect(70, -46, 30, 4);
  // Задний «бампер»-обтекатель поверх колёс — фишка Индикара!
  roundRect(g, -108, -56, 46, 14, 6, "#eceef0");
  roundRect(g,  62, -56, 46, 14, 6, "#eceef0");
  // Днище-диффузор
  roundRect(g, -60, -26, 120, 22, 6, "#141416");
  // Красный кожух мотора с белой стрелой
  g.fillStyle = "#c8202a";
  g.beginPath();
  g.moveTo(-26, -26); g.lineTo(26, -26); g.lineTo(10, -84); g.lineTo(-10, -84);
  g.closePath(); g.fill();
  g.fillStyle = "#eceef0";
  g.beginPath();
  g.moveTo(-5, -26); g.lineTo(5, -26); g.lineTo(2, -70); g.lineTo(-2, -70);
  g.closePath(); g.fill();
  // Аэроскрин-дуга над кокпитом
  g.strokeStyle = "#2a2d31"; g.lineWidth = 5;
  g.beginPath(); g.arc(0, -74, 16, Math.PI, 0); g.stroke();
  // Низкое широкое крыло на двух пилонах
  roundRect(g, -20, -102, 8, 20, 3, "#101214");
  roundRect(g,  12, -102, 8, 20, 3, "#101214");
  roundRect(g, -78, -108, 156, 8, 3, "#c8202a");
  g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(-70, -107, 140, 2);
  roundRect(g, -82, -110, 10, 16, 3, "#eceef0");
  roundRect(g,  72, -110, 10, 16, 3, "#eceef0");
  // Дождевой фонарь
  roundRect(g, -2.5, -44, 5, 14, 2, "#ff2020");
}

// --- Болид Ф-3: белая школа чемпионов ---
function drawF3car(g) {
  g.fillStyle = "rgba(0,0,0,0.4)";
  g.beginPath(); g.ellipse(0, 8, 104, 12, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#1c1e22"; g.lineWidth = 4;
  for (const side of [-1, 1]) {
    g.beginPath(); g.moveTo(side * 52, -22); g.lineTo(side * 78, -32); g.stroke();
    g.beginPath(); g.moveTo(side * 52, -10); g.lineTo(side * 80, -14); g.stroke();
  }
  roundRect(g, -100, -48, 40, 60, 12, "#0b0b0b");
  roundRect(g,  60, -48, 40, 60, 12, "#0b0b0b");
  g.fillStyle = "#2a2d31";
  g.fillRect(-94, -44, 28, 4); g.fillRect(66, -44, 28, 4);
  roundRect(g, -58, -26, 116, 22, 6, "#141416");
  // Белый кожух мотора
  g.fillStyle = "#eceef0";
  g.beginPath();
  g.moveTo(-24, -26); g.lineTo(24, -26); g.lineTo(8, -82); g.lineTo(-8, -82);
  g.closePath(); g.fill();
  g.fillStyle = "rgba(0,0,0,0.10)"; g.fillRect(-8, -50, 16, 24);
  // ЧЁРНОЕ крыло (как на фото) на пилоне с боковыми пластинами
  roundRect(g, -6, -104, 12, 24, 3, "#101214");
  roundRect(g, -74, -102, 148, 9, 3, "#111316");
  roundRect(g, -80, -108, 8, 22, 2, "#111316");
  roundRect(g,  72, -108, 8, 22, 2, "#111316");
  roundRect(g, -2.5, -42, 5, 14, 2, "#ff2020");
}

// --- РАФ-22031: скорая помощь, уступи дорогу! ---
function drawRafMed(g) {
  carBase(g, -26, 32);
  // Высокий белый фургон
  roundRect(g, -72, -122, 144, 116, 9, "#eef0f2");
  g.fillStyle = "rgba(255,255,255,0.45)"; g.fillRect(-64, -121, 128, 3);
  // Заднее стекло
  roundRect(g, -54, -112, 108, 40, 7, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-46, -107, 44, 30);
  // Красная полоса и красный крест в круге
  roundRect(g, -72, -62, 144, 12, 2, "#d1202a");
  circle(g, 0, -40, 11, "#eef0f2");
  g.strokeStyle = "#d1202a"; g.lineWidth = 1.5;
  g.beginPath(); g.arc(0, -40, 11, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#d1202a";
  g.fillRect(-2.5, -48, 5, 16); g.fillRect(-8, -42.5, 16, 5);
  // Оранжевый маячок на крыше
  roundRect(g, -8, -128, 16, 7, 3, "#e8821e");
  g.fillStyle = "rgba(255,190,80,0.5)";
  g.beginPath(); g.ellipse(0, -128, 14, 6, 0, 0, Math.PI * 2); g.fill();
  plate(g, -28, 36);
  roundRect(g, -66, -14, 132, 7, 3, "#aab0b6");
}

// --- РАФ-2909: олимпийский ЭЛЕКТРО-пикап с тентом (1980!) ---
function drawRaf2909(g) {
  carBase(g, -26, 32);
  // Тёмный кузов с белой полосой (как на чёрно-белом фото)
  roundRect(g, -72, -74, 144, 68, 8, "#8a3b2e");
  roundRect(g, -72, -86, 144, 14, 4, "#eef0f2");   // белый пояс
  // ТЕНТ — брезентовый горб над кузовом
  roundRect(g, -64, -122, 128, 40, 10, "#4a453e");
  g.fillStyle = "rgba(255,255,255,0.08)";
  for (let x = -52; x <= 40; x += 18) g.fillRect(x, -120, 2, 36);
  // Фонарики по краям
  for (const side of [-1, 1]) {
    roundRect(g, side * 62 - 5, -68, 10, 16, 3, "#3d1512");
    roundRect(g, side * 62 - 3, -65, 6, 6, 2, "#d43535");
  }
  // Белый квадрат с факелоносцем (олимпийская эмблема)
  roundRect(g, -14, -62, 28, 24, 3, "#eef0f2");
  g.fillStyle = "#33363b";
  circle(g, 0, -56, 2.5, "#33363b");                 // голова бегуна
  g.fillRect(-1.5, -54, 3, 8);                        // тело
  g.fillRect(-6, -52, 12, 2);                         // руки
  g.fillStyle = "#e8821e"; g.fillRect(5, -58, 2, 6);  // факел!
  plate(g, -30, 36);
  roundRect(g, -66, -14, 132, 7, 3, "#aab0b6");
}

// --- ЗИС-110: чёрный правительственный лимузин ---
function drawZis110(g) {
  carBase(g);
  roundRect(g, -48, -94, 96, 30, 12, "#17191c");
  roundRect(g, -42, -90, 84, 22, 8, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-34, -86, 30, 14);
  // Округлый чёрный кузов
  roundRect(g, -82, -66, 164, 60, 16, "#17191c");
  g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(-72, -65, 144, 3);
  // Маленькие круглые фонарики
  for (const side of [-1, 1]) {
    circle(g, side * 62, -50, 6, "#3d0a0a");
    circle(g, side * 62, -50, 3.5, "#c22020");
  }
  // Шильдик ЗИС
  g.fillStyle = "#c9d0d7"; g.font = "bold 6px Verdana"; g.textAlign = "center";
  g.fillText("ЗИС", 0, -52);
  plate(g, -42);
  // Массивный хромовый бампер с клыками
  roundRect(g, -80, -24, 160, 11, 5, "#c2c8ce");
  roundRect(g, -46, -27, 8, 15, 3, "#b4bac0");
  roundRect(g,  38, -27, 8, 15, 3, "#b4bac0");
  roundRect(g, -20, -12, 10, 4, 2, "#7c8288");
}

// --- ЗИС-5 «Трёхтонка»: первый ГРУЗОВИК в гараже! ---
function drawZis5(g) {
  carBase(g, -30, 40);
  // Кабина ПОЗАДИ кузова: виден лишь краешек крыши. Зеркальца —
  // КОРОТКИЕ, на ножках от верхних углов борта (были как антенны
  // через всю крышу — «оу! что с зеркалами»)
  // (после «кабина мала» — кабина подросла, окошко вернулось;
  // зеркала убраны СОВСЕМ: три раза выходили «сломанными», а на
  // фото сзади их всё равно не видно)
  roundRect(g, -45, -100, 90, 26, 7, "#2f4630");
  roundRect(g, -16, -96, 32, 9, 3, "#1a2026");
  // Зелёная стальная рама кузова (пониже — «задний кузов слишком
  // большой», правка Саши)
  roundRect(g, -72, -78, 144, 68, 4, "#3f5a3c");
  // ДЕРЕВЯННЫЙ задний борт: светлые доски со щелями
  g.fillStyle = "#8a6b46";
  g.fillRect(-66, -72, 132, 56);
  g.fillStyle = "#6d5236";
  for (let y = -60; y <= -32; y += 14) g.fillRect(-66, y, 132, 3);
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-66, -72, 132, 2);
  // Стальные петли борта
  g.fillStyle = "#26292d";
  g.fillRect(-46, -74, 5, 60); g.fillRect(41, -74, 5, 60);
  // Чёрные крылья над колёсами — колёса ТОРЧАТ из-под кузова
  roundRect(g, -90, -36, 28, 16, 7, "#17191c");
  roundRect(g,  62, -36, 28, 16, 7, "#17191c");
  // Два фонарика по краям (у настоящего был один слева, но Саша
  // спросил «фара одна?» — ставим пару, так красивее!)
  for (const side of [-1, 1]) {
    roundRect(g, side * 60 - 4.5, -20, 9, 8, 2, "#3d0a0a");
    roundRect(g, side * 60 - 3, -18.5, 6, 5, 1.5, "#c22020");
  }
  plate(g, -16, 32);
  // Рама снизу
  roundRect(g, -60, -4, 120, 4, 2, "#26292d");
}

// --- Paganny Utopia: фонари-турбины и механика ---
function drawUtopia(g) {
  carBase(g);
  roundRect(g, -46, -92, 92, 30, 15, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-38, -87, 34, 20);
  // Кузов с круглыми плечами-крыльями
  roundRect(g, -86, -64, 172, 58, 17, "#cfc9bd");
  g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(-76, -63, 152, 3);
  // Четыре круглых фонаря-ТУРБИНЫ (по два на крыло)
  for (const side of [-1, 1]) {
    for (const dx of [-13, 13]) {
      circle(g, side * 58 + dx, -46, 9, "#2b2620");
      g.strokeStyle = "#e8821e"; g.lineWidth = 2.5;
      g.beginPath(); g.arc(side * 58 + dx, -46, 6, 0, Math.PI * 2); g.stroke();
      circle(g, side * 58 + dx, -46, 2, "#ffb14f");
    }
  }
  // Круглая корзина из ЧЕТЫРЁХ труб по центру
  circle(g, 0, -38, 13, "#33363b");
  for (const [dx, dy] of [[-5, -5], [5, -5], [-5, 5], [5, 5]])
    circle(g, dx, -38 + dy, 4, "#7c8288");
  g.fillStyle = "#5c5347"; g.font = "italic bold 5px Georgia"; g.textAlign = "center";
  g.fillText("Paganny", 0, -58);
  plate(g, -20, 32);
  roundRect(g, -80, -10, 160, 6, 3, "#101214");
}

// --- Paganny Zonda R: гоночный карбон и букет труб ---
function drawZondaR(g) {
  carBase(g);
  // Крыло ВО ВСЮ ширину на боковых пластинах. Пластины тянутся ДО
  // КУЗОВА (-64): кабина уже пластин, короткие висели бы в воздухе —
  // урок Супры и Ф-1!
  roundRect(g, -84, -116, 168, 9, 3, "#111316");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-76, -115, 152, 2);
  roundRect(g, -70, -108, 8, 44, 3, "#15171a");
  roundRect(g,  62, -108, 8, 44, 3, "#15171a");
  roundRect(g, -44, -94, 88, 30, 14, "#1a2026");
  // Тёмный карбоновый кузов
  roundRect(g, -86, -66, 172, 60, 12, "#26282c");
  g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(-78, -65, 156, 3);
  // Круглые фонари по два
  for (const side of [-1, 1]) {
    for (const dx of [-11, 11]) {
      circle(g, side * 58 + dx, -50, 7, "#3d0a0a");
      circle(g, side * 58 + dx, -50, 4, "#e82121");
    }
  }
  // БУКЕТ из четырёх труб ромбом по центру (фишка Зонды!)
  circle(g, 0, -46, 14, "#141618");
  for (const [dx, dy] of [[0, -6], [-6, 0], [6, 0], [0, 6]]) {
    g.strokeStyle = "#c9d0d7"; g.lineWidth = 2;
    g.beginPath(); g.arc(dx, -46 + dy, 3.5, 0, Math.PI * 2); g.stroke();
  }
  g.fillStyle = "#8f959c"; g.font = "italic bold 5px Georgia"; g.textAlign = "center";
  g.fillText("Zonda R", 56, -36);
  // Номер — над диффузором, а не В бампере (правка Саши)
  plate(g, -31, 30);
  // Огромный диффузор с рёбрами
  roundRect(g, -84, -18, 168, 12, 4, "#101214");
  g.fillStyle = "#1e2124";
  for (const x of [-56, -28, 28, 56]) g.fillRect(x - 2, -16, 4, 9);
}

// --- ZSC Ultimate Aero XT: шесть круглых фонарей, 270 миль ---
function drawUAero(g) {
  carBase(g);
  roundRect(g, -46, -94, 92, 32, 14, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-38, -89, 34, 22);
  // Горбик-спойлер на кромке
  roundRect(g, -40, -66, 80, 6, 3, "#d2d5d9");
  roundRect(g, -84, -62, 168, 56, 13, "#eceef0");
  g.fillStyle = "rgba(255,255,255,0.40)"; g.fillRect(-76, -61, 152, 3);
  // По ТРИ круглых фонаря с каждой стороны!
  for (const side of [-1, 1]) {
    for (const dx of [-16, 0, 16]) {
      circle(g, side * 58 + dx * side, -50, 7, "#3d0a0a");
      circle(g, side * 58 + dx * side, -50, 4.5, "#e82121");
    }
  }
  // Решётка-жабры по центру
  g.fillStyle = "#33363b";
  for (let y = -56; y <= -42; y += 5) g.fillRect(-26, y, 52, 3);
  plate(g, -38, 36);
  // Чёрный низ и сдвоенная труба-овал по центру
  roundRect(g, -80, -22, 160, 13, 5, "#17191c");
  roundRect(g, -14, -20, 28, 9, 4.5, "#26292d");
  circle(g, -6, -15.5, 3.5, "#7c8288"); circle(g, 6, -15.5, 3.5, "#7c8288");
}

// --- Tesly Model 3: чёрная народная электричка ---
function drawModel3(g) {
  carBase(g);
  roundRect(g, -52, -94, 104, 32, 12, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(-44, -89, 40, 22);
  roundRect(g, -84, -64, 168, 58, 13, "#17191c");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-76, -63, 152, 3);
  // Фонари-росчерки, загнутые к центру
  for (const side of [-1, 1]) {
    g.strokeStyle = "#2a0808"; g.lineWidth = 7;
    g.beginPath();
    g.moveTo(side * 76, -44); g.quadraticCurveTo(side * 66, -56, side * 34, -52);
    g.stroke();
    g.strokeStyle = "#e82121"; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(side * 74, -45); g.quadraticCurveTo(side * 65, -54, side * 35, -50.5);
    g.stroke();
  }
  // Буквы T E S L Y хромом через багажник (как на фото)
  g.fillStyle = "#c9d0d7"; g.font = "bold 6px Verdana"; g.textAlign = "center";
  g.fillText("T E S L Y", 0, -38);
  plate(g, -32, 36);
  // Гладкий низ без труб
  roundRect(g, -80, -16, 160, 9, 4, "#26292d");
}

// --- Tesly Model X: белый электро-вездеход ---
function drawModelX(g) {
  carBase(g, -28, 34);
  roundRect(g, -54, -102, 108, 34, 12, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-46, -97, 42, 24);
  roundRect(g, -86, -70, 172, 64, 12, "#f0f1f3");
  g.fillStyle = "rgba(255,255,255,0.45)"; g.fillRect(-78, -69, 156, 3);
  // Хромовая полоса через корму + тонкие тёмные фонари
  roundRect(g, -60, -54, 120, 3, 1.5, "#c9d0d7");
  for (const side of [-1, 1]) {
    roundRect(g, side * 62 - 20, -62, 40, 10, 5, "#26292d");
    roundRect(g, side * 62 - 17, -60, 34, 5, 2.5, "#c22020");
  }
  // Эмблема T
  g.fillStyle = "#7c8288";
  g.fillRect(-5, -66, 10, 2);
  g.fillRect(-1.5, -64, 3, 7);
  g.font = "bold 4.5px Verdana"; g.textAlign = "center";
  g.fillText("MODEL X", -56, -42);
  plate(g, -46);
  // Чёрный диффузор
  roundRect(g, -82, -26, 164, 14, 5, "#26292d");
}

// --- TMC Alpha5: новый ЭЛЕКТРО-Делориан с жалюзи ---
function drawAlpha5(g) {
  carBase(g);
  // Чёрное стекло с ЖАЛЮЗИ (наследство DMC-12!)
  roundRect(g, -52, -102, 104, 36, 10, "#141618");
  g.fillStyle = "#26292d";
  for (let y = -98; y <= -72; y += 6) g.fillRect(-46, y, 92, 3.5);
  // Серебристый клин кузова
  roundRect(g, -86, -66, 172, 60, 11, "#c9ccd1");
  g.fillStyle = "rgba(255,255,255,0.28)"; g.fillRect(-78, -65, 156, 3);
  // Красная лента-фонарь во всю ширину с буквами
  roundRect(g, -80, -58, 160, 11, 4, "#2a0808");
  roundRect(g, -77, -55.5, 154, 6, 3, "#e82121");
  g.fillStyle = "#2a0808"; g.font = "bold 5px Verdana"; g.textAlign = "center";
  g.fillText("A L P H A 5", 0, -50.5);
  // Чёрная панель низа с V-образным огоньком
  roundRect(g, -70, -42, 140, 26, 6, "#1a1c20");
  g.strokeStyle = "#e82121"; g.lineWidth = 3;
  g.beginPath();
  g.moveTo(-12, -26); g.lineTo(0, -20); g.lineTo(12, -26);
  g.stroke();
  plate(g, -40, 36);
  // Гладкий диффузор — электро, труб нет!
  roundRect(g, -80, -14, 160, 8, 4, "#26292d");
}

// --- Opal Astra: серебристый хэтчбек с молнией ---
function drawAstra(g) {
  carBase(g, -26, 32);
  roundRect(g, -50, -100, 100, 40, 11, "#c6cad0");
  roundRect(g, -44, -96, 88, 30, 8, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-36, -91, 32, 20);
  roundRect(g, -74, -62, 148, 56, 11, "#c6cad0");
  g.fillStyle = "rgba(255,255,255,0.30)"; g.fillRect(-66, -61, 132, 3);
  // Округлые фонари по краям
  for (const side of [-1, 1]) {
    roundRect(g, side * 56 - 13, -58, 26, 18, 7, "#3d1512");
    roundRect(g, side * 56 - 9, -54, 18, 10, 4, "#d43535");
  }
  opalBadge(g, -48);
  plate(g, -38, 36);
  roundRect(g, -70, -18, 140, 10, 5, "#acb1b8");
  roundRect(g, -30, -11, 10, 4, 2, "#7c8288");
}

// --- Opal Insignia: строгий флагман ---
function drawInsignia(g) {
  carBase(g);
  roundRect(g, -52, -94, 104, 30, 10, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-44, -89, 40, 20);
  roundRect(g, -84, -66, 168, 60, 12, "#6e625a");
  g.fillStyle = "rgba(255,255,255,0.16)"; g.fillRect(-76, -65, 152, 3);
  // Широкие фонари с внутренним вырезом + хромовый штрих
  roundRect(g, -64, -55, 128, 3, 1.5, "#aab0b6");
  for (const side of [-1, 1]) {
    roundRect(g, side * 58 - 24, -60, 48, 11, 5, "#3d1512");
    roundRect(g, side * 58 - 20, -57, 40, 5, 2.5, "#d43535");
  }
  opalBadge(g, -62);
  plate(g, -42);
  roundRect(g, -80, -22, 160, 12, 5, "#584e47");
  roundRect(g, -58, -14, 116, 3, 1.5, "#33363b");
}

// --- Shelbee Daytona: синее купе №12, гроза Ле-Мана ---
function drawDaytona(g) {
  carBase(g);
  // Округлая спина с ОБРУБЛЕННЫМ хвостом (камм-тейл)
  roundRect(g, -56, -100, 112, 38, 18, "#2456a8");
  roundRect(g, -46, -94, 92, 24, 10, "#1a2026");
  roundRect(g, -80, -64, 160, 58, 10, "#2456a8");
  g.fillStyle = "rgba(255,255,255,0.16)"; g.fillRect(-72, -63, 144, 3);
  // ДВЕ белые полосы сверху вниз
  g.fillStyle = "#eceef0";
  g.fillRect(-20, -100, 16, 94);
  g.fillRect(4, -100, 16, 94);
  // Белый круг с номером 12
  circle(g, 0, -44, 15, "#eceef0");
  g.fillStyle = "#17191c"; g.font = "bold 15px Verdana"; g.textAlign = "center";
  g.fillText("12", 0, -38);
  // Крохотные круглые фонарики по два
  for (const side of [-1, 1]) {
    circle(g, side * 62, -52, 4.5, "#3d0a0a");
    circle(g, side * 62, -52, 2.5, "#c22020");
    circle(g, side * 50, -52, 4.5, "#3d0a0a");
    circle(g, side * 50, -52, 2.5, "#c22020");
  }
  g.fillStyle = "#eceef0"; g.font = "bold 5px Verdana";
  g.fillText("USA", -58, -34);
  plate(g, -24, 32);
  roundRect(g, -76, -10, 152, 5, 2, "#17191c");
}

// --- УАЗ Патриот: запаска с надписью PATRIOT ---
function drawPatriot(g) {
  carBase(g, -28, 36);
  roundRect(g, -66, -128, 132, 40, 8, "#6b6f66");
  roundRect(g, -58, -122, 116, 28, 6, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-50, -117, 46, 18);
  roundRect(g, -74, -90, 148, 84, 8, "#6b6f66");
  g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(-66, -89, 132, 3);
  // Вертикальные фонари
  for (const side of [-1, 1]) {
    roundRect(g, side * 64 - 6, -84, 12, 28, 4, "#3d1512");
    roundRect(g, side * 64 - 3.5, -80, 7, 10, 3, "#d43535");
    roundRect(g, side * 64 - 3.5, -68, 7, 8, 3, "#e8b021");
  }
  // ЗАПАСКА на калитке с чехлом PATRIOT
  circle(g, 0, -52, 26, "#26292d");
  circle(g, 0, -52, 21, "#33363b");
  g.fillStyle = "#c9d0d7"; g.font = "bold 6px Verdana"; g.textAlign = "center";
  g.fillText("PATRIOT", 0, -50);
  plate(g, -20, 36);
  roundRect(g, -70, -12, 140, 6, 3, "#54574f");
}

// --- УАЗ Хантер: квадратный, честный, вечный ---
function drawHunter(g) {
  carBase(g, -28, 36);
  roundRect(g, -64, -124, 128, 44, 6, "#3a3d36");
  roundRect(g, -56, -118, 112, 30, 5, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-48, -113, 44, 20);
  roundRect(g, -70, -84, 140, 78, 6, "#3a3d36");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-62, -83, 124, 3);
  // Простые прямоугольные фонарики
  for (const side of [-1, 1]) {
    roundRect(g, side * 58 - 7, -78, 14, 10, 2, "#3d1512");
    roundRect(g, side * 58 - 5, -76, 10, 6, 1.5, "#d43535");
    roundRect(g, side * 58 - 5, -66, 10, 5, 1.5, "#e8b021");
  }
  // Запаска с эмблемой УАЗ (птичка в круге)
  circle(g, 0, -50, 24, "#26292d");
  circle(g, 0, -50, 19, "#17191c");
  g.strokeStyle = "#c9d0d7"; g.lineWidth = 2;
  g.beginPath(); g.arc(0, -50, 12, 0, Math.PI * 2); g.stroke();
  g.beginPath();
  g.moveTo(-8, -52); g.quadraticCurveTo(0, -44, 8, -52);
  g.stroke();
  plate(g, -18, 36);
  roundRect(g, -66, -10, 132, 5, 2, "#2b2d28");
}

// --- Kadillark Eldorado 1960: плавники-ракеты! ---
function drawEldorado(g) {
  carBase(g);
  roundRect(g, -50, -90, 100, 28, 8, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-42, -85, 38, 18);
  // Низкий ДЛИННЮЩИЙ кузов
  roundRect(g, -88, -62, 176, 56, 8, "#1d2a4a");
  g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(-80, -61, 160, 3);
  // ПЛАВНИКИ по краям — острые кили вверх. Цвет ставим ВНУТРИ цикла:
  // фонари ниже перебивают кисть, и второй плавник выходил красным!
  for (const side of [-1, 1]) {
    g.fillStyle = "#1d2a4a";
    g.beginPath();
    g.moveTo(side * 88, -60); g.lineTo(side * 88, -84);
    g.lineTo(side * 64, -62);
    g.closePath(); g.fill();
    // Круглые фонари-ДЮЗЫ на плавниках, по два
    circle(g, side * 76, -54, 5.5, "#3d0a0a");
    circle(g, side * 76, -54, 3.5, "#e82121");
    circle(g, side * 64, -50, 5.5, "#3d0a0a");
    circle(g, side * 64, -50, 3.5, "#e82121");
  }
  // Герб Кадиллака (упрощённый щит)
  g.fillStyle = "#c9a24a";
  g.beginPath();
  g.moveTo(-5, -58); g.lineTo(5, -58); g.lineTo(5, -50); g.lineTo(0, -46);
  g.lineTo(-5, -50);
  g.closePath(); g.fill();
  plate(g, -40);
  // Хромовый бампер во всю ширину
  roundRect(g, -86, -24, 172, 12, 5, "#c2c8ce");
  g.fillStyle = "rgba(0,0,0,0.15)"; g.fillRect(-78, -19, 156, 2);
}

// --- Kadillark CT5-V: чёрный костюм, четыре трубы ---
function drawCT5V(g) {
  carBase(g);
  roundRect(g, -52, -94, 104, 30, 10, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(-44, -89, 40, 20);
  // Карбоновая губка на багажнике
  roundRect(g, -50, -66, 100, 4, 2, "#0b0d0f");
  roundRect(g, -84, -64, 168, 58, 10, "#1a1c20");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-76, -63, 152, 3);
  // Вертикальные фонари-лезвия (фирменный стиль!)
  for (const side of [-1, 1]) {
    roundRect(g, side * 74 - 5, -60, 10, 26, 4, "#2a0d0d");
    roundRect(g, side * 74 - 3, -57, 6, 20, 3, "#e82121");
  }
  g.fillStyle = "#c9a24a";
  g.beginPath();
  g.moveTo(-5, -58); g.lineTo(5, -58); g.lineTo(5, -50); g.lineTo(0, -46);
  g.lineTo(-5, -50);
  g.closePath(); g.fill();
  g.fillStyle = "#8f959c"; g.font = "bold 5px Verdana"; g.textAlign = "center";
  g.fillText("CT5-V", 60, -40);
  plate(g, -40);
  // Диффузор и ЧЕТЫРЕ прямоугольные трубы
  roundRect(g, -80, -22, 160, 13, 5, "#101214");
  for (const x of [-62, -46, 46, 62]) roundRect(g, x - 6, -18, 12, 6, 2, "#4a4f54");
}

// --- Pejo 9X8: гиперкар Ле-Мана БЕЗ крыла ---
function drawP9X8(g) {
  carBase(g);
  // Горб-капсула кокпита
  roundRect(g, -34, -100, 68, 36, 16, "#26292d");
  roundRect(g, -26, -94, 52, 22, 9, "#141618");
  // Широченный низкий кузов
  roundRect(g, -88, -66, 176, 60, 10, "#26292d");
  g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(-80, -65, 160, 3);
  // ТРИ вертикальных КОГТЯ света с каждой стороны
  for (const side of [-1, 1]) {
    for (const dx of [0, 12, 24]) {
      roundRect(g, side * (52 + dx) - 3.5, -60, 7, 24, 3, "#3d0a0a");
      roundRect(g, side * (52 + dx) - 2, -57, 4, 18, 2, "#ff2d2d");
    }
  }
  // Зелёные штрихи /// и львиный гребень
  g.fillStyle = "#9fd626";
  for (const x of [-8, -1, 6]) {
    g.beginPath();
    g.moveTo(x, -42); g.lineTo(x + 4, -42); g.lineTo(x + 1, -32); g.lineTo(x - 3, -32);
    g.closePath(); g.fill();
  }
  g.fillStyle = "#c9d0d7"; g.font = "bold 4.5px Verdana"; g.textAlign = "center";
  g.fillText("9X8", 0, -70);
  plate(g, -26, 32);
  // Гигантский диффузор (крыла-то нет — всё делает днище!)
  roundRect(g, -86, -16, 172, 10, 4, "#101214");
  g.fillStyle = "#1e2124";
  for (const x of [-60, -30, 30, 60]) g.fillRect(x - 2, -14, 4, 7);
}

// --- Sand Hover Evoque: городской модник ---
function drawEvoque(g) {
  carBase(g, -28, 34);
  // Покатая крыша-купол
  roundRect(g, -54, -108, 108, 30, 12, "#eceef0");
  roundRect(g, -48, -103, 96, 20, 8, "#1a2026");
  roundRect(g, -80, -80, 160, 74, 11, "#eceef0");
  g.fillStyle = "rgba(255,255,255,0.40)"; g.fillRect(-72, -79, 144, 3);
  // Узкие КРАСНЫЕ фонари и чёрная панель с буквами
  roundRect(g, -58, -74, 116, 9, 4, "#17191c");
  g.fillStyle = "#c9d0d7"; g.font = "bold 4px Verdana"; g.textAlign = "center";
  g.fillText("S A N D  H O V E R", 0, -67.5);
  for (const side of [-1, 1]) {
    roundRect(g, side * 66 - 12, -74, 24, 9, 4, "#2a0808");
    roundRect(g, side * 66 - 9, -72, 18, 5, 2.5, "#e82121");
  }
  plate(g, -58, 40);
  // Серый низ и защита-лыжа
  roundRect(g, -76, -32, 152, 20, 8, "#b9bec4");
  roundRect(g, -40, -28, 80, 12, 6, "#d2d5d9");
}

// --- Sand Hover Vogue 2003: квадратный аристократ ---
function drawVogue(g) {
  carBase(g, -28, 36);
  // Огромное почти вертикальное стекло
  roundRect(g, -66, -128, 132, 52, 7, "#c6cad0");
  roundRect(g, -58, -122, 116, 40, 5, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-50, -117, 46, 30);
  roundRect(g, -74, -78, 148, 72, 7, "#c6cad0");
  g.fillStyle = "rgba(255,255,255,0.30)"; g.fillRect(-66, -77, 132, 3);
  // Буквы через багажник
  g.fillStyle = "#63666e"; g.font = "bold 4.5px Verdana"; g.textAlign = "center";
  g.fillText("S A N D  H O V E R", 0, -66);
  // Круглые фонарики парами по углам (фишка Вога!)
  for (const side of [-1, 1]) {
    circle(g, side * 64, -68, 6, "#3d0a0a");
    circle(g, side * 64, -68, 3.5, "#e82121");
    circle(g, side * 64, -54, 6, "#3d1205");
    circle(g, side * 64, -54, 3.5, "#e8821e");
  }
  // Хромовая планка и номер
  roundRect(g, -40, -58, 80, 4, 2, "#aab0b6");
  plate(g, -50, 40);
  roundRect(g, -70, -24, 140, 12, 5, "#acb1b8");
  roundRect(g, -60, -14, 120, 3, 1.5, "#33363b");
}

// --- Sand Hover Grand 2022: золотистый король ---
function drawGrand(g) {
  carBase(g, -28, 36);
  roundRect(g, -60, -126, 120, 44, 9, "#c2a281");
  roundRect(g, -52, -120, 104, 32, 7, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-44, -115, 42, 22);
  roundRect(g, -78, -84, 156, 78, 10, "#c2a281");
  g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(-70, -83, 140, 3);
  // ЧЁРНАЯ гладкая панель во всю корму с буквами (стиль 2022)
  roundRect(g, -64, -78, 128, 26, 8, "#141618");
  g.fillStyle = "#c9d0d7"; g.font = "bold 4.5px Verdana"; g.textAlign = "center";
  g.fillText("S A N D  H O V E R", 0, -68);
  plate(g, -66, 40);
  // Тонюсенькие вертикальные огоньки прячутся по краям панели
  roundRect(g, -62, -76, 3, 22, 1.5, "#e82121");
  roundRect(g,  59, -76, 3, 22, 1.5, "#e82121");
  // Хромовый штрих и серый низ
  roundRect(g, -60, -44, 120, 3, 1.5, "#c9ccd1");
  roundRect(g, -74, -30, 148, 18, 7, "#a68864");
  roundRect(g, -44, -24, 88, 10, 5, "#8f959c");
}

// --- Pejo 205 GTI: злой белый малыш из ралли ---
function drawP205(g) {
  carBase(g, -26, 32);
  // Высокая корма хэтчбека с большим стеклом
  roundRect(g, -58, -104, 116, 44, 9, "#f0ede4");
  roundRect(g, -50, -99, 100, 32, 7, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-42, -94, 40, 22);
  roundRect(g, -68, -62, 136, 56, 8, "#f0ede4");
  g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(-60, -61, 120, 3);
  // Серая панель во всю корму с КРАСНОЙ полоской (фишка GTI!)
  roundRect(g, -64, -56, 128, 22, 4, "#5c6166");
  roundRect(g, -64, -35, 128, 3, 1.5, "#d1202a");
  g.fillStyle = "#c9d0d7"; g.font = "bold 4px Verdana"; g.textAlign = "center";
  g.fillText("PEJO", -44, -46);
  g.fillText("205", 34, -46);
  g.fillStyle = "#d1202a"; g.font = "bold 4.5px Verdana";
  g.fillText("GTI", 52, -46);
  // Фонарики по краям панели
  roundRect(g, -62, -52, 14, 12, 2, "#3d1512");
  roundRect(g, -59, -49, 8, 6, 1.5, "#d43535");
  roundRect(g,  48, -52, 14, 12, 2, "#3d1512");
  roundRect(g,  51, -49, 8, 6, 1.5, "#d43535");
  // ЖЁЛТЫЙ европейский номер (как на фото!)
  roundRect(g, -20, -30, 40, 11, 2, "#f0c419");
  g.fillStyle = "#222"; g.font = "bold 7px Verdana"; g.textAlign = "center";
  g.fillText("САША", 0, -21.5);
  roundRect(g, -64, -16, 128, 8, 4, "#d6d2c6");
  roundRect(g, -26, -10, 9, 3.5, 1.5, "#7c8288");
}

// --- Konisegg Jesko: белые плечи, чёрная корма, крыло-бумеранг ---
function drawJesko(g) {
  carBase(g);
  // БЕЛАЯ моторная панель вместо стекла (у Джеско сзади НЕТ окна!)
  // с жабрами-прорезями; крыло стоит прямо НА ней (правка Саши)
  roundRect(g, -40, -98, 80, 34, 15, "#e4e7ea");
  g.fillStyle = "rgba(0,0,0,0.14)";
  for (const y of [-90, -84, -78]) g.fillRect(-26, y, 52, 2.5);
  // Лебединые пилоны — стоят НА панели, шире расставлены и
  // глубоко входят в крыло («спойлер только доведи»)
  g.fillStyle = "#26292d";
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(side * 16, -113); g.lineTo(side * 25, -113);
    g.lineTo(side * 33, -62); g.lineTo(side * 22, -62);
    g.closePath(); g.fill();
  }
  // Крыло-БУМЕРАНГ во всю ширину: к центру ниже и ТОЛЩЕ, к краям
  // выше и тоньше — как настоящий карбоновый профиль
  g.fillStyle = "#15171a";
  g.beginPath();
  g.moveTo(-84, -126); g.lineTo(0, -116); g.lineTo(84, -126);
  g.lineTo(84, -118); g.lineTo(0, -105); g.lineTo(-84, -118);
  g.closePath(); g.fill();
  g.fillStyle = "rgba(255,255,255,0.13)";
  g.beginPath();
  g.moveTo(-76, -124.5); g.lineTo(0, -114.5); g.lineTo(76, -124.5);
  g.lineTo(76, -122.5); g.lineTo(0, -112.5); g.lineTo(-76, -122.5);
  g.closePath(); g.fill();
  // КРУПНЫЕ пластины на концах крыла (на настоящих — номер 25!)
  roundRect(g, -90, -134, 9, 22, 2.5, "#26292d");
  roundRect(g,  81, -134, 9, 22, 2.5, "#26292d");
  g.fillStyle = "#8f959c"; g.font = "bold 5px Verdana"; g.textAlign = "center";
  g.fillText("25", -85.5, -124);
  g.fillText("25", 85.5, -124);
  // Белые плечи-крылья
  roundRect(g, -86, -64, 172, 58, 14, "#e4e7ea");
  g.fillStyle = "rgba(255,255,255,0.40)"; g.fillRect(-78, -63, 156, 3);
  // ЧЁРНАЯ середина кормы с зелёной окантовкой (как на фото)
  roundRect(g, -56, -56, 112, 34, 8, "#17191c");
  roundRect(g, -52, -57.5, 104, 2.5, 1, "#57d977");
  // Тонкие фонари на плечах + вертикальный штрих по краю
  for (const side of [-1, 1]) {
    roundRect(g, side * 71 - 10, -57, 20, 6, 3, "#2a0808");
    roundRect(g, side * 71 - 8, -55.5, 16, 3, 1.5, "#e82121");
    roundRect(g, side * 79 - 2.5, -52, 5, 15, 2.5, "#2a0808");
    roundRect(g, side * 79 - 1.5, -50.5, 3, 12, 1.5, "#e82121");
  }
  // Белая плашка «Konisegg» на чёрной панели
  roundRect(g, -25, -51, 50, 9, 2, "#e4e7ea");
  g.fillStyle = "#17191c"; g.font = "bold 5px Verdana"; g.textAlign = "center";
  g.fillText("Konisegg", 0, -44);
  plate(g, -37, 30);
  // Диффузор с ЗЕЛЁНЫМИ рёбрами
  roundRect(g, -84, -18, 168, 12, 4, "#101214");
  g.fillStyle = "#57d977";
  for (const x of [-64, -36, 36, 64]) g.fillRect(x - 2, -16, 4, 8);
}

// --- Konisegg Regera: овальная труба по центру ---
function drawRegera(g) {
  carBase(g);
  // Плечи-волны и кабина
  roundRect(g, -44, -94, 88, 30, 15, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-36, -89, 34, 20);
  roundRect(g, -86, -64, 172, 58, 16, "#aebfd1");
  g.fillStyle = "rgba(255,255,255,0.30)"; g.fillRect(-78, -63, 156, 3);
  // Чёрная панель посередине кормы с росписью Regera
  roundRect(g, -60, -56, 120, 20, 8, "#17191c");
  g.fillStyle = "#dbe2ea"; g.font = "italic bold 7px Georgia"; g.textAlign = "center";
  g.fillText("Regera", 0, -42);
  g.font = "bold 4px Verdana";
  g.fillText("Konisegg", 0, -51);
  // Фонари-дуги, обнимающие верхние углы
  for (const side of [-1, 1]) {
    g.strokeStyle = "#2a0808"; g.lineWidth = 6;
    g.beginPath();
    g.moveTo(side * 80, -40); g.quadraticCurveTo(side * 76, -58, side * 50, -58);
    g.stroke();
    g.strokeStyle = "#e82121"; g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(side * 79, -41); g.quadraticCurveTo(side * 74, -56, side * 51, -56);
    g.stroke();
  }
  plate(g, -35, 32);
  // ОГРОМНАЯ овальная труба по центру (фишка Регеры!) и диффузор
  roundRect(g, -82, -16, 164, 10, 4, "#101214");
  g.strokeStyle = "#c9d0d7"; g.lineWidth = 3;
  g.beginPath(); g.ellipse(0, -14, 14, 8, 0, 0, Math.PI * 2); g.stroke();
  circle(g, -5, -14, 3.5, "#4a4f54"); circle(g, 5, -14, 3.5, "#4a4f54");
  g.fillStyle = "#1e2124";
  for (const x of [-58, -36, 36, 58]) g.fillRect(x - 2, -14, 4, 7);
}

// --- ВАЗ Нива: вездеход-легенда (вторая попытка — точнее по фото) ---
function drawNiva(g) {
  carBase(g, -28, 34);
  // Вся корма — одна высокая плита-калитка
  roundRect(g, -66, -120, 132, 114, 8, "#7a6a58");
  g.fillStyle = "rgba(255,255,255,0.16)"; g.fillRect(-58, -119, 116, 3);
  // Стекло ПОЧТИ ВО ВСЮ ширину калитки (как на фото!)
  roundRect(g, -58, -112, 116, 40, 6, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-50, -107, 48, 28);
  // Узкие вертикальные фонари у САМЫХ краёв
  for (const side of [-1, 1]) {
    roundRect(g, side * 60 - 6, -66, 12, 36, 3, "#3d1512");
    roundRect(g, side * 60 - 4, -63, 8, 12, 2, "#d43535");
    roundRect(g, side * 60 - 4, -50, 8, 8, 2, "#e8e9eb");
    roundRect(g, side * 60 - 4, -41, 8, 9, 2, "#e8b021");
  }
  // Номер по центру калитки, шильдик слева снизу
  plate(g, -62, 40);
  g.fillStyle = "#c9d0d7"; g.font = "bold 4.5px Verdana"; g.textAlign = "center";
  g.fillText("НИВА", -42, -34);
  roundRect(g, -14, -70, 28, 3.5, 1.5, "#5f5244");   // ручка калитки
  // Чёрный пластиковый бампер во всю ширину
  roundRect(g, -70, -22, 140, 12, 4, "#26292d");
}

// --- ГАЗ-13 Чайка: хромовые лесенки на плавниках (вторая попытка) ---
function drawChaika(g) {
  carBase(g);
  // Округлая крыша и широкое стекло в хромовой окантовке
  roundRect(g, -56, -98, 112, 36, 13, "#17191c");
  roundRect(g, -50, -94, 100, 26, 9, "#c9d0d7");
  roundRect(g, -48, -92, 96, 22, 8, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-40, -88, 36, 14);
  // Высокий чёрный кузов
  roundRect(g, -86, -66, 172, 60, 12, "#17191c");
  g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(-78, -65, 156, 3);
  // Плавники повыше и ХРОМОВЫЕ ЛЕСЕНКИ-фонари на них (фишка фото!)
  for (const side of [-1, 1]) {
    g.fillStyle = "#17191c";
    g.beginPath();
    g.moveTo(side * 86, -60); g.lineTo(side * 86, -88);
    g.lineTo(side * 60, -64);
    g.closePath(); g.fill();
    // Высокий хромовый корпус фонаря
    roundRect(g, side * 76 - 7, -86, 14, 44, 3, "#aab0b6");
    // Красные сегменты с хромовыми рёбрами между ними
    g.fillStyle = "#c22020";
    for (const y of [-83, -73, -63, -53]) g.fillRect(side * 76 - 5, y, 10, 8);
  }
  // Широченное хромовое V через ВЕСЬ багажник с медальоном
  g.strokeStyle = "#c9d0d7"; g.lineWidth = 3;
  g.beginPath();
  g.moveTo(-64, -54); g.lineTo(0, -46); g.lineTo(64, -54);
  g.stroke();
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(-64, -57); g.lineTo(0, -49); g.lineTo(64, -57);
  g.stroke();
  circle(g, 0, -52, 6, "#c9d0d7"); circle(g, 0, -52, 4, "#c22020");
  // ЧАЙКА — хромовыми буквами вразрядку
  g.fillStyle = "#c9d0d7"; g.font = "bold 5px Verdana"; g.textAlign = "center";
  g.fillText("Ч А Й К А", 40, -32);
  // Массивный хромовый бампер, крупные пули-поворотники, номер
  roundRect(g, -84, -28, 168, 14, 6, "#c2c8ce");
  g.fillStyle = "rgba(0,0,0,0.15)"; g.fillRect(-76, -22, 152, 2);
  circle(g, -62, -32, 6.5, "#8f5c10"); circle(g, -62, -32, 4.5, "#e8b021");
  circle(g,  62, -32, 6.5, "#8f5c10"); circle(g,  62, -32, 4.5, "#e8b021");
  plate(g, -26, 32);
  // Две хромовые трубы сквозь бампер
  roundRect(g, -56, -12, 14, 5, 2.5, "#aab0b6");
  roundRect(g,  42, -12, 14, 5, 2.5, "#aab0b6");
}

// --- ГАЗ-13 Чайка Канада: кастом-универсал с запаской (фото Саши!) ---
function drawChaikaCan(g) {
  carBase(g);
  // Высокий кузов-универсал с большим стеклом
  roundRect(g, -70, -122, 140, 60, 10, "#17191c");
  roundRect(g, -60, -116, 120, 26, 7, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(-52, -112, 46, 16);
  // Красный огонёк на крыше (как на фото)
  roundRect(g, -4, -129, 8, 8, 3, "#c22020");
  // Нижний кузов
  roundRect(g, -86, -66, 172, 60, 10, "#17191c");
  g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(-78, -65, 156, 3);
  // Плавники с хромовыми лесенками (чёрная подложка — чтобы между
  // плавником и кузовом-универсалом не светился фон)
  for (const side of [-1, 1]) {
    roundRect(g, side * 86 - (side > 0 ? 24 : 0), -88, 24, 30, 4, "#17191c");
    g.fillStyle = "#17191c";
    g.beginPath();
    g.moveTo(side * 86, -60); g.lineTo(side * 86, -92);
    g.lineTo(side * 60, -64);
    g.closePath(); g.fill();
    roundRect(g, side * 78 - 6, -90, 12, 44, 3, "#aab0b6");
    g.fillStyle = "#c22020";
    for (const y of [-87, -77, -67, -57]) g.fillRect(side * 78 - 4, y, 8, 8);
  }
  // ОГРОМНАЯ запаска в хромовом кольце по центру калитки
  circle(g, 0, -60, 30, "#c9d0d7");
  circle(g, 0, -60, 26, "#17191c");
  circle(g, 0, -60, 20, "#26292d");
  // Хромовая планка-эмблема поперёк запаски с красной серединкой
  roundRect(g, -19, -62.5, 38, 5, 2.5, "#c9d0d7");
  circle(g, 0, -60, 2.8, "#c22020");
  // Массивный хромовый бампер с ОВАЛЬНЫМИ трубами на концах
  roundRect(g, -88, -28, 176, 15, 7, "#c2c8ce");
  g.fillStyle = "rgba(0,0,0,0.15)"; g.fillRect(-80, -21, 160, 2);
  for (const side of [-1, 1]) {
    g.fillStyle = "#8f959c";
    g.beginPath(); g.ellipse(side * 74, -20, 8, 4.5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#26292d";
    g.beginPath(); g.ellipse(side * 74, -20, 5, 2.5, 0, 0, Math.PI * 2); g.fill();
  }
  plate(g, -26, 36);
}

// ---------- Porshe ×4: выбор Саши по фото ----------

// --- Porshe 911 Turbo 1975: «хвост кита», мятное серебро ---
function drawP930(g) {
  carBase(g);
  roundRect(g, -48, -96, 96, 32, 14, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-40, -91, 36, 22);
  // ХВОСТ КИТА: широкая полка с чёрной резиновой окантовкой
  roundRect(g, -68, -74, 136, 11, 5, "#15171a");
  roundRect(g, -62, -71.5, 124, 6, 3, "#c7d2c6");
  roundRect(g, -84, -64, 168, 58, 16, "#c7d2c6");
  g.fillStyle = "rgba(255,255,255,0.30)"; g.fillRect(-76, -63, 152, 3);
  // Красная лента во всю корму с тёмными буквами (как на фото)
  roundRect(g, -72, -54, 144, 13, 5, "#5c1015");
  roundRect(g, -70, -51, 140, 8, 3, "#c22020");
  g.fillStyle = "#3d0a0a"; g.font = "bold 5px Verdana"; g.textAlign = "center";
  g.fillText("P O R S H E", 0, -45);
  // Янтарные уголки на концах ленты
  roundRect(g, -70, -53, 14, 10, 3, "#e8b021");
  roundRect(g,  56, -53, 14, 10, 3, "#e8b021");
  plate(g, -36, 34);
  // Чёрные клыки-бамперетки и одна труба слева (как на фото!)
  roundRect(g, -78, -24, 156, 10, 4, "#aab4a9");
  roundRect(g, -50, -26, 12, 14, 3, "#17191c");
  roundRect(g,  38, -26, 12, 14, 3, "#17191c");
  circle(g, -58, -11, 4.5, "#17191c"); circle(g, -58, -11, 2.5, "#3d4247");
}

// --- Porshe 911 Turbo S: двухэтажный выдвижной спойлер ---
function drawTurboS(g) {
  carBase(g);
  roundRect(g, -50, -94, 100, 32, 14, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-42, -89, 38, 22);
  // ДВА этажа выдвижного спойлера
  roundRect(g, -56, -72, 112, 5, 2.5, "#aeb3ba");
  roundRect(g, -50, -66, 100, 4, 2, "#8f959c");
  roundRect(g, -85, -62, 170, 56, 15, "#c9cdd2");
  g.fillStyle = "rgba(255,255,255,0.30)"; g.fillRect(-77, -61, 154, 3);
  // Тонкие фонари-дуги + полоска между ними
  roundRect(g, -60, -52, 120, 2.5, 1, "#5c1015");
  for (const side of [-1, 1]) {
    g.strokeStyle = "#2a0808"; g.lineWidth = 6;
    g.beginPath();
    g.moveTo(side * 76, -42); g.quadraticCurveTo(side * 72, -54, side * 48, -53);
    g.stroke();
    g.strokeStyle = "#e82121"; g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(side * 75, -43); g.quadraticCurveTo(side * 70, -52, side * 49, -51);
    g.stroke();
  }
  g.fillStyle = "#63666e"; g.font = "bold 4.5px Verdana"; g.textAlign = "center";
  g.fillText("P O R S H E", 0, -44);
  plate(g, -38, 34);
  // Чёрный низ и два ШИРОКИХ прямоугольных сопла
  roundRect(g, -80, -24, 160, 14, 5, "#17191c");
  roundRect(g, -56, -19, 26, 7, 3, "#63666e");
  roundRect(g,  30, -19, 26, 7, 3, "#63666e");
}

// --- Porshe 911 GT3 RS: крыло-гигант на лебединых шеях СВЕРХУ ---
function drawGT3RS(g) {
  carBase(g);
  // Лезвие крыла ШИРЕ кузова
  roundRect(g, -88, -120, 176, 10, 3, "#141618");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-80, -119, 160, 2.5);
  // ЛЕБЕДИНЫЕ шеи: крепятся к ВЕРХУ лезвия и спускаются на кузов
  g.fillStyle = "#26292d";
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(side * 24, -123); g.lineTo(side * 31, -123);
    g.lineTo(side * 41, -58); g.lineTo(side * 30, -58);
    g.closePath(); g.fill();
  }
  roundRect(g, -94, -127, 9, 20, 2.5, "#26292d");
  roundRect(g,  85, -127, 9, 20, 2.5, "#26292d");
  roundRect(g, -46, -94, 92, 30, 13, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-38, -89, 34, 20);
  // Серебристый кузов
  roundRect(g, -85, -62, 170, 56, 13, "#bfc4ca");
  g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(-77, -61, 154, 3);
  // Полоса света + вертикальные воздухозаборники по углам
  roundRect(g, -70, -54, 140, 5, 2.5, "#2a0808");
  roundRect(g, -68, -53, 136, 3, 1.5, "#e82121");
  for (const side of [-1, 1]) {
    roundRect(g, side * 78 - 4, -48, 8, 20, 3, "#17191c");
    roundRect(g, side * 78 - 2, -45, 4, 14, 2, "#c22020");
  }
  g.fillStyle = "#33363b"; g.font = "bold 5px Verdana"; g.textAlign = "center";
  g.fillText("GT3 RS", 0, -42);
  plate(g, -36, 32);
  // Огромный диффузор, ДВЕ круглые трубы по центру (как на фото)
  roundRect(g, -82, -22, 164, 14, 5, "#101214");
  g.fillStyle = "#1e2124";
  for (const x of [-58, -32, 32, 58]) g.fillRect(x - 2, -20, 4, 10);
  circle(g, -8, -15, 4.5, "#26292d"); circle(g, -8, -15, 3, "#63666e");
  circle(g,  8, -15, 4.5, "#26292d"); circle(g,  8, -15, 3, "#63666e");
}

// --- Porshe 918 Spyder: трубы ВВЕРХ за кабиной! ---
function drawP918(g) {
  carBase(g);
  // Ножки труб (стекло прикроет их снизу)
  roundRect(g, -21, -102, 10, 14, 3, "#63666e");
  roundRect(g,  11, -102, 10, 14, 3, "#63666e");
  // Сопла, смотрящие в небо
  circle(g, -16, -104, 6.5, "#8f959c"); circle(g, -16, -104, 4, "#26292d");
  circle(g,  16, -104, 6.5, "#8f959c"); circle(g,  16, -104, 4, "#26292d");
  roundRect(g, -46, -92, 92, 30, 14, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-38, -87, 34, 20);
  // Белый кузов
  roundRect(g, -85, -62, 170, 56, 15, "#eceef0");
  g.fillStyle = "rgba(255,255,255,0.45)"; g.fillRect(-77, -61, 154, 3);
  // Красная полоска на кромке крыла-хвоста (как на фото)
  roundRect(g, -46, -64, 92, 3, 1.5, "#c22020");
  // Фонари-крючки, обнимающие углы
  for (const side of [-1, 1]) {
    g.strokeStyle = "#2a0808"; g.lineWidth = 7;
    g.beginPath();
    g.moveTo(side * 76, -36); g.quadraticCurveTo(side * 74, -54, side * 48, -54);
    g.stroke();
    g.strokeStyle = "#ff2d2d"; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(side * 75, -37); g.quadraticCurveTo(side * 72, -52, side * 49, -52);
    g.stroke();
  }
  // Сетка радиатора между трубами и надпись
  g.fillStyle = "#33363b";
  for (let y = -58; y <= -46; y += 4) g.fillRect(-12, y, 24, 2);
  g.fillStyle = "#63666e"; g.font = "italic bold 4.5px Georgia"; g.textAlign = "center";
  g.fillText("918 Spyder", 0, -40);
  plate(g, -36, 32);
  // Чёрный диффузор (труб внизу НЕТ — они наверху!)
  roundRect(g, -80, -20, 160, 12, 5, "#101214");
  g.fillStyle = "#1e2124";
  for (const x of [-56, -28, 0, 28, 56]) g.fillRect(x - 2, -18, 4, 9);
}

// Трезубец Mazerety — фирменный значок из трёх зубцов
function trident(g, y, color) {
  g.fillStyle = color;
  g.fillRect(-1.5, y, 3, 10);          // средний зубец — длинный
  g.fillRect(-6.5, y + 3, 3, 6);       // боковые — короче
  g.fillRect(3.5, y + 3, 3, 6);
}

// --- Mazerety MC12 Corsa: оранжевый трековый гиперкар из книжки ---
function drawMC12(g) {
  carBase(g);
  // Крыло ВЫШЕ КРЫШИ на двух мощных пилонах
  roundRect(g, -44, -116, 10, 36, 3, "#15171a");
  roundRect(g,  34, -116, 10, 36, 3, "#15171a");
  roundRect(g, -80, -126, 160, 11, 4, "#101214");
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-72, -125, 144, 3);
  // Кабина-капля со стеклом
  roundRect(g, -42, -100, 84, 32, 14, "#f28a1e");
  roundRect(g, -34, -96, 68, 22, 9, "#1a2026");
  // Широченный оранжевый кузов
  roundRect(g, -88, -70, 176, 60, 10, "#f28a1e");
  g.fillStyle = "rgba(255,255,255,0.22)"; g.fillRect(-80, -69, 160, 3);
  // Чёрная гоночная полоса по центру (как на фото)
  g.fillStyle = "#15171a"; g.fillRect(-10, -70, 20, 26);
  // Круглые фонари — по два с каждой стороны
  for (const side of [-1, 1]) {
    circle(g, side * 68, -56, 7, "#3d0a0a");
    circle(g, side * 68, -56, 4.5, "#e82121");
    circle(g, side * 48, -56, 5.5, "#3d0a0a");
    circle(g, side * 48, -56, 3.5, "#e82121");
  }
  trident(g, -67, "#d9dee2");
  // Имя — белым прямо на крыле, как гоночный баннер
  g.fillStyle = "#fff";
  g.font = "bold 5px Verdana"; g.textAlign = "center";
  g.fillText("MC12 CORSA", 0, -118.5);
  // Тёмная панель с ЧЕТЫРЬМЯ круглыми трубами по центру (как на фото)
  roundRect(g, -32, -46, 64, 16, 6, "#15171a");
  for (const x of [-21, -7, 7, 21]) {
    circle(g, x, -38, 5, "#26292d");
    circle(g, x, -38, 3, "#4a4f54");
  }
  plate(g, -28, 36);
  // Диффузор
  roundRect(g, -84, -14, 168, 8, 4, "#101214");
}

// --- Mazerety MC20: алый суперкар с чёрным низом (по фото Саши) ---
function drawMC20(g) {
  carBase(g);
  // Покатое стекло
  roundRect(g, -50, -94, 100, 30, 12, "#1a2026");
  g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(-42, -89, 38, 20);
  // Крыло на боковых стойках — поверх стекла, как на фото
  roundRect(g, -62, -84, 8, 20, 3, "#15171a");
  roundRect(g,  54, -84, 8, 20, 3, "#15171a");
  roundRect(g, -70, -90, 140, 7, 3, "#101214");
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-64, -89, 128, 2);
  // Алый кузов
  roundRect(g, -86, -66, 172, 56, 11, "#c8232b");
  g.fillStyle = "rgba(255,255,255,0.16)"; g.fillRect(-78, -65, 156, 3);
  // Широкие тёмные фонари с красной нитью
  for (const side of [-1, 1]) {
    roundRect(g, side * 58 - 26, -60, 52, 8, 4, "#2a0808");
    roundRect(g, side * 58 - 23, -58, 46, 4, 2, "#e82121");
  }
  // Роспись-автограф через корму (как на фото)
  g.fillStyle = "#2f3237";
  g.font = "italic bold 8px Georgia"; g.textAlign = "center";
  g.fillText("Mazerety", 0, -42);
  // Чёрный глянцевый низ: номер и две КРУГЛЫЕ трубы
  roundRect(g, -86, -36, 172, 28, 8, "#101214");
  plate(g, -32);
  circle(g, -30, -13, 6, "#26292d"); circle(g, -30, -13, 4, "#4a4f54");
  circle(g,  30, -13, 6, "#26292d"); circle(g,  30, -13, 4, "#4a4f54");
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
  astro: drawAstro, cobra: drawCobra, defendor: drawDefendor,
  pejo206: drawPejo206, raf977: drawRaf977, uaz469: drawUaz469,
  zis101: drawZis101, f2: drawF2, agera: drawAgera,
  zonta: drawZonta, aero: drawAero,
  m3e30: drawM3e30, m5: drawM5, timemachine: drawTimeMachine,
  police: drawPolice, cybercraft: drawCybercraft, models: drawModelS,
  db5: drawDB5, dbs: drawDBS, mc12: drawMC12, mc20: drawMC20,
  m2: drawM2, m4: drawM4, b750: drawB750, i7: drawI7,
  vantage: drawVantage, dbx: drawDBX, rapide: drawRapide,
  quattroporte: drawQuattroporte, ghibli: drawGhibli,
  gt3200: drawGT3200, levante: drawLevante,
  corolla: drawCorolla, chr: drawCHR, chrgr: drawCHRGR,
  corona: drawCorona, crown: drawCrown, supra: drawSupra,
  gsupra: drawGSupra, yaris: drawYaris, prius: drawPrius,
  indycar: drawIndycar, f3: drawF3car, rafmed: drawRafMed,
  raf2909: drawRaf2909, zis110: drawZis110, zis5: drawZis5,
  utopia: drawUtopia, zondar: drawZondaR, uaero: drawUAero,
  model3: drawModel3, modelx: drawModelX, alpha5: drawAlpha5,
  astra: drawAstra, insignia: drawInsignia, daytona: drawDaytona,
  patriot: drawPatriot, hunter: drawHunter, eldorado: drawEldorado,
  ct5v: drawCT5V, p9x8: drawP9X8,
  evoque: drawEvoque, vogue: drawVogue, grand: drawGrand, p205: drawP205,
  jesko: drawJesko, regera: drawRegera, niva: drawNiva, chaika: drawChaika,
  chaikacan: drawChaikaCan,
  p930: drawP930, turbos: drawTurboS, gt3rs: drawGT3RS, p918: drawP918,
};

// Огненный след: два пылающих следа за колёсами, три слоя пламени
// (тёмно-оранжевый → оранжевый → жёлтая сердцевина) + искры
function renderFireTrail() {
  const t = performance.now();
  // Огонь горит: у Делориана — после 88 миль/ч, у ЗИСа — все 5 секунд
  // стартового ускорителя (идея Саши: танк стартует В ОГНЕ!)
  // 🔥 ТУРБО добавляет своё пламя — СИНЕЕ, как у настоящего нитро!
  const nitro = nitroActive();
  const until = Math.max(fireTrailUntil, zisBoostActive() ? shieldUntil : 0,
                         nitro ? nitroUntil : 0);
  if (t > until) return;
  const fade = Math.min(1, (until - t) / 800); // плавно гаснет
  const layers = nitro ? [
    [22, "rgba(40, 120, 255, 0.55)"],
    [12, "rgba(90, 180, 255, 0.75)"],
    [5,  "rgba(215, 240, 255, 0.9)"],
  ] : [
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
    // искры над следом (у нитро — голубые!)
    for (let i = 0; i < 6; i++) {
      const p = Math.random();
      ctx.fillStyle = nitro ? (Math.random() < 0.5 ? "#9fd4ff" : "#4f9dff")
                            : (Math.random() < 0.5 ? "#ffd23f" : "#ff8c1a");
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

  // 🔥 Заряды турбо — над «км/ч» (только если турбо куплено)
  if (getTun(car.id).turbo && car.gearbox !== "Э") {
    ctx.font = "bold 12px Verdana";
    if (nitroActive()) {
      ctx.fillStyle = "#57b0ff";
      ctx.fillText("ТУРБО!", 124, 32);
    } else {
      ctx.fillStyle = nitroCharges > 0 ? "#ffd23f" : "#63666e";
      ctx.fillText(nitroCharges > 0 ? "🔥".repeat(nitroCharges) : "🔥 —", 124, 32);
    }
  }

  // ---------- 🚓 Табло погони ----------
  if (chaseMode && opponents[0] && !chaseOver) {
    ctx.fillStyle = "rgba(10, 10, 20, 0.6)";
    ctx.beginPath();
    ctx.roundRect(W / 2 - 175, 14, 350, 36, 10);
    ctx.fill();
    ctx.font = "bold 16px Verdana";
    ctx.textAlign = "center";
    if (chaseRole === "cop") {
      const gapM = Math.max(0, Math.round(
        (opponents[0].z - ((playerLap - 1) * trackLength + position)) / 10));
      ctx.fillStyle = gapM < 60 ? "#57d977" : gapM > 1200 ? "#ff5050" : "#ffffff";
      ctx.fillText(`🚓 До преступника: ${gapM} м`, W / 2, 38);
    } else {
      const gapM = Math.max(0, Math.round(
        ((playerLap - 1) * trackLength + position - opponents[0].z) / 10));
      const left = Math.max(0, Math.ceil(45 - (performance.now() - chaseStart) / 1000));
      ctx.fillStyle = gapM < 60 ? "#ff5050" : "#ffffff";
      ctx.fillText(`🚔 Полиция: ${gapM} м · Держись ещё ${left} с`, W / 2, 38);
    }
  }

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
    : raceKind === "highway" ? "Шоссе"
    : raceKind === "chase" ? "Погоня" : TRACK_NAMES[currentTrack]),
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
