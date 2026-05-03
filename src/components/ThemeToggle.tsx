import { Moon, Sun, MonitorSmartphone } from "lucide-react";
import { useTheme, type ThemeMode } from "@/lib/theme/ThemeProvider";
import { SegmentedControl, type SegmentedOption } from "@/components/ui";

const options: ReadonlyArray<SegmentedOption<ThemeMode>> = [
  { value: "light", label: "Light" },
  { value: "system", label: "Auto" },
  { value: "dark", label: "Dark" },
];

export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  return (
    <SegmentedControl
      options={options}
      value={mode}
      onChange={setMode}
      tone="surface"
      ariaLabel="Theme"
    />
  );
}

export function ThemeIcon({ mode }: { mode: ThemeMode }) {
  if (mode === "light") return <Sun className="size-4" />;
  if (mode === "dark") return <Moon className="size-4" />;
  return <MonitorSmartphone className="size-4" />;
}
