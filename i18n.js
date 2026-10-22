/* =====================================================================
   ЯЗЫК ИГРЫ: English / Русский (заказ Саши)

   Как это работает: игра написана по-русски, а этот файл — переводчик.
   Он не трогает логику игры, а подменяет ТЕКСТ там, где его видно:
     1) надписи на страницах (меню, гараж, настройки…) — даже те, что
        игра меняет на ходу (за ними следит MutationObserver);
     2) надписи, которые игра рисует на холсте (fillText).
   Перевод ищется так: точное совпадение → шаблон с {0} {1} → замена
   известных кусочков внутри длинной строки.
   ===================================================================== */

const EN = {
  // ---------- Главное меню ----------
  "АДМИН": "ADMIN",
  "🏁 ЗАЕЗДЫ": "🏁 RACES",
  "🏙 ГОРОД": "🏙 CITY",
  "🌐 МУЛЬТИПЛЕЕР": "🌐 MULTIPLAYER",
  "🔧 Гараж": "🔧 Garage",
  "🏅 Достижения": "🏅 Achievements",
  "📖 ОБУЧЕНИЕ": "📖 HOW TO PLAY",
  "⚙️ Настройки": "⚙️ Settings",

  // ---------- Обучение ----------
  "🎮 Управление": "🎮 Controls",
  "— газ ·": "— gas ·",
  "— тормоз ·": "— brake ·",
  "— руль (на телефоне — кнопки на экране).": "— steering (on a phone — buttons on the screen).",
  "зажигание": "ignition",
  ": пока не завёл мотор, машина не поедет!": ": until you start the engine, the car won't move!",
  "— снова заезд,": "— restart,",
  "— пауза,": "— pause,",
  "— сменить трассу,": "— change track,",
  "— звук,": "— sound,",
  "— громкость. Все клавиши можно переназначить в Настройках.": "— volume. Every key can be changed in Settings.",
  "⚙️ Коробки передач": "⚙️ Gearboxes",
  "— автомат.": "— automatic.",
  "— только механика: передачи": "— manual only: gears",
  "(ниже) и": "(down) and",
  "(выше); попал в диапазон передачи — тяга есть, выше — отсечка!": "(up); stay in the gear's range for power, above it the rev limiter cuts in!",
  "— смешанная: клавиша": "— mixed: the key",
  "переключает автомат/ручную.": "switches automatic/manual.",
  "— электро: коробки нет, селектор D, вместо рёва — свист.": "— electric: no gearbox, selector D, a whistle instead of a roar.",
  "У некоторых машин есть режимы поездки (": "Some cars have drive modes (",
  "): ЭКО бережёт мотор, СПОРТ выжимает всё.": "): ECO saves the engine, SPORT gives everything.",
  "🏁 Заезды": "🏁 Races",
  "ГОНКА": "RACE",
  "— 3 круга с тремя соперниками. Скорость врагов честная: чаще всего они чуть медленнее тебя, но 5% — быстрее! Призы за места: 500/300/150/50 🪙.": "— 3 laps against three rivals. Rival speed is fair: usually a little slower than you, but 5% are faster! Prizes by place: 500/300/150/50 🪙.",
  "ДРАГ": "DRAG",
  "— дуэль 1 на 1 по прямой с бочками: уворачивайся!": "— a 1-on-1 duel on a straight with barrels: dodge them!",
  "ПРОТИВ РЕКОРДА": "TIME ATTACK",
  "— гонка с призраком твоего лучшего круга (+150 🪙 за рекорд).": "— race the ghost of your best lap (+150 🪙 for a record).",
  "СВОБОДНАЯ ЕЗДА": "FREE DRIVE",
  "— просто катайся.": "— just drive around.",
  "🚓 Погоня": "🚓 Chase",
  "Сел на полицейскую машину — ты": "In the police car you are the",
  "КОП": "COP",
  ": догони преступника (поймал = 0 метров до него). Пришёл на любой другой — ты": ": catch the criminal (caught = 0 metres to him). In any other car you are the",
  "ВОР": "THIEF",
  ": продержись 45 секунд!": ": hold out for 45 seconds!",
  "Правило скорости: держишь": "Speed rule: keep",
  "больше 85 км/ч": "above 85 km/h",
  "— полиция не догонит, замешкался — она рядом. На развилках дорога делится на": "— the police can't catch you; slow down and they're right behind. At forks the road splits into",
  "4 полосы": "4 lanes",
  ": две левые — в одну сторону, две правые — в другую. По дороге едут": ": the two left lanes go one way, the two right lanes the other. On the road there are",
  "мирные машины": "civilian cars",
  ": врезался — ИГРА ОКОНЧЕНА!": ": hit one and it's GAME OVER!",
  "🏙 Город и топливо": "🏙 City and fuel",
  "В Городе — все заезды на карте плюс": "The City has every race on the map plus the",
  "ШОССЕ": "HIGHWAY",
  ". Бензин существует только здесь! На шоссе заправки:": ". Fuel only exists here! Highway gas stations:",
  "— полный бак (2 🪙),": "— full tank (2 🪙),",
  "— полбака (1 🪙). Кончился бензин — эвакуатор за −50 🪙.": "— half a tank (1 🪙). Out of fuel — a tow truck for −50 🪙.",
  "— разворот на шоссе.": "— U-turn on the highway.",
  "🔧 Гараж и тюнинг": "🔧 Garage and tuning",
  "Больше 130 машин! Все покупаются за монеты (кроме Авио). Кнопка «📂 Категория» — фильтры по типу и по марке. Особые: ЗИС-115 — только за секретный код, Машина времени — только за достижение!": "Over 130 cars! All are bought with coins (except the Avio). The «📂 Category» button filters by type and by brand. Special ones: ZIS-115 — secret code only, the Time Machine — achievement only!",
  "В тюнинге: 🎨 краски, 🏁 винилы, 🔩 спойлер/диски/неон, ⚙️ железо — мотор (+тяга и максималка), тормоза, шины. И": "Tuning has: 🎨 paint, 🏁 vinyls, 🔩 spoiler/rims/neon, ⚙️ hardware — engine (more power and top speed), brakes, tyres. And",
  "🔥 ТУРБО": "🔥 TURBO",
  "за 800 🪙: 3 заряда нитро на заезд (пробел или кнопка 🔥) — 3 секунды бешеной тяги, +8% сверх максималки и синее пламя! Электромобилям турбо не продаётся.": "for 800 🪙: 3 nitro charges per race (space or the 🔥 button) — 3 seconds of crazy power, +8% over top speed and a blue flame! Electric cars can't buy turbo.",
  "🛣️ Трассы": "🛣️ Tracks",
  "Семь штук (листай кнопкой или": "Seven of them (flip with the button or",
  "): Зелёное кольцо, Горный серпантин, Поля (коровы!), Пустыня (болидам нельзя — песок в моторе), Офроуд (только вездеходы), Трасса в бочках и": "): Green Ring, Mountain Pass, Fields (cows!), Desert (no racers — sand in the engine), Off-road (4x4s only), Barrel Circuit and",
  "ГИПЕРКОЛЬЦО": "HYPER RING",
  "— там соперники ТОЛЬКО гиперкары!": "— rivals there are hypercars ONLY!",
  "🏅 Достижения и деньги": "🏅 Achievements and money",
  "Медали за подвиги — смотри экран «Достижения». За «88 миль в час» на Делориане дают МАШИНУ ВРЕМЕНИ! Достижения ломаются при сбросе прогресса. Монеты зарабатываются в заездах и тратятся на машины и железо.": "Medals for great deeds — see the «Achievements» screen. «88 miles per hour» in the DeLorean wins the TIME MACHINE! Achievements are lost when progress is reset. Coins are earned in races and spent on cars and hardware.",
  "🌐 Мультиплеер": "🌐 Multiplayer",
  "Катайтесь вдвоём по интернету: один создаёт игру и получает код, второй вводит код и подключается.": "Drive together over the internet: one player creates a game and gets a code, the other enters the code and joins.",
  "💡 Советы": "💡 Tips",
  "· На механике тормози понижением передачи — гоночный приём!": "· On a manual, brake by shifting down — a racing trick!",
  "· Трава замедляет всех, кроме вездеходов и брони.": "· Grass slows everyone down except 4x4s and armour.",
  "· ЗИС-115 расшвыривает соперников тараном, но у него НЕТ тормозов.": "· The ZIS-115 rams rivals aside, but it has NO brakes.",
  "· Король скорости — Konisegg Agera RS: 447 км/ч, мировой рекорд!": "· The speed king is the Konisegg Agera RS: 447 km/h, a world record!",
  "⬅ Назад": "⬅ Back",

  // ---------- Мультиплеер ----------
  "Пир-ту-пир: катайтесь вдвоём по интернету!": "Peer-to-peer: drive together over the internet!",
  "🎮 Создать игру (получить код)": "🎮 Create a game (get a code)",
  "код друга: ins1-….": "friend's code: ins1-….",
  "🔗 Подключиться": "🔗 Join",
  "❌ Мультиплеер не загрузился — проверь интернет и обнови страницу.": "❌ Multiplayer didn't load — check the internet and reload the page.",
  "❌ Нет интернета — мультиплеер недоступен.": "❌ No internet — multiplayer is unavailable.",
  "Создаём игру…": "Creating a game…",
  "Код игры: {0} — продиктуй другу и жди!": "Game code: {0} — tell it to your friend and wait!",
  "❌ Ошибка: ": "❌ Error: ",
  "Сначала введи код друга!": "Enter your friend's code first!",
  "Подключаемся…": "Connecting…",
  "✅ Подключено! Выезжаем вместе…": "✅ Connected! Driving out together…",
  "Друг отключился.": "Your friend disconnected.",
  "ДРУГ": "FRIEND",

  // ---------- Город ----------
  "🏁 Кольцо": "🏁 Ring",
  "⚡ Драг": "⚡ Drag",
  "⏱ Рекорды": "⏱ Records",
  "🛣 ШОССЕ": "🛣 HIGHWAY",
  "⛽ Заправка": "⛽ Gas station",
  "⛽ Бак: {0}%": "⛽ Tank: {0}%",

  // ---------- Заезды ----------
  "🏁 ГОНКА — 3 круга с соперниками": "🏁 RACE — 3 laps with rivals",
  "⚡ ДРАГ — дуэль с препятствиями": "⚡ DRAG — a duel with obstacles",
  "⏱ ПРОТИВ РЕКОРДА — обгони призрака": "⏱ TIME ATTACK — beat the ghost",
  "🚗 СВОБОДНАЯ ЕЗДА — без соперников": "🚗 FREE DRIVE — no rivals",
  "🚓 ПОГОНЯ — на полиции ты коп, иначе ВОР!": "🚓 CHASE — in the police car you're a cop, otherwise a THIEF!",
  "🛣️ Трасса: ": "🛣️ Track: ",
  "Зелёное кольцо": "Green Ring",
  "Горный серпантин": "Mountain Pass",
  "Поля": "Fields",
  "Пустыня": "Desert",
  "Офроуд": "Off-road",
  "Трасса": "Barrel Circuit",
  "Гиперкольцо": "Hyper Ring",
  "Драг-полоса": "Drag strip",
  "Шоссе": "Highway",
  "Погоня": "Chase",
  "🏜 В пустыне болиды не работают: песок в моторе! Возьми другую машину.": "🏜 Racers don't work in the desert: sand in the engine! Take another car.",
  "⛰ Офроуд — только внедорожники и броня! Ищи в гараже вездеходы.": "⛰ Off-road is for 4x4s and armour only! Find an off-roader in the garage.",

  // ---------- Гараж ----------
  "🔧 ГАРАЖ": "🔧 GARAGE",
  "📂 Категория: ": "📂 Category: ",
  "Максималка": "Top speed",
  " км/ч": " km/h",
  "км/ч": "km/h",
  "Разгон 0–100": "0–100 km/h",
  " сек": " s",
  "Тормоза 100–0": "Braking 100–0",
  "Коробка": "Gearbox",
  "А — автомат": "A — automatic",
  "М — механика": "M — manual",
  "С — смешанная": "S — mixed",
  "Э — электро (без коробки!)": "E — electric (no gearbox!)",
  "✅ Уже выбрана!": "✅ Already selected!",
  "✅ Выбрать эту машину": "✅ Select this car",
  "🔩 Тюнинг": "🔩 Tuning",
  "🔒 Только по секретному коду!": "🔒 Secret code only!",
  "🏅 Только за достижение «88 миль в час»!": "🏅 Only for the «88 miles per hour» achievement!",
  "💰 Купить за {0} 🪙": "💰 Buy for {0} 🪙",
  "Не хватает {0} 🪙 — выиграй заезд!": "{0} 🪙 short — win a race!",
  "📂 КАТЕГОРИИ": "📂 CATEGORIES",
  "По типу": "By type",
  "По марке": "By brand",
  "⬅ Назад в гараж": "⬅ Back to garage",
  "Все": "All",
  "Городские": "City cars",
  "Спорт": "Sport",
  "Люкс": "Luxury",
  "Вездеходы": "Off-roaders",
  "СССР": "USSR",
  "Болиды и гиперкары": "Racers and hypercars",
  "ВАЗ": "VAZ",
  "ГАЗ": "GAZ",
  "УАЗ": "UAZ",
  "РАФ": "RAF",
  "ЗИС": "ZIS",
  "Нет марки": "No brand",

  // ---------- Достижения ----------
  "🏅 ДОСТИЖЕНИЯ": "🏅 ACHIEVEMENTS",
  "Открыто: {0} из {1}": "Unlocked: {0} of {1}",
  "🏅 Достижение: {0} {1}!": "🏅 Achievement: {0} {1}!",
  "Первая победа": "First win",
  "Выиграй любую гонку": "Win any race",
  "88 миль в час!": "88 miles per hour!",
  "Разгони Делориан до 142 км/ч. Награда: МАШИНА ВРЕМЕНИ в гараже!": "Get the DeLorean to 142 km/h. Reward: the TIME MACHINE in your garage!",
  "Гиперскорость": "Hyperspeed",
  "Разгонись до 344 км/ч": "Reach 344 km/h",
  "Буханка-чемпион": "Bukhanka champion",
  "Выиграй гонку на Буханке": "Win a race in the Bukhanka",
  "Богач": "Rich kid",
  "Накопи 5000 монет": "Save up 5000 coins",
  "Коллекционер": "Collector",
  "Владей десятью машинами": "Own ten cars",
  "Гараж СССР": "USSR garage",
  "Собери ВСЕ машины СССР (да, даже ЗИС!)": "Collect ALL the USSR cars (yes, even the ZIS!)",
  "Друг на связи": "Friend online",
  "Сыграй с другом в мультиплеере": "Play with a friend in multiplayer",
  "Именем закона!": "In the name of the law!",
  "Задержи преступника в погоне": "Catch a criminal in a chase",
  "Неуловимый": "Untouchable",
  "Уйди от полиции, играя за вора": "Escape the police as the thief",

  // ---------- Настройки ----------
  "⚙️ НАСТРОЙКИ": "⚙️ SETTINGS",
  "На каждую функцию — две клавиши. Кликни по клавише и нажми новую.": "Two keys for every action. Click a key and press a new one.",
  "секретный код…": "secret code…",
  "✨ Активировать": "✨ Activate",
  "✨ Код «вечная ностальгия» активен — ЗИС-115 открыт!": "✨ Code «вечная ностальгия» is active — the ZIS-115 is unlocked!",
  "🛡 Код «админский код секрет» активен — все машины (кроме ЗИС-115 и Машины Времени!) и": "🛡 Code «админский код секрет» is active — all cars (except the ZIS-115 and the Time Machine!) and",
  "🛡 Код «админский код секрет» активен — все машины (кроме ЗИС-115 и Машины Времени!) и <i>бесконечные деньги</i>": "🛡 Code «админский код секрет» is active — all cars (except the ZIS-115 and the Time Machine!) and <i>unlimited money</i>",
  "бесконечные деньги": "unlimited money",
  "↩ Базовые настройки": "↩ Default settings",
  "🗑 Сбросить прогресс": "🗑 Reset progress",
  "⚠️ Точно? Кликни ещё раз!": "⚠️ Sure? Click again!",
  "✅ Прогресс сброшен!": "✅ Progress reset!",
  "✅ Принято!": "✅ Accepted!",
  "🛡 АДМИН!": "🛡 ADMIN!",
  "❌ Неверный код": "❌ Wrong code",
  "Газ": "Gas",
  "Тормоз": "Brake",
  "Руль влево": "Steer left",
  "Руль вправо": "Steer right",
  "Мотор (завести/заглушить)": "Engine (start/stop)",
  "Коробка: автомат/ручная": "Gearbox: automatic/manual",
  "Передача ниже": "Gear down",
  "Передача выше": "Gear up",
  "Режим поездки (Эко/Норма/Спорт)": "Drive mode (Eco/Normal/Sport)",
  "Разворот (на шоссе)": "U-turn (on the highway)",
  "Заправка: полный бак — 2 🪙": "Refuel: full tank — 2 🪙",
  "Заправка: полбака — 1 🪙": "Refuel: half a tank — 1 🪙",
  "🔥 ТУРБО (нитро, если куплено)": "🔥 TURBO (nitro, if bought)",
  "Пробел": "Space",
  "Shift пр.": "Right Shift",
  "Ctrl пр.": "Right Ctrl",
  "нажми...": "press...",

  // ---------- Тюнинг ----------
  "🔩 ТЮНИНГ": "🔩 TUNING",
  "🎨 Цвет": "🎨 Paint",
  "🏁 Винил": "🏁 Vinyl",
  "🔩 Детали": "🔩 Parts",
  "⚙️ Железо": "⚙️ Hardware",
  "↩ Сброс тюнинга": "↩ Reset tuning",
  "⬅ В гараж": "⬅ To garage",
  "нет": "none",
  "синий": "blue",
  "розовый": "pink",
  "зелёный": "green",
  "полосы": "stripes",
  "пламя": "flames",
  "номер": "number",
  "Мотор": "Engine",
  "Тормоза": "Brakes",
  "Шины": "Tyres",
  "машина времени не тюнингуется": "the time machine can't be tuned",
  "снаружи только заводской": "factory look only",
  "завод": "factory",
  "номер: некуда клеить": "number: no room for it",
  "спойлер этой машине не ставится": "this car can't take a spoiler",
  "крыло уже есть!": "already has a wing!",
  "спойлер": "spoiler",
  "золотые диски": "gold rims",
  "неон: ": "neon: ",
  "тормоза: НЕТ (и не будет!)": "brakes: NONE (and never will be!)",
  "мотор: заводской максимум": "engine: factory maximum",
  "ТУРБО: электро и так пуляет!": "TURBO: electric is fast anyway!",
  "ТУРБО: 🔥 стоит! Пробел в гонке": "TURBO: 🔥 fitted! Space in a race",
  "ТУРБО: кнопка нитро · {0} 🪙": "TURBO: nitro button · {0} 🪙",

  // ---------- Пауза, финиш, авария ----------
  "ПАУЗА": "PAUSE",
  "Esc — продолжить гонку": "Esc — continue the race",
  "🔁 Снова заезд": "🔁 Race again",
  "🏠 Главное меню": "🏠 Main menu",
  "🏁 ФИНИШ!": "🏁 FINISH!",
  "🔁 Ещё гонку!": "🔁 Another race!",
  "💥 АВАРИЯ!": "💥 CRASH!",
  "Столкновение! Мотор заглох.": "Collision! The engine stalled.",
  "🚨 ИГРА ОКОНЧЕНА": "🚨 GAME OVER",
  "Врезался в мирную машину — погоня провалена!": "You hit a civilian car — the chase is lost!",
  "ТОРМОЗ": "BRAKE",
  "ФИНИШ": "FINISH",
  "{0} Место: {1} из {2}!   Приз: +{3} 🪙 (всего: {4})": "{0} Place: {1} of {2}!   Prize: +{3} 🪙 (total: {4})",

  // ---------- Сообщения в заезде ----------
  "🔄 Разворот!": "🔄 U-turn!",
  "🏆 НОВЫЙ РЕКОРД: {0} с!  +150 🪙": "🏆 NEW RECORD: {0} s!  +150 🪙",
  "Круг: {0} с (рекорд: {1})": "Lap: {0} s (record: {1})",
  "🚓 ДОГОНИ ПРЕСТУПНИКА! Он на {0}!": "🚓 CATCH THE CRIMINAL! He's in a {0}!",
  "🚔 ТЫ ВОР! Продержись 45 секунд — и уйдёшь!": "🚔 YOU'RE THE THIEF! Hold out for 45 seconds and you're free!",
  "⛽ Бак уже полон!": "⛽ The tank is already full!",
  "⛽ Полный бак стоит 2 🪙 — не хватает!": "⛽ A full tank costs 2 🪙 — not enough!",
  "⛽ Полный бак за 2 🪙!": "⛽ Full tank for 2 🪙!",
  "⛽ Нужно 2 🪙 — не хватает!": "⛽ You need 2 🪙 — not enough!",
  "⛽ Нужна 1 🪙 — кошелёк пуст!": "⛽ You need 1 🪙 — the wallet is empty!",
  "⛽ Полбака за 1 🪙!": "⛽ Half a tank for 1 🪙!",
  "🔥 ТУРБО! Осталось зарядов: {0}": "🔥 TURBO! Charges left: {0}",
  "🔥 ТУРБО! Это был последний заряд!": "🔥 TURBO! That was the last charge!",
  "🚛 Эвакуатор: −50 🪙, в баке 20%. Заведи мотор!": "🚛 Tow truck: −50 🪙, 20% in the tank. Start the engine!",
  "🌀 Полиция потеряла тебя на развилке!": "🌀 The police lost you at the fork!",
  "🚔 Полиция успела свернуть за тобой!": "🚔 The police turned after you!",
  "🚔 ПОЙМАН! Штраф: −150 🪙 (всего: {0})": "🚔 CAUGHT! Fine: −150 🪙 (total: {0})",
  "🏃 УШЁЛ ОТ ПОГОНИ! Приз: +{0} 🪙 (всего: {1})": "🏃 ESCAPED THE CHASE! Prize: +{0} 🪙 (total: {1})",
  "✅ Верная дорога!": "✅ Right way!",
  "🛣 Свернул не туда — преступник ушёл по другой дороге!": "🛣 Wrong turn — the criminal took the other road!",
  "🚓 ЗАДЕРЖАН! Приз: +{0} 🪙 (всего: {1})": "🚓 ARRESTED! Prize: +{0} 🪙 (total: {1})",
  "😞 Преступник скрылся… Попробуй ещё раз!": "😞 The criminal got away… Try again!",
  "⚡ 88 МИЛЬ В ЧАС! ⚡": "⚡ 88 MILES PER HOUR! ⚡",
  "ТУРБО!": "TURBO!",
  "🚓 До преступника: {0} м": "🚓 To the criminal: {0} m",
  "🚔 Полиция: {0} м · Держись ещё {1} с": "🚔 Police: {0} m · Hold on for {1} s",

  // ---------- Табло (HUD) ----------
  "Коробка: ": "Gearbox: ",
  "Трасса: ": "Track: ",
  "T — сменить трассу": "T — change track",
  "электро: коробки нет!": "electric: no gearbox!",
  "{0} — ниже, {1} — выше": "{0} — down, {1} — up",
  ", {0} — автомат": ", {0} — automatic",
  " (механика!)": " (manual!)",
  "{0} — ручная коробка": "{0} — manual gearbox",
  "автомат": "automatic",
  "Передача: ": "Gear: ",
  "Режим: ": "Mode: ",
  " — сменить режим": " — change mode",
  "ЭКО": "ECO",
  "НОРМА": "NORMAL",
  "СПОРТ": "SPORT",
  "🔇 M — включить звук": "🔇 M — sound on",
  "🔊 {0}%   M — выкл,  − / + — громкость": "🔊 {0}%   M — off,  − / + — volume",
  "⛽ {0} — полный бак (2 🪙)  ·  {1} — полбака (1 🪙)": "⛽ {0} — full tank (2 🪙)  ·  {1} — half a tank (1 🪙)",
  "⛽ Заправка! Остановись у колонки": "⛽ Gas station! Stop at the pump",
  "⛽ БЕНЗИН КОНЧИЛСЯ!": "⛽ OUT OF FUEL!",
  "⏱ {0} с   ·   Рекорд: {1}": "⏱ {0} s   ·   Record: {1}",
  "РЕКОРД": "RECORD",
  "⚡ ДРАГ-ДУЭЛЬ   Место {0}/2": "⚡ DRAG DUEL   Place {0}/2",
  "Круг {0}/{1}   Место {2}/{3}": "Lap {0}/{1}   Place {2}/{3}",
  "🚀 Стартовый ускоритель: {0} с — жми газ!": "🚀 Launch boost: {0} s — hit the gas!",
  "🛡 Щит: {0} с  (от ЗИС-115 не спасает!)": "🛡 Shield: {0} s  (no help against the ZIS-115!)",
  "Заводи мотор ({0}) и приготовься!": "Start the engine ({0}) and get ready!",
  "Заводим...": "Starting...",
  "🔑 Нажми {0} — заведи мотор!": "🔑 Press {0} — start the engine!",
  "Тормоза?.. У брони НЕТ тормозов! 😄": "Brakes?.. Armour has NO brakes! 😄",
  "Трава! Вернись на дорогу!": "Grass! Get back on the road!",

  // ---------- Надписи на машинах ----------
  "САША": "SASHA",
  "ВАЗ 2101": "VAZ 2101",
  "ВАЗ 2104": "VAZ 2104",
  "ВОЛГА": "VOLGA",
  "Волга": "Volga",
  "НИВА": "NIVA",
  "Ч А Й К А": "C H A I K A",

  // ---------- Названия машин ----------
  "TimeLorean Машина Времени": "TimeLorean Time Machine",
  "Болид Формулы Фьорд": "Fjord Formula racer",
  "Болид Fi-1": "Fi-1 racer",
  "Болид Fi-2": "Fi-2 racer",
  "Болид Fi-3": "Fi-3 racer",
  "Болид IndiKar": "IndiKar racer",
  "ЗИС-115 Бронированный": "ZIS-115 Armoured",
  "Буханка 452": "Bukhanka 452",
  "РАФ 2203": "RAF 2203",
  "Копейка 2101": "Kopeyka 2101",
  "Семёрка 2107": "Semyorka 2107",
  "Четвёрка 2104": "Chetvyorka 2104",
  "Linkorn Марк V 1979": "Linkorn Mark V 1979",
  "РАФ 977 Латвия": "RAF 977 Latvia",
  "УАЗ-469 Козлик": "UAZ-469 Kozlik",
  "ЗИС-101": "ZIS-101",
  "ЗИС-110": "ZIS-110",
  "Dodgee Charjer ПОЛИЦИЯ": "Dodgee Charjer POLICE",
  "РАФ-22031 Скорая": "RAF-22031 Ambulance",
  "РАФ-2909 Олимпийский": "RAF-2909 Olympic",
  "ЗИС-5 «Трёхтонка»": "ZIS-5 «Three-tonner»",
  "УАЗ Патриот": "UAZ Patriot",
  "УАЗ Хантер": "UAZ Hunter",
  "ВАЗ Нива": "VAZ Niva",
  "ГАЗ-13 Чайка": "GAZ-13 Chaika",
  "ГАЗ-13 Чайка Канада": "GAZ-13 Chaika Canada",
  "Волга 3110": "Volga 3110",
  "Волга 24": "Volga 24",
  "Волга 21": "Volga 21",

  // ---------- Описания машин ----------
  "Первая машина игры. Дизайн — по спецификации Саши.": "The game's first car. Designed to Sasha's spec.",
  "Городской малыш на автомате. Лёгкий, юркий, дружелюбный.": "A little city automatic. Light, nimble, friendly.",
  "Крепкий хэтчбек: заметно быстрее, но всё прощает.": "A tough hatchback: clearly faster, but forgives everything.",
  "Легенда из нержавейки: жалюзи на стекле и фонари-сетки. 88 миль/ч = 142 км/ч… попробуй разогнаться!": "A stainless-steel legend: louvres on the glass and grille lights. 88 mph = 142 km/h… try to get there!",
  "Награда за «88 миль в час»: решётки, огонь и путешествия во времени!": "The reward for «88 miles per hour»: grilles, fire and time travel!",
  "Новейшая Корза: 3 режима поездки — Эко, Норма и Спорт!": "The newest Corza: 3 drive modes — Eco, Normal and Sport!",
  "Оранжевый маслкар с белыми полосами. Только механика, только хардкор!": "An orange muscle car with white stripes. Manual only, hardcore only!",
  "Современный мускул: белый, злой, четыре трубы в диффузоре.": "Modern muscle: white, angry, four pipes in the diffuser.",
  "Классика с хромом: плавные крылья и круглые фонари.": "Chrome classic: smooth fenders and round lights.",
  "Клин-суперкар: мотор за спиной, крыло и четыре трубы.": "A wedge supercar: engine behind you, a wing and four pipes.",
  "Белый с синими полосами Ле-Мана. Легенда шестидесятых.": "White with blue Le Mans stripes. A sixties legend.",
  "Тёмный Пони 2023: три полосы фонарей, сильнее старого Шелбби.": "Dark Pony 2023: three light bars, stronger than the old Shelbee.",
  "Открытые колёса, серийный мотор, лёгкий как пёрышко.": "Open wheels, a production engine, light as a feather.",
  "Король скорости: огромное крыло, 350 км/ч. Вершина гаража!": "A speed king: a huge wing, 350 km/h. The top of the garage!",
  "Таранит деревья, не вязнет в траве… и НЕ УМЕЕТ ТОРМОЗИТЬ. Удачи!": "Rams trees, never gets stuck in grass… and CAN'T BRAKE. Good luck!",
  "Большой внедорожник: трава ему не помеха. Но деревья объезжай!": "A big off-roader: grass is no problem. But drive around the trees!",
  "Пикап-вездеход: по траве как по асфальту. Только деревья не таранит!": "A 4x4 pickup: grass feels like asphalt. It just can't ram trees!",
  "Современный кроссовер: быстрый на шоссе и не боится травы.": "A modern crossover: fast on the highway and not afraid of grass.",
  "Легендарный фургон-вездеход: не быстрый, зато нигде не застрянет.": "A legendary 4x4 van: not fast, but it never gets stuck.",
  "Рижский микроавтобус: возил такси и скорую. Теперь — гоняет!": "A minibus from Riga: it was a taxi and an ambulance. Now it races!",
  "Вишнёвая классика: хром, честная механика и вечная любовь.": "A cherry-red classic: chrome, an honest manual and love forever.",
  "Белая семёрка: большие фонари, дворовый престиж высшей пробы.": "A white Semyorka: big lights, top-class neighbourhood prestige.",
  "Красный универсал: багажник размером с дачу. Везёт ВСЁ.": "A red estate: a boot the size of a country house. Carries EVERYTHING.",
  "Кислотно-зелёный мускул: рычит так, что дрожат стёкла.": "Acid-green muscle: it roars so hard the windows shake.",
  "Чёрный седан-мускул: семейный снаружи, злой внутри.": "A black muscle sedan: family car outside, angry inside.",
  "Жёлтая легенда 60-х: полоса-шмель и хромовый характер.": "A yellow 60s legend: a bumblebee stripe and a chrome attitude.",
  "Белый семейный танк: фонарь во всю корму, как гоночный трек.": "A white family tank: a light across the whole back, like a race track.",
  "Чёрный небоскрёб на колёсах с фонарями до самой крыши.": "A black skyscraper on wheels with lights up to the roof.",
  "Концепт с мотором V16: шестнадцать цилиндров роскоши.": "A concept with a V16: sixteen cylinders of luxury.",
  "Красный аккуратный седан: галстук-бабочка на багажнике.": "A neat red sedan: a bow tie on the boot.",
  "Синий малыш с запаской на двери — готов к приключениям.": "A little blue car with a spare wheel on the door — ready for adventure.",
  "Чёрный кроссовер: тихий, удобный и не боится обочин.": "A black crossover: quiet, comfy and not afraid of the roadside.",
  "Синий гиперкар: круглые фонари-турбины и 348 км/ч!": "A blue hypercar: round turbine lights and 348 km/h!",
  "Синий люкс-кроссовер с фонарём через всю корму.": "A blue luxury crossover with a light across the whole back.",
  "Чёрный лимузин-джентльмен: тонкая полоса света и тишина.": "A black gentleman's limo: a thin strip of light and silence.",
  "Голубой корабль 70-х: горб запаски на багажнике — фирменный знак.": "A light-blue 70s ship: the spare-wheel hump on the boot is its trademark.",
  "Белый крейсер с плавниками и четырьмя круглыми огнями.": "A white cruiser with fins and four round lights.",
  "Серый гигант: три ряда сидений и капитанский мостик.": "A grey giant: three rows of seats and a captain's bridge.",
  "Серебристый зефир: мягкий, сладкий, быстрее, чем кажется.": "A silver marshmallow: soft, sweet, faster than it looks.",
  "Белый красавец: светящаяся дуга через всю корму.": "A white beauty: a glowing arc across the whole back.",
  "Красный кроссовер: бодрый, семейный и не боится обочин.": "A red crossover: lively, family-friendly and not afraid of the roadside.",
  "Синий красавец: фонарь-пунктир через всю корму.": "A blue beauty: a dotted light across the whole back.",
  "Чёрный стиляга: светящаяся лента и имя по буквам.": "A black dandy: a glowing strip and its name spelled out.",
  "Серый гибрид с фонарями-когтями. Дворник спрятан под спойлер!": "A grey hybrid with claw lights. The wiper hides under the spoiler!",
  "Серебристый хэтчбек-кругляш: честный работяга.": "A round silver hatchback: an honest worker.",
  "Брат Корзы: серебристый хэтчбек на каждый день.": "The Corza's brother: a silver everyday hatchback.",
  "Открытая ракета 60-х: трубы торчат ИЗ БОКОВ. Брат Мустанго!": "A 60s open-top rocket: pipes stick out OF THE SIDES. The Mustango's brother!",
  "Квадратный брат Discoverry: запаска на двери, никаких компромиссов.": "The Discoverry's square brother: a spare on the door, no compromises.",
  "Младший брат 308-го: маленький, юркий, всеми любимый.": "The 308's little brother: small, nimble, loved by everyone.",
  "Старший брат 2203-го: бирюзовый ретро-фургончик 60-х.": "The 2203's big brother: a turquoise retro van from the 60s.",
  "Брат Буханки: открытый вездеход, скачет по кочкам как козлик.": "The Bukhanka's brother: an open 4x4 that hops over bumps like a goat.",
  "Мирный брат бронированного: чёрный лимузин 30-х. Без тарана!": "The armoured one's peaceful brother: a black 30s limo. No ramming!",
  "Младший брат Fi-1: та же школа, чуть скромнее мотор.": "The Fi-1's little brother: same school, a slightly smaller engine.",
  "Чёрная легенда 80-х: спойлер на ножках и красная полоска.": "A black 80s legend: a spoiler on legs and a red stripe.",
  "Красный семейный седан… с мотором монстра. Волк в костюме.": "A red family sedan… with a monster engine. A wolf in a suit.",
  "Служебный таран: сносит деревья с мигалкой. Но трава — его слабость!": "A service ram: knocks down trees with its lights on. But grass is its weakness!",
  "Стальной треугольник из будущего: свистит, а не рычит!": "A steel triangle from the future: it whistles, not roars!",
  "Тихая чёрная молния: ни рёва, ни труб — только свист и скорость.": "Quiet black lightning: no roar, no pipes — just a whistle and speed.",
  "Серебристая машина шпиона №007: вращающийся номер и характер джентльмена.": "Spy No. 007's silver car: a rotating number plate and a gentleman's manners.",
  "Супер-GT нового шпиона: 725 сил, алый, четыре трубы в диффузоре.": "The new spy's super-GT: 725 hp, scarlet, four pipes in the diffuser.",
  "Гиперкар для трека из книжки: крыло выше крыши и четыре трубы по центру.": "A track hypercar from a book: a wing above the roof and four centre pipes.",
  "Младший брат MC12: алый, чёрный низ, крыло и роспись на корме.": "The MC12's little brother: scarlet, black lower body, a wing and a signature on the back.",
  "Злой малыш: четыре трубы парами и рубленый диффузор.": "An angry little one: four pipes in pairs and a chopped diffuser.",
  "Зелёный, как гоночный газон: 510 сил и наглый характер.": "Green as a racing lawn: 510 hp and a cheeky attitude.",
  "Флагман-лимузин: хромовая полоса соединяет тонкие фонари.": "A flagship limo: a chrome strip joins the thin lights.",
  "Электро-лимузин: едет как облако, молчит как шпион.": "An electric limo: rides like a cloud, silent as a spy.",
  "Хищник: световая дуга через всю корму.": "A predator: a light arc across the whole back.",
  "Вездеход-шпион: красная лента-фонарь и белая крыша.": "A spy off-roader: a red light strip and a white roof.",
  "Белый четырёхдверный: седан, который обгоняет спорткары.": "A white four-door: a sedan that overtakes sports cars.",
  "«Четыре двери» по-итальянски: золотистый лимузин с росписью.": "«Four doors» in Italian: a golden limo with a signature.",
  "Серый ветер пустыни: четыре трубы парами.": "A grey desert wind: four pipes in pairs.",
  "Классика с фонарями-БУМЕРАНГАМИ — таких больше не делают!": "A classic with BOOMERANG lights — they don't make them like this any more!",
  "Вездеход с трезубцем: море по колено, трава по плечо.": "An off-roader with a trident: knee-deep in the sea, shoulder-deep in grass.",
  "Самая продаваемая машина планеты. Скромная и вечная.": "The best-selling car on the planet. Modest and eternal.",
  "Кроссовер-оригами: двухцветный, углы во все стороны.": "An origami crossover: two-tone, corners in every direction.",
  "Тот же оригами, но спортивный: чёрная крыша, злые фонари.": "The same origami, but sporty: a black roof, angry lights.",
  "Серебристый японский дедушка из 90-х: мягкий и честный.": "A silver Japanese grandpa from the 90s: soft and honest.",
  "Корона: красно-чёрный флагман со световой лентой.": "The Crown: a red-and-black flagship with a light strip.",
  "Легенда 90-х с ОГРОМНЫМ крылом и круглыми фонарями. JDM!": "A 90s legend with a HUGE wing and round lights. JDM!",
  "Внучка легенды: та же красная ярость, новые мускулы.": "The legend's granddaughter: the same red fury, new muscles.",
  "Городской малыш: юркий, как воробей.": "A little city car: nimble as a sparrow.",
  "Бирюзовый гибрид: наполовину электричка, но коробка обычная.": "A turquoise hybrid: half electric, but a normal gearbox.",
  "Американский овальный монстр: на прямой быстрее даже Fi-1!": "An American oval monster: on the straight it's faster than even the Fi-1!",
  "Школа чемпионов: здесь начинают будущие короли Fi-1.": "The school of champions: future Fi-1 kings start here.",
  "Белая санитарка с красной полосой: уступи дорогу!": "A white ambulance with a red stripe: make way!",
  "Советский ЭЛЕКТРОМОБИЛЬ 1980 года: вёз олимпийский огонь и не коптил!": "A Soviet ELECTRIC CAR from 1980: it carried the Olympic flame without any smoke!",
  "Чёрный правительственный лимузин: хром и восемь цилиндров.": "A black government limo: chrome and eight cylinders.",
  "Первый ГРУЗОВИК в гараже: деревянные борта, стальной характер.": "The first TRUCK in the garage: wooden sides, a steel attitude.",
  "Искусство на колёсах: круглые фонари-турбины и МЕХАНИКА.": "Art on wheels: round turbine lights and a MANUAL.",
  "Гоночная легенда: букет труб по центру и крыло во всю корму.": "A racing legend: a bouquet of pipes in the centre and a full-width wing.",
  "Бывший рекордсмен мира: шесть круглых фонарей, номер «270 миль».": "A former world record holder: six round lights, «270 miles» on the plate.",
  "Народная электричка, которая обгоняет спорткары.": "A people's electric car that overtakes sports cars.",
  "Электро-вездеход с дверями-крыльями (спереди, честное слово!).": "An electric SUV with falcon-wing doors (at the front, honestly!).",
  "Новый Делориан 2022 года — ЭЛЕКТРО! Жалюзи на месте, огня не надо.": "The new 2022 DeLorean — ELECTRIC! The louvres stay, no fire needed.",
  "Серебристый хэтчбек с молнией на корме.": "A silver hatchback with a lightning bolt on the back.",
  "Флагман Опаля: строгий костюм, хромовый штрих.": "Opal's flagship: a strict suit, a chrome touch.",
  "Синее купе №12, обыгравшее Ferrari в Ле-Мане. Обрубленный хвост!": "Blue coupe No. 12 that beat Ferrari at Le Mans. A chopped tail!",
  "Запаска на калитке и никакого страха перед грязью.": "A spare wheel on the tailgate and no fear of mud.",
  "Внук 469-го: квадратный, честный, вечный.": "The 469's grandson: square, honest, eternal.",
  "Плавники-ракеты и круглые фонари-дюзы: космос 60-х!": "Rocket fins and round nozzle lights: 60s space age!",
  "Чёрный костюм, четыре трубы: самый быстрый Кадиллак в истории.": "A black suit, four pipes: the fastest Kadillark in history.",
  "Гиперкар Ле-Мана БЕЗ заднего крыла — три когтя света с каждой стороны.": "A Le Mans hypercar WITHOUT a rear wing — three claws of light on each side.",
  "Городской модник: узкие красные фонари и покатая крыша.": "A city fashionista: narrow red lights and a sloping roof.",
  "Квадратный аристократ: огромное стекло и болотные сапоги в багажнике.": "A square aristocrat: a huge window and wellies in the boot.",
  "Новый король вездеходов: золотистый, гладкий, как галька.": "The new king of off-roaders: golden, smooth as a pebble.",
  "Злой белый малыш из ралли: красная полоска и жёлтый номер.": "An angry little white rally car: a red stripe and a yellow plate.",
  "1600 сил и гигантское крыло: НОВЫЙ король скорости в гараже!": "1600 hp and a giant wing: the NEW speed king of the garage!",
  "Овальная труба по центру и мягкая сила: 1500 гибридных лошадей.": "An oval centre pipe and gentle power: 1500 hybrid horses.",
  "Вездеход-легенда: куда Нива залезет, туда джипы боятся.": "A legendary 4x4: where the Niva climbs, jeeps are scared to go.",
  "Чёрный лимузин с плавниками и КНОПОЧНЫМ автоматом — правда!": "A black limo with fins and a PUSH-BUTTON automatic — really!",
  "Кастом ИЗ КАНАДЫ: универсал с запаской в хромовом кольце!": "A custom FROM CANADA: an estate with a spare in a chrome ring!",
  "Легенда с «хвостом кита» и красной лентой во всю корму.": "A legend with a «whale tail» and a red strip across the whole back.",
  "Серебристый король 911-х: двухэтажный выдвижной спойлер.": "The silver king of the 911s: a two-storey pop-up spoiler.",
  "Гоночный зверь: крыло-гигант на лебединых шеях СВЕРХУ.": "A racing beast: a giant wing on swan necks FROM ABOVE.",
  "Гибрид-гиперкар: выхлопные трубы торчат ВВЕРХ за кабиной!": "A hybrid hypercar: the exhaust pipes stick UP behind the cockpit!",
  "Легенда JDM: четыре круглых фонаря и крыло-полка.": "A JDM legend: four round lights and a shelf wing.",
  "«Годзилла»: внук Скайлайна с теми же четырьмя кругами.": "«Godzilla»: the Skyline's grandson with the same four circles.",
  "Оранжевое зетто: хвост-утёнок и буква Z на корме.": "An orange Z-car: a ducktail and a Z on the back.",
  "Красный семейный вездеход с хромовой бровью.": "A red family off-roader with a chrome eyebrow.",
  "Белый городской кроссовер с антенной-удочкой.": "A white city crossover with a fishing-rod antenna.",
  "Лягушонок-спортсмен: фонари-бумеранги высоко на боках.": "A sporty little frog: boomerang lights high on the sides.",
  "1500 сил: подкова, плавник и лента света во всю корму.": "1500 hp: a horseshoe, a fin and a light strip across the whole back.",
  "Кольцо света и V16: 360 км/ч — вице-король за Агерой.": "A ring of light and a V16: 360 km/h — vice-king behind the Agera.",
  "Трековый монстр: крыло-Х и четыре трубы квадратом.": "A track monster: an X-wing and four pipes in a square.",
  "1700 сил и 0–100 за 1.9 сек. Электроника держит 344 км/ч.": "1700 hp and 0–100 in 1.9 s. Electronics hold it at 344 km/h.",
  "Роскошь: карбон, крыло-этажерка и четыре трубы букетом.": "Luxury: carbon, a stacked wing and a bouquet of four pipes.",
  "Чёрная классика гонок: спойлер на багажнике и характер чемпиона.": "A black racing classic: a boot spoiler and a champion's attitude.",
  "Матово-серый зверь: крыло-карбон и четыре трубы парами.": "A matte-grey beast: a carbon wing and four pipes in pairs.",
  "Двухцветная роскошь: едет тихо, выглядит громко.": "Two-tone luxury: drives quietly, looks loud.",
  "Белый купе-внедорожник: покатая крыша, широкие плечи.": "A white coupe SUV: a sloping roof, wide shoulders.",
  "Матовый хот-хэтч с красной крышей: лев на корме рычит.": "A matte hot hatch with a red roof: the lion on the back roars.",
  "Белая рабочая лошадка: большие оранжевые фонари, стальной характер.": "A white workhorse: big orange lights, a steel attitude.",
  "Серебристая классика: хром по кругу и багажник-чемодан.": "A silver classic: chrome all round and a suitcase of a boot.",
  "Розовая с белой крышей: олень на капоте, «Три тополя» на Плющихе.": "Pink with a white roof: a deer on the bonnet, straight out of an old Soviet film.",
  "Белая капля-ракета: плавники, лента огня и электроника на 320.": "A white teardrop rocket: fins, a strip of fire and electronics set to 320.",
  "МИРОВОЙ РЕКОРДСМЕН: 447 км/ч в Неваде. Король скорости!": "WORLD RECORD HOLDER: 447 km/h in Nevada. The speed king!",
  "Брат Вайры: четыре трубы кругом и опера вместо выхлопа.": "The Wayra's brother: four pipes in a circle and opera instead of exhaust.",
  "Старший брат Туатары: белая капля, что была быстрейшей в мире.": "The Tuatara's big brother: a white teardrop that was the fastest in the world.",

  // ---------- Склейки «надпись: значение» ----------
  "📂 Категория: {0}": "📂 Category: {0}",
  "неон: {0}": "neon: {0}",
  "Коробка: {0}": "Gearbox: {0}",
  "🛣️ Трасса: {0}": "🛣️ Track: {0}",
  "Трасса: {0}": "Track: {0}",
  "Передача: {0}": "Gear: {0}",
  "Режим: {0}": "Mode: {0}",
  "Место: {0} из {1}": "Place: {0} of {1}",

  // ---------- Буквы коробок ----------
  "А": "A",
  "М": "M",
  "С": "S",
  "Э": "E",
};

