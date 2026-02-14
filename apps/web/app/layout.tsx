import "./globals.css";

export const metadata = {
  title: "Hephaestus",
  description: "Hephaestus — a multi-platform AI assistant: chat, code, files, planning, integrations."
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
