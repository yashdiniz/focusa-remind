import "@/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

// import { TRPCReactProvider } from "@/trpc/react";

export const metadata: Metadata = {
  title: "Remind",
  description: "Your personal assistant and accountability buddy. Using Llama 4 under the hood, you can use it to set reminders, help you answer basic queries, or just have a whole hearted chat.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout(
  {
    children,
  }: Readonly<{ children: React.ReactNode }>
) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body>
        {/* <TRPCReactProvider>{children}</TRPCReactProvider> */}
        {children}
      </body>
    </html>
  );
}
