 "use client";

 import { useEffect, useState } from "react";
 import ChatPanel from "./components/ChatPanel";
 import PlannerPanel from "./components/PlannerPanel";
 
 type Language = "en" | "ru" | "kk";
 
 const copy = {
   en: {
     nav: {
       capabilities: "Capabilities",
       platforms: "Platforms",
       console: "Console",
       pipeline: "Pipeline",
       start: "Get Started"
     },
     cta: {
       demo: "Request Demo",
       launch: "Launch Prototype",
       deck: "Download Deck",
       headline: "Ready to launch Hephaestus?",
       subhead: "We can deliver an MVP in 4–6 weeks tailored to your industry.",
       roadmap: "Get Roadmap",
       contact: "Contact Us"
     },
     hero: {
       eyebrow: "TECHNO-CYBER AI ASSISTANT",
       titleA: "Hephaestus —",
       titleB: " intelligence",
       titleC: " that forges",
       titleD: " solutions",
       body:
         "A next-gen chat assistant. Generates text and code, analyzes photos/videos/audio, plans tasks, and connects to your systems.",
       stats: ["platforms", "analysis modules", "integrations"]
     },
     panel: {
       lines: ["file analysis…", "code generation…", "planning…", "integrations…", "Done: 0.34s"]
     },
     sections: {
       capabilities: "Capabilities",
       platforms: "Platforms",
       console: "Hephaestus Console",
       pipeline: "Intelligence Pipeline"
     },
     cards: {
       c1: ["Chat & Code", "Smart dialog, code generation, refactoring, and explanations."],
       c2: ["Files & Media", "Audio, video, images — analysis, summaries, data extraction."],
       c3: ["Planner", "Tasks, habits, sessions, reminders, and team coordination."],
       c4: ["Integrations", "CRM, trackers, email, knowledge bases, and enterprise APIs."],
       c5: ["Security", "Modular access policies, auditing, and role separation."],
       c6: ["Adaptivity", "Personal profiles, tone control, and style presets."]
     },
     platforms: {
       web: "Next.js UI with live streaming responses.",
       desktop: "Electron with local cache and offline mode.",
       mobile: "Flutter for iOS and Android with pushes and widgets."
     },
     pipeline: [
       ["Context", "Profiles, memory, knowledge, and preferences."],
       ["Perception", "Speech, images, video, and documents."],
       ["Reasoning", "Planning, generation, and risk evaluation."],
       ["Action", "Integrations, tasks, reporting, automation."]
     ],
     chat: {
       title: "Hephaestus Console",
       subtitle: "Chat, files, and providers.",
       placeholder: "Type your request...",
       send: "Send",
       uploading: "...",
       upload: "Upload File",
       analyze: "Analyze File",
       fileLabel: "File",
       readyMessage: "Ready to work. What should we forge today?",
       connectionError: "Connection error.",
       errorPrefix: "Error",
       analysisTitle: "Analysis Result",
       noData: "No data"
     },
     planner: {
       title: "Planner",
       subtitle: "Create tasks and sync with integrations.",
       placeholder: "New task",
       add: "Add",
       status: "Status"
     },
     languages: {
       label: "Language",
       en: "EN",
       ru: "RU",
       kk: "KZ"
     }
   },
   ru: {
     nav: {
       capabilities: "Возможности",
       platforms: "Платформы",
       console: "Консоль",
       pipeline: "Пайплайн",
       start: "Старт"
     },
     cta: {
       demo: "Запросить демо",
       launch: "Запустить прототип",
       deck: "Скачать презентацию",
       headline: "Готовы к запуску Hephaestus?",
       subhead: "Мы подготовим MVP за 4–6 недель с фокусом на вашу отрасль.",
       roadmap: "Получить дорожную карту",
       contact: "Связаться"
     },
     hero: {
       eyebrow: "TECHNO-CYBER AI ASSISTANT",
       titleA: "Hephaestus —",
       titleB: " интеллект,",
       titleC: " который кует",
       titleD: " решения",
       body:
         "Чат-ассистент нового поколения. Генерирует текст и код, анализирует фото/видео/аудио, планирует задачи и подключается к вашим системам.",
       stats: ["платформы", "модулей анализа", "интеграций"]
     },
     panel: {
       lines: ["анализ файлов…", "генерация кода…", "планирование…", "интеграции…", "Готово: 0.34s"]
     },
     sections: {
       capabilities: "Возможности",
       platforms: "Платформы",
       console: "Консоль Hephaestus",
       pipeline: "Пайплайн интеллекта"
     },
     cards: {
       c1: ["Чат и код", "Умный диалог, генерация кода, рефакторинг и объяснения."],
       c2: ["Файлы и медиа", "Аудио, видео, изображения — анализ, резюме, извлечение данных."],
       c3: ["Планировщик", "Задачи, привычки, сессии, напоминания и командная координация."],
       c4: ["Интеграции", "CRM, трекеры, почта, базы знаний и корпоративные API."],
       c5: ["Безопасность", "Модульные политики доступа, аудит, разграничение ролей."],
       c6: ["Адаптивность", "Персональные профили, динамика тональности, style-сеты."]
     },
     platforms: {
       web: "Next.js UI с живым стримингом ответов.",
       desktop: "Electron с локальным кэшем и офлайн-режимом.",
       mobile: "Flutter для iOS и Android с пушами и виджетами."
     },
     pipeline: [
       ["Контекст", "Профили, память, знания и предпочтения."],
       ["Восприятие", "Речь, изображения, видео и документы."],
       ["Мышление", "Планирование, генерация, оценка рисков."],
       ["Действия", "Интеграции, задачи, отчеты, автоматизация."]
     ],
     chat: {
       title: "Консоль Hephaestus",
       subtitle: "Чат, файлы, провайдеры.",
       placeholder: "Введите запрос...",
       send: "Отправить",
       uploading: "...",
       upload: "Загрузить файл",
       analyze: "Анализировать файл",
       fileLabel: "Файл",
       readyMessage: "Готов к работе. Что ковать сегодня?",
       connectionError: "Ошибка соединения.",
       errorPrefix: "Ошибка",
       analysisTitle: "Результат анализа",
       noData: "Нет данных"
     },
     planner: {
       title: "Планировщик",
       subtitle: "Создавай задачи и синхронизируй с интеграциями.",
       placeholder: "Новая задача",
       add: "Добавить",
       status: "Статус"
     },
     languages: {
       label: "Язык",
       en: "EN",
       ru: "RU",
       kk: "KZ"
     }
   },
   kk: {
     nav: {
       capabilities: "Мүмкіндіктер",
       platforms: "Платформалар",
       console: "Консоль",
       pipeline: "Пайплайн",
       start: "Бастау"
     },
     cta: {
       demo: "Демо сұрау",
       launch: "Прототипті іске қосу",
       deck: "Презентацияны жүктеу",
       headline: "Hephaestus іске қосуға дайынсыз ба?",
       subhead: "Салаңызға бейімделген MVP-ді 4–6 аптада дайындаймыз.",
       roadmap: "Жол картасын алу",
       contact: "Байланысу"
     },
     hero: {
       eyebrow: "TECHNO-CYBER AI ASSISTANT",
       titleA: "Hephaestus —",
       titleB: " интеллект,",
       titleC: " шешімдерді",
       titleD: " соғатын",
       body:
         "Жаңа буын чат-ассистенті. Мәтін мен кодты генерациялайды, фото/видео/аудионы талдайды, тапсырмаларды жоспарлайды және жүйелеріңізбен интеграцияланады.",
       stats: ["платформа", "талдау модулі", "интеграция"]
     },
     panel: {
       lines: ["файл талдауы…", "код генерациясы…", "жоспарлау…", "интеграциялар…", "Дайын: 0.34s"]
     },
     sections: {
       capabilities: "Мүмкіндіктер",
       platforms: "Платформалар",
       console: "Hephaestus консолі",
       pipeline: "Интеллект пайплайны"
     },
     cards: {
       c1: ["Чат және код", "Ақылды диалог, код генерациясы, рефакторинг және түсіндіру."],
       c2: ["Файлдар және медиа", "Аудио, видео, бейне — талдау, қысқаша, дерек алу."],
       c3: ["Жоспарлаушы", "Тапсырмалар, әдеттер, сессиялар, еске салулар және команда үйлесімі."],
       c4: ["Интеграциялар", "CRM, трекерлер, пошта, білім базалары және корпоративтік API."],
       c5: ["Қауіпсіздік", "Қолжетімділік саясаты, аудит, рөлдерді бөлу."],
       c6: ["Бейімделу", "Жеке профильдер, үнді басқару, стиль пресеттері."]
     },
     platforms: {
       web: "Next.js UI және жауаптардың live стримингі.",
       desktop: "Electron және локалды кэш, офлайн режим.",
       mobile: "Flutter (iOS/Android) және push/виджеттер."
     },
     pipeline: [
       ["Контекст", "Профильдер, жады, білім және талғам."],
       ["Қабылдау", "Сөйлеу, бейне, видео және құжаттар."],
       ["Ойлау", "Жоспарлау, генерация, тәуекелді бағалау."],
       ["Әрекет", "Интеграциялар, тапсырмалар, есептер, автоматтандыру."]
     ],
     chat: {
       title: "Hephaestus консолі",
       subtitle: "Чат, файлдар, провайдерлер.",
       placeholder: "Сұраныс енгізіңіз...",
       send: "Жіберу",
       uploading: "...",
       upload: "Файл жүктеу",
       analyze: "Файлды талдау",
       fileLabel: "Файл",
       readyMessage: "Жұмысқа дайынмын. Нені соғамыз?",
       connectionError: "Қосылым қатесі.",
       errorPrefix: "Қате",
       analysisTitle: "Талдау нәтижесі",
       noData: "Дерек жоқ"
     },
     planner: {
       title: "Жоспарлаушы",
       subtitle: "Тапсырма құрып, интеграциялармен синхрондаңыз.",
       placeholder: "Жаңа тапсырма",
       add: "Қосу",
       status: "Мәртебе"
     },
     languages: {
       label: "Тіл",
       en: "EN",
       ru: "RU",
       kk: "KZ"
     }
   }
 };
 
