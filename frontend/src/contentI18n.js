// Course and teacher records come from the backend in English only — that is
// the single language the admin panel stores. Switching the site to Russian or
// Uzbek therefore left every card half-translated: the chrome around it changed
// language while the title, description, "who it's for", programme, format and
// level inside it stayed English.
//
// This module is that missing layer. It overlays translated copy onto whatever
// the API returns, keyed by record id, and falls back to the English original
// whenever a record has no entry — so a course added later through Admin still
// renders, just untranslated, instead of disappearing.
//
// Values that repeat across records (formats, durations, levels, certificates)
// are translated once in `phrases`, by value rather than per record, so the same
// wording added to a new course is picked up without touching this file.

// ── Repeated values ─────────────────────────────────────────────────────────
const phrases = {
  ru: {
    // Formats
    'Group (up to 4)': 'Группа (до 4)',
    'Group (4–8)': 'Группа (4–8)',
    'Group (3–6)': 'Группа (3–6)',
    'Mini-group (2)': 'Мини-группа (2)',
    'Mini-group (2–3)': 'Мини-группа (2–3)',
    Individual: 'Индивидуально',
    'Individual only': 'Только индивидуально',
    'Intensive crash course': 'Интенсив',
    // Durations
    '2–6 months': '2–6 месяцев',
    '2–8 months': '2–8 месяцев',
    '3–6 months': '3–6 месяцев',
    '3–9 months': '3–9 месяцев',
    '3–12 months': '3–12 месяцев',
    '4–8 months': '4–8 месяцев',
    '4–12 months': '4–12 месяцев',
    '6 months – 3 years': '6 месяцев – 3 года',
    Flexible: 'Гибкий график',
    // Levels — CEFR codes are international and stay as they are
    'Grade 5 – 11': '5–11 класс',
    'Grade 9 – 11': '9–11 класс',
    'Grade 9 – 12': '9–12 класс',
    'Grade 10–12': '10–12 класс',
    'Intermediate – Advanced': 'Средний – продвинутый',
    // Certificates: brand names stay, role words are translated
    'IELTS Examiner': 'Экзаменатор IELTS',
    'Princeton Review Certified': 'Сертификат Princeton Review',
    'SAT Specialist': 'Специалист по SAT',
    'CEFR Assessor': 'Оценщик CEFR',
    'PhD Mathematics': 'PhD по математике',
    'Westminster Prep Certified': 'Сертификат подготовки Westminster',
    'HSK Level 6': 'HSK, уровень 6',
    'CSCA Examiner': 'Экзаменатор CSCA',
    'Physics Specialist': 'Специалист по физике',
    'RFL Certified Teacher': 'Сертифицированный преподаватель РКИ',
    'TORFL Examiner': 'Экзаменатор ТРКИ',
    'UFL Certified Teacher': 'Преподаватель узбекского как иностранного',
    'Uzbek Language Instructor': 'Преподаватель узбекского языка',
    'Goethe Institut Certified': 'Сертификат Goethe-Institut',
    'DaF Instructor': 'Преподаватель DaF',
    'DELE Examiner': 'Экзаменатор DELE',
    'SIELE Instructor': 'Преподаватель SIELE',
    'Instituto Cervantes Certified': 'Сертификат Instituto Cervantes',
  },
  uz: {
    // Formats
    'Group (up to 4)': 'Guruh (4 kishigacha)',
    'Group (4–8)': 'Guruh (4–8)',
    'Group (3–6)': 'Guruh (3–6)',
    'Mini-group (2)': 'Mini-guruh (2)',
    'Mini-group (2–3)': 'Mini-guruh (2–3)',
    Individual: 'Individual',
    'Individual only': 'Faqat individual',
    'Intensive crash course': 'Intensiv kurs',
    // Durations
    '2–6 months': '2–6 oy',
    '2–8 months': '2–8 oy',
    '3–6 months': '3–6 oy',
    '3–9 months': '3–9 oy',
    '3–12 months': '3–12 oy',
    '4–8 months': '4–8 oy',
    '4–12 months': '4–12 oy',
    '6 months – 3 years': '6 oy – 3 yil',
    Flexible: 'Moslashuvchan',
    // Levels
    'Grade 5 – 11': '5–11-sinf',
    'Grade 9 – 11': '9–11-sinf',
    'Grade 9 – 12': '9–12-sinf',
    'Grade 10–12': '10–12-sinf',
    'Intermediate – Advanced': "O'rta – yuqori",
    // Certificates
    'IELTS Examiner': 'IELTS imtihonchisi',
    'Princeton Review Certified': 'Princeton Review sertifikati',
    'SAT Specialist': "SAT bo'yicha mutaxassis",
    'CEFR Assessor': 'CEFR baholovchisi',
    'PhD Mathematics': "Matematika bo'yicha PhD",
    'Westminster Prep Certified': 'Westminster tayyorlov sertifikati',
    'HSK Level 6': 'HSK, 6-daraja',
    'CSCA Examiner': 'CSCA imtihonchisi',
    'Physics Specialist': "Fizika bo'yicha mutaxassis",
    'RFL Certified Teacher': "RKI sertifikatiga ega o'qituvchi",
    'TORFL Examiner': 'TORFL imtihonchisi',
    'UFL Certified Teacher': "O'zbek tilini chet tili sifatida o'qituvchi",
    'Uzbek Language Instructor': "O'zbek tili o'qituvchisi",
    'Goethe Institut Certified': 'Goethe-Institut sertifikati',
    'DaF Instructor': "DaF o'qituvchisi",
    'DELE Examiner': 'DELE imtihonchisi',
    'SIELE Instructor': "SIELE o'qituvchisi",
    'Instituto Cervantes Certified': 'Instituto Cervantes sertifikati',
  },
};