// Язык: сохранённый выбор, а если его нет — язык браузера
let LANG = "ru";
try {
  const saved = localStorage.getItem("ins1-lang");
  LANG = saved || ((navigator.language || "ru").toLowerCase().startsWith("ru") ? "ru" : "en");
} catch {}

const CYR = /[А-Яа-яЁё]/;
// Шаблоны с {0}, {1}… превращаем в регулярные выражения
const PATTERNS = Object.keys(EN).filter((k) => /\{\d\}/.test(k)).map((k) => {
  const order = [];
  const src = k.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\?\{(\d)\\?\}/g, (m, d) => {
    order.push(+d); return "(.+?)";
  });
  return { re: new RegExp("^" + src + "$"), en: EN[k], order };
});
// Кусочки для длинных склеенных строк — от длинных к коротким
const PIECES = Object.keys(EN)
  .filter((k) => k.length >= 4 && CYR.test(k) && !/\{\d\}/.test(k))
  .sort((a, b) => b.length - a.length)
  .map((k) => ({
    re: new RegExp("(?<![А-Яа-яЁё])" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![А-Яа-яЁё])", "g"),
    en: EN[k],
  }));

const CACHE = new Map();
function tr(s) {
  if (LANG !== "en" || typeof s !== "string" || !CYR.test(s)) return s;
  if (CACHE.has(s)) return CACHE.get(s);
  let out;
  const core = s.trim();
  if (EN[core] !== undefined) {
    out = s.replace(core, EN[core]);
  } else {
    for (const p of PATTERNS) {
      const m = core.match(p.re);
      if (m) {
        out = s.replace(core, p.en.replace(/\{(\d)\}/g, (_, d) => tr(m[p.order.indexOf(+d) + 1])));
        break;
      }
    }
    if (out === undefined) {
      out = s;
      for (const p of PIECES) if (CYR.test(out)) out = out.replace(p.re, p.en);
    }
  }
  if (CACHE.size > 3000) CACHE.clear();
  CACHE.set(s, out);
  return out;
}