export default function HomePage() {
  const [lang, setLang] = useState<Language>("en");
 
  useEffect(() => {
    const saved = window.localStorage.getItem("hephaestus_lang");
    if (saved === "en" || saved === "ru" || saved === "kk") {
      setLang(saved);
      return;
    }
 
    const browserLang = navigator.language.toLowerCase();
    if (browserLang.startsWith("ru")) {
      setLang("ru");
      return;
    }
    if (browserLang.startsWith("kk")) {
      setLang("kk");
    }
  }, []);
 
  useEffect(() => {
    window.localStorage.setItem("hephaestus_lang", lang);
  }, [lang]);

  const t = copy[lang];
 
   return (
     <main className="page">
       <header className="topbar">
         <div className="logo">Hephaestus</div>
         <nav className="nav">
           <a href="#capabilities">{t.nav.capabilities}</a>
           <a href="#platforms">{t.nav.platforms}</a>
           <a href="#console">{t.nav.console}</a>
           <a href="#pipeline">{t.nav.pipeline}</a>
           <a href="#start">{t.nav.start}</a>
         </nav>
         <div className="lang">
           <span>{t.languages.label}</span>
           <div className="lang-buttons">
             <button className={lang === "en" ? "primary" : "ghost"} onClick={() => setLang("en")}>
               {t.languages.en}
             </button>
             <button className={lang === "ru" ? "primary" : "ghost"} onClick={() => setLang("ru")}>
               {t.languages.ru}
             </button>
             <button className={lang === "kk" ? "primary" : "ghost"} onClick={() => setLang("kk")}>
               {t.languages.kk}
             </button>
           </div>
         </div>
         <button className="ghost">{t.cta.demo}</button>
       </header>
 
       <section className="hero">
         <div className="hero-copy">
           <div className="eyebrow">{t.hero.eyebrow}</div>
           <h1>
             {t.hero.titleA}
             <span>{t.hero.titleB}</span>
             <span>{t.hero.titleC}</span>
             <span>{t.hero.titleD}</span>
           </h1>
           <p>{t.hero.body}</p>
           <div className="hero-actions">
             <button className="primary">{t.cta.launch}</button>
             <button className="ghost">{t.cta.deck}</button>
           </div>
           <div className="hero-stats">
             <div>
               <strong>4</strong>
               <span>{t.hero.stats[0]}</span>
             </div>
             <div>
               <strong>5+</strong>
               <span>{t.hero.stats[1]}</span>
             </div>
             <div>
               <strong>∞</strong>
               <span>{t.hero.stats[2]}</span>
             </div>
           </div>
         </div>
         <div className="hero-panel">
           <div className="panel-head">
             <span>Session</span>
             <span className="pulse">ONLINE</span>
           </div>
           <div className="panel-body">
             <div className="panel-line">\\_ {t.panel.lines[0]}</div>
             <div className="panel-line">\\_ {t.panel.lines[1]}</div>
             <div className="panel-line">\\_ {t.panel.lines[2]}</div>
             <div className="panel-line">\\_ {t.panel.lines[3]}</div>
             <div className="panel-line accent">\\_ {t.panel.lines[4]}</div>
           </div>
           <div className="panel-footer">
             <span>Latency</span>
             <span>120ms</span>
           </div>
         </div>
       </section>
 
       <section id="capabilities" className="section">
         <h2>{t.sections.capabilities}</h2>
         <div className="grid-3">
           <article className="card">
             <h3>{t.cards.c1[0]}</h3>
             <p>{t.cards.c1[1]}</p>
           </article>
           <article className="card">
             <h3>{t.cards.c2[0]}</h3>
             <p>{t.cards.c2[1]}</p>
           </article>
           <article className="card">
             <h3>{t.cards.c3[0]}</h3>
             <p>{t.cards.c3[1]}</p>
           </article>
           <article className="card">
             <h3>{t.cards.c4[0]}</h3>
             <p>{t.cards.c4[1]}</p>
           </article>
           <article className="card">
             <h3>{t.cards.c5[0]}</h3>
             <p>{t.cards.c5[1]}</p>
           </article>
           <article className="card">
             <h3>{t.cards.c6[0]}</h3>
             <p>{t.cards.c6[1]}</p>
           </article>
         </div>
       </section>
 
       <section id="platforms" className="section">
         <h2>{t.sections.platforms}</h2>
         <div className="grid-3">
           <div className="platform">
             <h4>Web</h4>
             <p>{t.platforms.web}</p>
           </div>
           <div className="platform">
             <h4>Desktop</h4>
             <p>{t.platforms.desktop}</p>
           </div>
           <div className="platform">
             <h4>Mobile</h4>
             <p>{t.platforms.mobile}</p>
           </div>
         </div>
       </section>
 
       <section id="console" className="section">
         <h2>{t.sections.console}</h2>
         <ChatPanel labels={t.chat} />
         <PlannerPanel labels={t.planner} />
       </section>
 
       <section id="pipeline" className="section">
         <h2>{t.sections.pipeline}</h2>
         <div className="pipeline">
           {t.pipeline.map((item, index) => (
             <div key={item[0]}>
               <span>{String(index + 1).padStart(2, "0")}</span>
               <h4>{item[0]}</h4>
               <p>{item[1]}</p>
             </div>
           ))}
         </div>
       </section>
 
       <section id="start" className="cta">
         <h2>{t.cta.headline}</h2>
         <p>{t.cta.subhead}</p>
         <div className="hero-actions">
           <button className="primary">{t.cta.roadmap}</button>
           <button className="ghost">{t.cta.contact}</button>
         </div>
       </section>
 
       <footer className="footer">
         <span>Hephaestus AI Systems</span>
         <span>© 2026</span>
       </footer>
     </main>
   );
 }
