import { SUPPORT_EMAIL } from "@/lib/contact";
import { SiteLink, useSite } from "../nav";
import { useSiteT } from "../hooks/useSiteLang";
import { Grain, Halo, Wrap } from "./layout";
import { LangToggle } from "./LangToggle";
import { WORDMARK } from "./SiteNav";

const colHead =
  "mb-4 mt-0 font-mono text-[11px] font-medium uppercase tracking-[.1em] text-site-tx3 rtl:font-site-ar rtl:tracking-normal";
// Columns size to their content (≥900px) and long values wrap — the design's
// equal columns let the email run into the Legal column.
const colLink =
  "block py-[6px] text-[14px] text-earth-muted no-underline [overflow-wrap:anywhere] hover:text-earth";

/** Site footer (design #foot). */
export function SiteFooter() {
  const { t } = useSiteT();
  const { page } = useSite();
  const home = page === "home" ? "" : "/";
  return (
    <footer
      id="foot"
      className="relative overflow-hidden border-t border-site-line bg-[linear-gradient(180deg,#141110,#0C0A09)] pb-9 pt-[72px]"
    >
      <Halo
        style={{
          width: 520,
          height: 320,
          background: "rgba(255,139,2,.18)",
          insetInlineEnd: -120,
          bottom: -200,
        }}
      />
      <Wrap className="relative">
        <div className="grid grid-cols-1 gap-11 min-[900px]:grid-cols-[1.1fr_2fr]">
          <div>
            <img
              src={WORDMARK}
              alt="Forma"
              width={125}
              height={40}
              className="h-10 w-auto"
            />
            <p className="mb-0 mt-[18px] max-w-[28em] text-[14px] text-site-tx3">
              {t("shell.foot.tagline")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 min-[900px]:grid-cols-[repeat(4,auto)] min-[900px]:justify-between">
            <div>
              <h4 className={colHead}>{t("shell.foot.product")}</h4>
              <SiteLink to={`${home}#workspace`} className={colLink}>
                {t("shell.features")}
              </SiteLink>
              <SiteLink to={`${home}#how`} className={colLink}>
                {t("shell.nav.how")}
              </SiteLink>
              <SiteLink to={`${home}#pricing`} className={colLink}>
                {t("shell.nav.pricing")}
              </SiteLink>
            </div>
            <div>
              <h4 className={colHead}>{t("shell.foot.company")}</h4>
              <SiteLink to="/contact" className={colLink}>
                {t("shell.nav.contact")}
              </SiteLink>
              {/* <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr" className={colLink}>{SUPPORT_EMAIL}</a> */}
            </div>
            <div>
              <h4 className={colHead}>{t("shell.foot.legal")}</h4>
              <SiteLink to="/terms" className={colLink}>
                {t("shell.terms")}
              </SiteLink>
              <SiteLink to="/privacy" className={colLink}>
                {t("shell.privacy")}
              </SiteLink>
              <SiteLink to="/cookies" className={colLink}>
                {t("shell.cookies")}
              </SiteLink>
            </div>
            <div>
              <h4 className={colHead}>{t("shell.foot.account")}</h4>
              <SiteLink to="" auth="login" className={colLink}>
                {t("shell.login")}
              </SiteLink>
              <SiteLink to="" auth="signup" className={colLink}>
                {t("shell.start")}
              </SiteLink>
            </div>
          </div>
        </div>
        <div className="mt-14 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-site-line pt-6 font-mono text-[11px] text-site-tx4">
          <span>
            © {new Date().getFullYear()} Forma ·{" "}
            <span>{t("shell.foot.rights")}</span>
          </span>
          <span className="flex items-center gap-5">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              dir="ltr"
              className="text-site-tx3 no-underline hover:text-earth"
            >
              {SUPPORT_EMAIL}
            </a>
            <LangToggle />
          </span>
        </div>
      </Wrap>
      <Grain />
    </footer>
  );
}