// ---------- Надписи на холсте игры ----------
for (const name of ["fillText", "strokeText", "measureText"]) {
  const orig = CanvasRenderingContext2D.prototype[name];
  CanvasRenderingContext2D.prototype[name] = function (text, ...rest) {
    return orig.call(this, tr(text), ...rest);
  };
}

// ---------- Надписи на страницах ----------
// У каждого текстового узла помним русский оригинал (__ru) и то, что
// показали (__shown): если игра поменяла текст сама — это новый оригинал
// Кнопки, где одно и то же слово значит другое: «ГАЗ» на телефоне —
// это педаль газа, а не марка ГАЗ
const BY_PARENT_ID = { "t-gas": "GAS", "t-brake": "BRAKE" };
function trNode(n, force) {
  if (!force && n.__shown !== undefined && n.data === n.__shown) return;
  if (n.__shown === undefined || n.data !== n.__shown) n.__ru = n.data;
  const pid = n.parentNode && n.parentNode.id;
  const special = LANG === "en" && BY_PARENT_ID[pid] && n.__ru.trim()
    ? n.__ru.replace(n.__ru.trim(), BY_PARENT_ID[pid]) : null;
  const want = special || (LANG === "en" ? tr(n.__ru) : n.__ru);
  n.__shown = want;
  if (n.data !== want) n.data = want;
}
function trElement(el, force) {
  if (el.nodeType === 3) { trNode(el, force); return; }
  if (el.nodeType !== 1 || el.tagName === "SCRIPT" || el.tagName === "STYLE") return;
  if (el.getAttribute("translate") === "no") return;
  if (el.hasAttribute("placeholder")) {
    if (el.__ruPh === undefined || el.getAttribute("placeholder") !== el.__shownPh)
      el.__ruPh = el.getAttribute("placeholder");
    el.__shownPh = LANG === "en" ? tr(el.__ruPh) : el.__ruPh;
    el.setAttribute("placeholder", el.__shownPh);
  }
  for (const c of el.childNodes) trElement(c, force);
}
let observing = false;
const observer = new MutationObserver((list) => {
  for (const m of list) {
    if (m.type === "characterData") trNode(m.target);
    else for (const n of m.addedNodes) trElement(n);
  }
});
function applyLang() {
  document.documentElement.lang = LANG;
  trElement(document.body, true);
  if (!observing) {
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    observing = true;
  }
  const en = document.getElementById("btn-lang-en");
  const ru = document.getElementById("btn-lang-ru");
  if (en) en.classList.toggle("lang-on", LANG === "en");
  if (ru) ru.classList.toggle("lang-on", LANG === "ru");
}
function setLang(l) {
  LANG = l;
  CACHE.clear();
  try { localStorage.setItem("ins1-lang", l); } catch {}
  applyLang();
}
document.addEventListener("DOMContentLoaded", () => {
  applyLang();
  const en = document.getElementById("btn-lang-en");
  const ru = document.getElementById("btn-lang-ru");
  if (en) en.addEventListener("click", (e) => { setLang("en"); e.currentTarget.blur(); });
  if (ru) ru.addEventListener("click", (e) => { setLang("ru"); e.currentTarget.blur(); });
});
