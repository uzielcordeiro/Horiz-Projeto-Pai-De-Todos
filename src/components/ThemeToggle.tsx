import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  // 1. Ao carregar, verifica se existe a palavra "dark" guardada no localStorage
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") === "dark";
    }
    return false;
  });

  useEffect(() => {
    // 2. Aplica ou remove a classe visual no HTML, mantendo a sua função intacta
    document.documentElement.classList.toggle("dark", dark);
    
    // 3. Grava a escolha atual na memória do navegador
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const label = dark ? "Ativar modo claro" : "Ativar modo escuro";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      aria-pressed={dark}
      onClick={() => setDark((value) => !value)}
      className="h-14 w-12 shrink-0 rounded-xl bg-transparent text-muted-foreground [&_svg]:size-8 hover:bg-transparent hover:text-foreground"
    >
      {dark ? <Sun size={30} strokeWidth={2} /> : <Moon size={30} strokeWidth={2} />}
    </Button>
  );
}
