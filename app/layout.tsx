import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Asta PowerProject Uploads",
  description: "Upload Asta PowerProject files and queue BI exports into Supabase."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