// ── Course categories — also the filter tabs on /courses ────────────────────
const categories = {
  ru: {
    All: 'Все',
    English: 'Английский',
    Math: 'Математика',
    Russian: 'Русский',
    Uzbek: 'Узбекский',
    German: 'Немецкий',
    Spanish: 'Испанский',
  },
  uz: {
    All: 'Barchasi',
    English: 'Ingliz tili',
    Math: 'Matematika',
    Russian: 'Rus tili',
    Uzbek: "O'zbek tili",
    German: 'Nemis tili',
    Spanish: 'Ispan tili',
  },
};

// ── Courses, by id ──────────────────────────────────────────────────────────
const courses = {
  ru: {
    1: {
      title: 'Общий английский',
      description: 'Комплексный английский для всех уровней. Развитие речи, письма, чтения и восприятия на слух.',
      audience: 'Всем, кто развивает английский для жизни и работы — от начального уровня до уверенного владения',
      program: ['Грамматика A1–C2', 'Разговорная беглость', 'Деловой английский', 'Чтение и письмо', 'Восприятие на слух'],
    },
    2: {
      title: 'Подготовка к IELTS',
      description: 'Целевая подготовка к IELTS на 6.5–8.0. Экспертные стратегии по всем четырём навыкам.',
      audience: 'Поступающим в университеты или на иммиграционные программы, где требуется балл IELTS',
      program: ['Writing Task 1 и 2', 'Speaking, части 1–3', 'Техники чтения', 'Мастерство аудирования', 'Пробные тесты с разбором'],
    },
    3: {
      title: 'Подготовка к CEFR',
      description: 'Подготовка к официальной сертификации по уровням CEFR A1–C2. Международно признанная квалификация.',
      audience: 'Тем, кому нужен официальный сертификат CEFR для учёбы или работы',
      program: ['Диагностика уровня CEFR', 'Грамматика по уровням', 'Экзаменационная техника для каждого уровня', 'Подготовка speaking и writing', 'Пробные экзамены CEFR'],
    },
    4: {
      title: 'Математика на русском',
      description: 'Математика на русском языке. Школьная программа, подготовка к олимпиадам и база для университета.',
      audience: 'Школьникам, изучающим математику на русском — школьная программа, олимпиады, поступление в вуз',
      program: ['Алгебра и теория чисел', 'Геометрия и тригонометрия', 'Функции и начала анализа', 'Теория вероятностей и статистика', 'Решение задач'],
    },
    5: {
      title: 'Подготовка в лицей и университет Westminster',
      description: 'Целевая подготовка к вступительным экзаменам в лицей и университет Westminster.',
      audience: 'Поступающим в лицей и университет Westminster',
      program: ['Формат экзамена Westminster', 'Совмещённая подготовка по математике и английскому', 'Критическое мышление', 'Разбор прошлых вариантов', 'Подготовка к собеседованию'],
    },
    6: {
      title: 'SAT Math',
      description: 'Подготовка к SAT Math: Heart of Algebra, Advanced Math и анализ данных.',
      audience: 'Поступающим в университеты, где требуются результаты SAT',
      program: ['Heart of Algebra', 'Advanced Math', 'Решение задач и анализ данных', 'Геометрия', 'Разделы с калькулятором и без'],
    },
    7: {
      title: 'Milliy Sertifikat',
      description: 'Подготовка к национальному сертификационному экзамену по математике в Узбекистане.',
      audience: 'Сдающим национальный сертификационный экзамен по математике',
      program: ['Повторение национальной программы', 'Формат экзамена и критерии оценки', 'Типовые задания', 'Скорость и точность', 'Полные пробные экзамены'],
    },
    8: {
      title: 'CSCA — математика и физика',
      description: 'Подготовка к китайскому стандартизированному экзамену CSCA по математике и физике.',
      audience: 'Готовящимся к китайскому стандартизированному экзамену CSCA по математике и физике',
      program: ['Формат экзамена CSCA', 'Высшая математика', 'Решение задач по физике', 'Китайская академическая терминология', 'Пробные экзамены'],
    },
    9: {
      title: 'Русский для иностранцев',
      description: 'Русский язык для неносителей — преподавание полностью на английском.',
      audience: 'Неносителям, которые хотят выучить русский через английский',
      note: 'Преподаётся на английском. Только индивидуально и в мини-группе.',
      program: ['Кириллица и фонетика', 'Основы грамматики на английском', 'Повседневное общение', 'Чтение и письмо', 'Русская культура'],
    },
    10: {
      title: 'Узбекский для иностранцев',
      description: 'Узбекский язык для неносителей — преподавание полностью на английском.',
      audience: 'Экспатам и иностранным специалистам, живущим или работающим в Узбекистане',
      note: 'Преподаётся на английском. Только индивидуально и в мини-группе.',
      program: ['Узбекский алфавит и произношение', 'Базовая грамматика на английском', 'Повседневное общение', 'Чтение и письмо', 'Культура'],
    },
    11: {
      title: 'Немецкий язык (A1 → C2)',
      description: 'Немецкий с нуля до C2. Полная подготовка к сертификатам Goethe-Institut включена.',
      audience: 'Изучающим немецкий с нуля, в том числе ради сертификации Goethe',
      note: 'Только индивидуально.',
      program: ['Фонетика и алфавит', 'Грамматика A1–C2', 'Разговорный немецкий', 'Стратегии экзаменов Goethe', 'Пробные экзамены Goethe'],
    },
    12: {
      title: 'Испанский язык',
      description: 'Испанский с начального до продвинутого уровня с опытными преподавателями.',
      audience: 'Изучающим испанский с нуля, в том числе ради DELE и SIELE',
      program: ['Фонетика испанского', 'Основы грамматики A1–C1', 'Разговорный испанский', 'Чтение и письмо', 'Подготовка к DELE/SIELE'],
    },
    13: {
      title: 'Подготовка к TOEFL',
      description: 'Подготовка к обновлённому TOEFL iBT: четыре раздела менее чем за два часа, оценка по шкале 1–6, привязанной к CEFR.',
      audience: 'Поступающим в университеты, которые принимают результаты TOEFL',
      note: 'Экзамен обновлён в январе 2026 года: результаты сообщаются по шкале 1–6 (балл 4 соответствует уровню B2 по CEFR); в переходный период также показывается оценка 0–120.',
      program: [
        'Reading — адаптивный раздел, академические и бытовые тексты',
        'Listening — диалоги, объявления и академические лекции',
        'Speaking — задания на повтор и интервью',
        'Writing — письмо, построение предложений и академическая дискуссия',
        'Полные пробные тесты с разбором каждого раздела',
      ],
    },
  },
  uz: {
    1: {
      title: 'Umumiy ingliz tili',
      description: "Barcha darajalar uchun keng qamrovli ingliz tili. Gapirish, yozish, o'qish va tinglash ko'nikmalari.",
      audience: "Kundalik va ishdagi ingliz tilini rivojlantirayotgan har bir kishi uchun — boshlang'ichdan erkin darajagacha",
      program: ['Grammatika A1–C2', 'Erkin muloqot', 'Biznes ingliz tili', "O'qish va yozish", 'Tinglab tushunish'],
    },
    2: {
      title: 'IELTS tayyorgarligi',
      description: "6.5–8.0 ball uchun maqsadli IELTS tayyorgarligi. To'rt ko'nikma bo'yicha ekspert strategiyalari.",
      audience: 'IELTS bali talab qilinadigan universitet yoki immigratsiya dasturlariga topshiruvchilar uchun',
      program: ['Writing Task 1 va 2', 'Speaking, 1–3-qism', "O'qish texnikalari", 'Tinglash mahorati', 'Sinov testlari va tahlil'],
    },
    3: {
      title: 'CEFR tayyorgarligi',
      description: "A1–C2 darajalari bo'yicha rasmiy CEFR sertifikatiga tayyorgarlik. Xalqaro tan olingan malaka.",
      audience: "O'qish yoki ish uchun rasmiy CEFR sertifikati kerak bo'lganlar uchun",
      program: ['CEFR daraja diagnostikasi', 'Darajaga mos grammatika', 'Har daraja uchun imtihon texnikasi', 'Speaking va writing tayyorgarligi', 'CEFR sinov imtihonlari'],
    },
    4: {
      title: 'Rus tilida matematika',
      description: 'Rus tilida matematika. Maktab dasturi, olimpiada tayyorgarligi va universitetga poydevor.',
      audience: "Rus tilida matematika o'qiyotgan maktab o'quvchilari uchun — maktab dasturi, olimpiadalar, universitetga kirish",
      program: ['Algebra va sonlar nazariyasi', 'Geometriya va trigonometriya', 'Funksiyalar va analiz asoslari', 'Ehtimollar nazariyasi va statistika', 'Masalalar yechish'],
    },
    5: {
      title: 'Westminster litsey va universitetiga tayyorgarlik',
      description: 'Westminster litseyi va universiteti kirish imtihonlariga maqsadli tayyorgarlik.',
      audience: 'Westminster litseyi va universitetiga topshiruvchilar uchun',
      program: ['Westminster imtihon formati', 'Matematika va ingliz tili birgalikda', 'Tanqidiy fikrlash', "O'tgan yillar variantlari", 'Suhbatga tayyorgarlik'],
    },
    6: {
      title: 'SAT Math',
      description: "SAT Math tayyorgarligi: Heart of Algebra, Advanced Math va ma'lumotlar tahlili.",
      audience: 'SAT natijalari talab qilinadigan universitetlarga topshiruvchilar uchun',
      program: ['Heart of Algebra', 'Advanced Math', "Masala yechish va ma'lumotlar tahlili", 'Geometriya', "Kalkulyatorli va kalkulyatorsiz bo'limlar"],
    },
    7: {
      title: 'Milliy sertifikat',
      description: "O'zbekistonning matematika bo'yicha milliy sertifikat imtihoniga tayyorgarlik.",
      audience: "Matematika bo'yicha milliy sertifikat imtihonini topshiruvchilar uchun",
      program: ['Milliy dasturni takrorlash', 'Imtihon formati va baholash', 'Tipik savollar', 'Tezlik va aniqlik', "To'liq sinov imtihonlari"],
    },
    8: {
      title: 'CSCA — matematika va fizika',
      description: "Matematika va fizika bo'yicha Xitoy CSCA standart imtihoniga tayyorgarlik.",
      audience: "Matematika va fizika bo'yicha CSCA imtihoniga tayyorlanayotganlar uchun",
      program: ['CSCA imtihon formati', 'Oliy matematika', 'Fizika masalalarini yechish', 'Xitoy akademik atamalari', 'Sinov imtihonlari'],
    },
    9: {
      title: 'Chet elliklar uchun rus tili',
      description: "Ona tili rus bo'lmaganlar uchun rus tili — to'liq ingliz tilida o'qitiladi.",
      audience: "Rus tilini ingliz tili orqali o'rganmoqchi bo'lganlar uchun",
      note: "Ingliz tilida o'qitiladi. Faqat individual va mini-guruh.",
      program: ['Kirill alifbosi va fonetika', 'Ingliz tilida grammatika asoslari', 'Kundalik muloqot', "O'qish va yozish", 'Rus madaniyati'],
    },
    10: {
      title: "Chet elliklar uchun o'zbek tili",
      description: "Ona tili o'zbek bo'lmaganlar uchun o'zbek tili — to'liq ingliz tilida o'qitiladi.",
      audience: "O'zbekistonda yashayotgan yoki ishlayotgan chet ellik mutaxassislar uchun",
      note: "Ingliz tilida o'qitiladi. Faqat individual va mini-guruh.",
      program: ["O'zbek alifbosi va talaffuz", 'Ingliz tilida asosiy grammatika', 'Kundalik muloqot', "O'qish va yozish", 'Madaniyat'],
    },
    11: {
      title: 'Nemis tili (A1 → C2)',
      description: "Noldan C2 gacha nemis tili. Goethe-Institut sertifikatiga to'liq tayyorgarlik kiritilgan.",
      audience: "Nemis tilini noldan o'rganayotganlar, shu jumladan Goethe sertifikati uchun",
      note: 'Faqat individual.',
      program: ['Fonetika va alifbo', 'Grammatika A1–C2', "Og'zaki nemis tili", 'Goethe imtihon strategiyalari', 'Goethe sinov imtihonlari'],
    },
    12: {
      title: 'Ispan tili',
      description: "Boshlang'ichdan yuqori darajagacha ispan tili tajribali o'qituvchilar bilan.",
      audience: "Ispan tilini noldan o'rganayotganlar, shu jumladan DELE va SIELE uchun",
      program: ['Ispan fonetikasi', 'Grammatika asoslari A1–C1', "Og'zaki ispan tili", "O'qish va yozish", 'DELE/SIELE tayyorgarligi'],
    },
    13: {
      title: 'TOEFL tayyorgarligi',
      description: "Yangilangan TOEFL iBT ga tayyorgarlik: ikki soatdan kamroq vaqtda to'rt bo'lim, CEFR ga bog'langan 1–6 shkala bo'yicha baholash.",
      audience: 'TOEFL natijalarini qabul qiladigan universitetlarga topshiruvchilar uchun',
      note: "Imtihon 2026-yil yanvarda yangilandi: natijalar 1–6 shkalada beriladi (4-ball CEFR B2 ga to'g'ri keladi); o'tish davrida 0–120 ball ham ko'rsatiladi.",
      program: [
        "Reading — moslashuvchan bo'lim, akademik va kundalik matnlar",
        "Listening — suhbatlar, e'lonlar va akademik ma'ruzalar",
        'Speaking — takrorlash va intervyu topshiriqlari',
        'Writing — xat, gap tuzish va akademik munozara',
        "Har bir bo'lim bo'yicha tahlil bilan to'liq sinov testlari",
      ],
    },
  },
};

