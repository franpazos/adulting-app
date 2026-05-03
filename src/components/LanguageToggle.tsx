import { useTranslation } from "react-i18next";
import { SegmentedControl, type SegmentedOption } from "@/components/ui";
import {
  SUPPORTED_LANGUAGES,
  type AppLanguage,
} from "@/lib/i18n";

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const current = (
    SUPPORTED_LANGUAGES.includes(i18n.language as AppLanguage)
      ? i18n.language
      : "en"
  ) as AppLanguage;

  const options: ReadonlyArray<SegmentedOption<AppLanguage>> = [
    { value: "en", label: "EN" },
    { value: "es", label: "ES" },
  ];

  return (
    <SegmentedControl
      options={options}
      value={current}
      onChange={(lng) => {
        void i18n.changeLanguage(lng);
      }}
      tone="surface"
      ariaLabel={t("settings.language")}
    />
  );
}
