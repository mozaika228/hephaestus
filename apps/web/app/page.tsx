import ChatPanel from "./components/ChatPanel";
import PlannerPanel from "./components/PlannerPanel";

export default function HomePage() {
  return (
    <main className="page">
      <header className="topbar">
        <div className="logo">Hephaestus</div>
        <nav className="nav">
          <a href="#capabilities">Возможности</a>
          <a href="#platforms">Платформы</a>
          <a href="#console">Консоль</a>
          <a href="#pipeline">Пайплайн</a>
          <a href="#start">Старт</a>
        </nav>
        <button className="ghost">Запросить демо</button>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">TECHNO-CYBER AI ASSISTANT</div>
          <h1>
            Hephaestus —
            <span> интеллект,</span>
            <span> который кует</span>
            <span> решения</span>
          </h1>
          <p>
            Чат-ассистент нового поколения. Генерирует текст и код, анализирует
            фото/видео/аудио, планирует задачи и подключается к вашим системам.
          </p>
          <div className="hero-actions">
            <button className="primary">Запустить прототип</button>
            <button className="ghost">Скачать презентацию</button>
          </div>
          <div className="hero-stats">
            <div>
              <strong>4</strong>
              <span>платформы</span>
            </div>
            <div>
              <strong>5+</strong>
              <span>модулей анализа</span>
            </div>
            <div>
              <strong>?</strong>
              <span>интеграций</span>
            </div>
          </div>
        </div>
        <div className="hero-panel">
          <div className="panel-head">
            <span>Session</span>
            <span className="pulse">ONLINE</span>
          </div>
          <div className="panel-body">
            <div className="panel-line">\_ анализ файлов…</div>
            <div className="panel-line">\_ генерация кода…</div>
            <div className="panel-line">\_ планирование…</div>
            <div className="panel-line">\_ интеграции…</div>
            <div className="panel-line accent">\_ Готово: 0.34s</div>
          </div>
          <div className="panel-footer">
            <span>Latency</span>
            <span>120ms</span>
          </div>
        </div>
      </section>

      <section id="capabilities" className="section">
        <h2>Возможности</h2>
        <div className="grid-3">
          <article className="card">
            <h3>Чат и код</h3>
            <p>Умный диалог, генерация кода, рефакторинг и объяснения.</p>
          </article>
          <article className="card">
            <h3>Файлы и медиа</h3>
            <p>Аудио, видео, изображения — анализ, резюме, извлечение данных.</p>
          </article>
          <article className="card">
            <h3>Планировщик</h3>
            <p>Задачи, привычки, сессии, напоминания и командная координация.</p>
          </article>
          <article className="card">
            <h3>Интеграции</h3>
            <p>CRM, трекеры, почта, базы знаний и корпоративные API.</p>
          </article>
          <article className="card">
            <h3>Безопасность</h3>
            <p>Модульные политики доступа, аудит, разграничение ролей.</p>
          </article>
          <article className="card">
            <h3>Адаптивность</h3>
            <p>Персональные профили, динамика тональности, style-сеты.</p>
          </article>
        </div>
      </section>

      <section id="platforms" className="section">
        <h2>Платформы</h2>
        <div className="grid-3">
          <div className="platform">
            <h4>Web</h4>
            <p>Next.js UI с живым стримингом ответов.</p>
          </div>
          <div className="platform">
            <h4>Desktop</h4>
            <p>Electron с локальным кэшем и офлайн-режимом.</p>
          </div>
          <div className="platform">
            <h4>Mobile</h4>
            <p>Flutter для iOS и Android с пушами и виджетами.</p>
          </div>
        </div>
      </section>

      <section id="console" className="section">
        <h2>Консоль Hephaestus</h2>
        <ChatPanel />
        <PlannerPanel />
      </section>

      <section id="pipeline" className="section">
        <h2>Пайплайн интеллекта</h2>
        <div className="pipeline">
          <div>
            <span>01</span>
            <h4>Контекст</h4>
            <p>Профили, память, знания и предпочтения.</p>
          </div>
          <div>
            <span>02</span>
            <h4>Восприятие</h4>
            <p>Речь, изображения, видео и документы.</p>
          </div>
          <div>
            <span>03</span>
            <h4>Мышление</h4>
            <p>Планирование, генерация, оценка рисков.</p>
          </div>
          <div>
            <span>04</span>
            <h4>Действия</h4>
            <p>Интеграции, задачи, отчеты, автоматизация.</p>
          </div>
        </div>
      </section>

      <section id="start" className="cta">
        <h2>Готовы к запуску Hephaestus?</h2>
        <p>Мы подготовим MVP за 4–6 недель с фокусом на вашу отрасль.</p>
        <div className="hero-actions">
          <button className="primary">Получить дорожную карту</button>
          <button className="ghost">Связаться</button>
        </div>
      </section>

      <footer className="footer">
        <span>Hephaestus AI Systems</span>
        <span>© 2026</span>
      </footer>
    </main>
  );
}