// ── Teachers, by id. Names stay in Latin script in every language, so the card
//    heading and the biography under it always name the same person. ─────────
const teachers = {
  ru: {
    1: {
      subject: 'Общий английский и IELTS',
      short_bio: 'Экзаменатор IELTS с сертификатом Cambridge CELTA, 8 лет опыта.',
      full_bio: 'Sarah Mitchell — магистр прикладной лингвистики Манчестерского университета. Сертифицированный экзаменатор IELTS и преподаватель Cambridge CELTA; её ученики в среднем поднимают балл на 1.5 за три месяца.',
      education: 'Магистр прикладной лингвистики, Манчестерский университет',
    },
    2: {
      subject: 'CEFR и SAT English',
      short_bio: 'Специалист по SAT и CEFR. Бывший преподаватель Princeton Review, 1580 баллов SAT.',
      full_bio: 'James Anderson набрал 1580 баллов на SAT и работал преподавателем Princeton Review. Специализируется на сертификации CEFR и стратегической подготовке к SAT English.',
      education: 'Бакалавр английской литературы, Йельский университет',
    },
    3: {
      subject: 'Математика (все программы)',
      short_bio: 'PhD по математике. Специалист по Westminster, SAT, Milliy Sertifikat и CSCA.',
      full_bio: 'Dr. Amir Karimov имеет степень PhD по чистой математике. 92% поступлений в Westminster и более 50 идеальных результатов по SAT Math говорят сами за себя.',
      education: 'PhD по чистой математике, Национальный университет Узбекистана',
    },
    4: {
      subject: 'Китайские экзамены и CSCA',
      short_bio: 'Носитель китайского языка, экзаменатор CSCA, выпускница Пекинского университета.',
      full_bio: 'Li Wei Chen окончила Пекинский университет и специализируется на подготовке к CSCA по математике и физике. Более 200 учеников сдали CSCA под её руководством.',
      education: 'Бакалавр педагогики: китайский как иностранный, Пекинский университет',
    },
    5: {
      subject: 'Русский для иностранцев',
      short_bio: 'Сертифицированный преподаватель РКИ. Преподаёт русский полностью на английском.',
      full_bio: 'Natalia Ivanova — магистр русской филологии, преподаёт русский исключительно на английском языке, делая грамматику понятной для иностранных студентов.',
      education: 'Магистр русской филологии, Санкт-Петербургский государственный университет',
    },
    6: {
      subject: 'Узбекский для иностранцев',
      short_bio: 'Носитель узбекского языка. Преподаёт узбекский на английском для экспатов и иностранцев.',
      full_bio: 'Zulfiya Nazarova специализируется на преподавании узбекского как иностранного через английский. Работала с дипломатическим корпусом и бизнес-специалистами.',
      education: 'Бакалавр узбекской лингвистики, Национальный университет Узбекистана',
    },
    7: {
      subject: 'Немецкий язык и подготовка к Goethe',
      short_bio: 'Носитель немецкого языка. Сертифицированный преподаватель Goethe-Institut A1–C2 из Мюнхена.',
      full_bio: 'Klaus Müller — носитель немецкого языка из Мюнхена, сертифицирован Goethe-Institut. Ведёт учеников от полного нуля до C2 по индивидуальным планам.',
      education: 'Бакалавр немецкого языка и литературы, Мюнхенский университет Людвига-Максимилиана',
    },
    8: {
      subject: 'Испанский язык',
      short_bio: 'Носитель испанского из Мадрида. Экзаменатор DELE с шестилетним опытом.',
      full_bio: 'Isabella García — экзаменатор DELE из Мадрида. Её коммуникативная методика даёт быстрый практический результат от A1 до C1.',
      education: 'Бакалавр испанской филологии, Мадридский университет Комплутенсе',
    },
  },
  uz: {
    1: {
      subject: 'Umumiy ingliz tili va IELTS',
      short_bio: 'Cambridge CELTA sertifikatiga ega IELTS imtihonchisi, 8 yillik tajriba.',
      full_bio: "Sarah Mitchell — Manchester universitetining amaliy lingvistika magistri. Sertifikatlangan IELTS imtihonchisi va Cambridge CELTA o'qituvchisi; uning o'quvchilari uch oyda o'rtacha 1.5 ballga ko'tariladi.",
      education: 'Amaliy lingvistika magistri, Manchester universiteti',
    },
    2: {
      subject: 'CEFR va SAT English',
      short_bio: "SAT va CEFR bo'yicha mutaxassis. Sobiq Princeton Review o'qituvchisi, SAT dan 1580 ball.",
      full_bio: "James Anderson SAT dan 1580 ball to'plagan va Princeton Review o'qituvchisi bo'lgan. CEFR sertifikatlash va SAT English strategik tayyorgarligiga ixtisoslashgan.",
      education: 'Ingliz adabiyoti bakalavri, Yel universiteti',
    },
    3: {
      subject: 'Matematika (barcha dasturlar)',
      short_bio: "Matematika bo'yicha PhD. Westminster, SAT, Milliy sertifikat va CSCA bo'yicha mutaxassis.",
      full_bio: "Dr. Amir Karimov sof matematika bo'yicha PhD darajasiga ega. Westminsterga 92% qabul ko'rsatkichi va 50 dan ortiq mukammal SAT Math natijasi o'zi uchun gapiradi.",
      education: "Sof matematika bo'yicha PhD, O'zbekiston Milliy universiteti",
    },
    4: {
      subject: 'Xitoy imtihonlari va CSCA',
      short_bio: 'Xitoy tili sohibi, Pekin universitetini tugatgan CSCA imtihonchisi.',
      full_bio: "Li Wei Chen Pekin universitetini tamomlagan va CSCA matematika va fizika tayyorgarligiga ixtisoslashgan. Uning rahbarligida 200 dan ortiq o'quvchi CSCA dan o'tgan.",
      education: "Xitoy tilini chet tili sifatida o'qitish bakalavri, Pekin universiteti",
    },
    5: {
      subject: 'Chet elliklar uchun rus tili',
      short_bio: "RKI sertifikatiga ega o'qituvchi. Rus tilini to'liq ingliz tilida o'qitadi.",
      full_bio: "Natalia Ivanova rus filologiyasi magistri bo'lib, rus tilini faqat ingliz tili orqali o'qitadi — bu grammatikani xalqaro talabalar uchun tushunarli qiladi.",
      education: 'Rus filologiyasi magistri, Sankt-Peterburg davlat universiteti',
    },
    6: {
      subject: "Chet elliklar uchun o'zbek tili",
      short_bio: "O'zbek tili sohibi. Chet elliklar uchun o'zbek tilini ingliz tilida o'qitadi.",
      full_bio: "Zulfiya Nazarova o'zbek tilini chet tili sifatida ingliz tili orqali o'qitishga ixtisoslashgan. Diplomatik korpus va biznes mutaxassislari bilan ishlagan.",
      education: "O'zbek tilshunosligi bakalavri, O'zbekiston Milliy universiteti",
    },
    7: {
      subject: 'Nemis tili va Goethe tayyorgarligi',
      short_bio: "Nemis tili sohibi. Myunxendan Goethe-Institut sertifikatiga ega A1–C2 o'qituvchisi.",
      full_bio: "Klaus Müller — Myunxenlik nemis tili sohibi, Goethe-Institut sertifikatiga ega. O'quvchilarni noldan C2 gacha individual reja bo'yicha olib boradi.",
      education: 'Nemis tili va adabiyoti bakalavri, Lyudvig-Maksimilian universiteti',
    },
    8: {
      subject: 'Ispan tili',
      short_bio: 'Madridlik ispan tili sohibi. Olti yillik tajribaga ega DELE imtihonchisi.',
      full_bio: 'Isabella García — Madridlik DELE imtihonchisi. Uning kommunikativ metodikasi A1 dan C1 gacha tez va amaliy natija beradi.',
      education: 'Ispan filologiyasi bakalavri, Madrid Komplutense universiteti',
    },
  },
};

