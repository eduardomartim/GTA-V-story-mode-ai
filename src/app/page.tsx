import { Background } from "@/components/Background";
import { ChatApp } from "@/components/chat/ChatApp";
import { LangProvider } from "@/lib/ui/i18n";

export default function Home() {
  return (
    <>
      <Background />
      <LangProvider>
        <ChatApp />
      </LangProvider>
    </>
  );
}
