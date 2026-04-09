import type { Metadata } from "next";
import { Inter } from "next/font/google"; // ဥပမာ Font (သင်သုံးထားသော Font ကို ဆက်သုံးပါ)
import "./globals.css";
import { ThemeProvider } from "../components/ThemeProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Myanmar EV Smart Planner",
  description: "Smart charging and EPC schedule planner for EVs in Myanmar",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning သည် Theme ပြောင်းချိန်တွင် Error မတက်ရန်ဖြစ်သည်
    <html lang="en" suppressHydrationWarning> 
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}