// ── Price-table rows, by id. The table lists a couple of entries that are not
//    courses in their own right (SAT — Math & English), so it needs its own map.
const priceCourses = {
  ru: {
    1: 'Общий английский',
    2: 'Подготовка к IELTS',
    3: 'Подготовка к CEFR',
    4: 'Математика на русском',
    5: 'Подготовка к Westminster',
    6: 'SAT — математика',
    7: 'Milliy Sertifikat',
    8: 'CSCA: математика и физика',
    9: 'Русский для иностранцев',
    10: 'Узбекский для иностранцев',
    11: 'Немецкий (A1–C2)',
    12: 'Испанский',
    13: 'Подготовка к TOEFL',
    14: 'SAT — математика и английский',
  },
  uz: {
    1: 'Umumiy ingliz tili',
    2: 'IELTS tayyorgarligi',
    3: 'CEFR tayyorgarligi',
    4: 'Rus tilida matematika',
    5: 'Westminster tayyorgarligi',
    6: 'SAT — matematika',
    7: 'Milliy sertifikat',
    8: 'CSCA: matematika va fizika',
    9: 'Chet elliklar uchun rus tili',
    10: "Chet elliklar uchun o'zbek tili",
    11: 'Nemis tili (A1–C2)',
    12: 'Ispan tili',
    13: 'TOEFL tayyorgarligi',
    14: 'SAT — matematika va ingliz tili',
  },
};

