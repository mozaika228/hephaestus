import "./globals.css";

export const metadata = {
  title: "Hephaestus",
  description: "Hephaestus Ч мультиплатформенный AI ассистент: чат, код, файлы, планирование, интеграции."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <div className="aura" aria-hidden="true" />
        <div className="grid" aria-hidden="true" />
        <div className="noise" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