// Prices are stored as free text ("2,500,000 UZS/month"). Only the unit needs
// translating; the figures are left exactly as they were entered.
const priceUnit = { ru: 'UZS/мес', uz: 'UZS/oyiga' };

// ── Helpers ─────────────────────────────────────────────────────────────────

// One stored value: a format, a duration, a level, a certificate.
export function tPhrase(value, lang) {
  if (typeof value !== 'string') return value;
  return phrases[lang]?.[value.trim()] ?? value;
}

export function tCategory(value, lang) {
  return categories[lang]?.[value] ?? value;
}

export function tPrice(value, lang) {
  if (typeof value !== 'string' || !priceUnit[lang]) return value;
  return value.replace(/UZS\s*\/\s*month/gi, priceUnit[lang]);
}

// Experience is stored as free text in English ("8 years"). Pull the number out
// and let each language supply its own wording, so a Russian page never reads
// "8 years опыта". Anything without a number is shown as entered.
export function tExperience(value, t, lang) {
  const years = String(value ?? '').match(/\d+/);
  if (!years) return value;
  const n = Number(years[0]);
  if (lang !== 'ru') return t('exp_years', { n });
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return t('exp_years_one', { n });
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return t('exp_years_few', { n });
  return t('exp_years_many', { n });
}

export function tCourse(course, lang) {
  if (!course) return course;
  const tr = courses[lang]?.[course.id] ?? {};
  return {
    ...course,
    title: tr.title ?? course.title,
    description: tr.description ?? course.description,
    audience: tr.audience ?? course.audience,
    note: tr.note ?? course.note,
    program: tr.program ?? course.program,
    categoryLabel: tCategory(course.category, lang),
    formats: course.formats?.map((f) => tPhrase(f, lang)),
    duration: tPhrase(course.duration, lang),
    levels: tPhrase(course.levels, lang),
    price_individual: tPrice(course.price_individual, lang),
  };
}

export function tTeacher(teacher, lang) {
  if (!teacher) return teacher;
  const tr = teachers[lang]?.[teacher.id] ?? {};
  return {
    ...teacher,
    subject: tr.subject ?? teacher.subject,
    short_bio: tr.short_bio ?? teacher.short_bio,
    full_bio: tr.full_bio ?? teacher.full_bio,
    education: tr.education ?? teacher.education,
    certifications: teacher.certifications?.map((c) => tPhrase(c, lang)),
  };
}

export function tPriceRow(row, lang) {
  if (!row) return row;
  return {
    ...row,
    course: priceCourses[lang]?.[row.id] ?? row.course,
    individual: tPrice(row.individual, lang),
    mini_group: tPrice(row.mini_group, lang),
    group: tPrice(row.group, lang),
  };
}
